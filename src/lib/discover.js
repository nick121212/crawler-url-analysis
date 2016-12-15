import { EventEmitter } from "events";
import uri from "urijs";
import _ from "lodash";

// 正则，用来匹配页面中的地址
const discoverRegex = [
        /\s(?:href|src)\s?=\s?(["']).*?\1/ig,
        /\s(?:href|src)\s?=\s?[^"'\s][^\s>]+/ig,
        /\s?url\((["']).*?\1\)/ig,
        /\s?url\([^"'].*?\)/ig,

        // This could easily duplicate matches above, e.g. in the case of
        // href="http://example.com"
        /http(s)?\:\/\/[^?\s><\'\"]+/ig,

        // This might be a bit of a gamble... but get hard-coded
        // strings out of javacript: URLs. They're often popup-image
        // or preview windows, which would otherwise be unavailable to us.
        // Worst case scenario is we make some junky requests.
        /^javascript\:[a-z0-9\$\_\.]+\(['"][^'"\s]+/ig,

        // Find srcset links
        (string) => {
            var result = /\ssrcset\s*=\s*(["'])(.*)\1/.exec(string);
            return Array.isArray(result) ? String(result[2]).split(",").map(function(string) {
                return string.replace(/\s?\w*$/, "").trim();
            }) : "";
        },

        // Find resources in <meta> redirects. We need to wrap these RegExp's in
        // functions because we only want to return the first capture group, not
        // the entire match. And we need two RegExp's because the necessary
        // attributes on the <meta> tag can appear in any order
        (string) => {
            var match = string.match(/<\s*meta[^>]*http-equiv=["']{0,1}refresh["']{0,1}[^>]*content=["']{0,1}[^"'>]*url=([^"'>]*)["']{0,1}[^>]*>/i);
            return Array.isArray(match) ? [match[1]] : undefined;
        },
        (string) => {
            var match = string.match(/<\s*meta[^>]*content=["']{0,1}[^"'>]*url=([^"'>]*)["']{0,1}[^>]*http-equiv=["']{0,1}refresh["']{0,1}[^>]*>/i);
            return Array.isArray(match) ? [match[1]] : undefined;
        },
        (string) => {
            var match = string.match(/<\s*meta[^>]*content=["']{0,1}[^"'>]*url=([^"'>]*)["']{0,1}[^>]*http-equiv=["']{0,1}refresh["']{0,1}[^>]*>/i);
            return Array.isArray(match) ? [match[1]] : undefined;
        }
    ],
    // 过滤掉静态资源
    suffixs = [
        "ico",
        "png",
        "jpg",
        "jpeg",
        "gif",
        "ttf",
        "css"
    ],
    // Matching MIME-types will be allowed to fetch further than max depth
    whitelistedMimeTypes = [
        /^text\/(css|javascript|ecmascript)/i,
        /^application\/javascript/i,
        /^application\/x-font/i,
        /^application\/font/i,
        /^image\//i,
        /^font\//i
    ];

export class DiscoverLinks extends EventEmitter {
    /**
     * 构造函数
     * @param settings  {object}
     *   parseHTMLComments {boolean} 是否需要搜索comments中的url
     *   parseScriptTags   {boolean} 是否需要搜索标签中的url
     *   allowedProtocols  {array} 允许的协议的列表
     *   blackPathList     {array} 不用爬的路径
     *   whitePathList     {array} 路径白名单
     *   userAgent         {string} ua
     *   _robotsTxts       {Object} 机器人应答信息
     *   fetchWhitelistedMimeTypesBelowMaxDepth {Boolean}
     *   maxDepth          {number} 最大深度
     * @param queue        {Object}
     */
    constructor(settings) {
        super();

        this.parseHTMLComments = settings.parseHTMLComments || false;
        this.parseScriptTags = settings.parseScriptTags || false;
        this.allowedProtocols = settings.allowedProtocols || ["http"];
        this.blackPathList = settings.blackPathList || [];
        this.whitePathList = settings.whitePathList || [];
        this.whitePathList.push(/^\/$/i);
        this.userAgent = settings.userAgent || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36";
        this._robotsTxts = [];
        this.fetchWhitelistedMimeTypesBelowMaxDepth = settings.fetchWhitelistedMimeTypesBelowMaxDepth || false;
        this.maxDepth = settings.maxDepth || 0;
        this.ignoreRobots = settings.ignoreRobots || true;
    }

    /**
     * 判断协议是否支持
     * @param URL {string} 链接地址
     * @returns boolean
     */
    protocolSupported(URL) {
        let protocol;

        try {
            protocol = uri(URL).protocol();

            if (!protocol) {
                protocol = "http";
            }
        } catch (e) {
            return false;
        }
        return this.allowedProtocols.reduce((prev, protocolCheck) => {
            return prev || !!protocolCheck.exec(protocol);
        });
    }

    /**
     * 后缀是否支持
     * @param suffix {string} 链接地址前缀
     * @returns boolean
     */
    extendSupported(suffix) {
        return !suffixs.some(function(value) {
            return value === suffix.toLowerCase();
        });
    }

    /**
     * 路径是否支持
     * @param path {string} 链接地址路径
     * @returns boolean
     */
    pathSupported(path) {
        let result;
        let check = (list) => {
            let filters = _.filter(list, (value) => {
                if (value.constructor === RegExp) {
                    return value.test(path);
                } else if (value.constructor === Function) {
                    return value(path);
                } else if (value.constructor === String) {
                    return value === path;
                }
                return false;
            });

            return filters.length > 0;
        };
        // 判断不在在黑名单里面么
        result = !check(this.blackPathList || []);
        // 是否在白名单里面
        result && (result = check(this.whitePathList || []));

        return result;
    }

    /**
     * 去掉一些没用的URL
     * @param urlMatch {array} 链接数组
     * @param queueItem {object}
     * @returns {arrray}
     */
    cleanExpandResources(urlMatch, queueItem) {
        if (!urlMatch) {
            return [];
        }

        return urlMatch
            .map(this.cleanURL.bind(this, queueItem))
            .reduce((list, URL) => {
                // Ensure URL is whole and complete
                try {
                    URL = uri(decodeURIComponent(URL))
                        .absoluteTo(queueItem.url)
                        .normalize();
                } catch (e) {
                    // console.log(e.message);
                    URL = null;
                }
                if (!URL) {
                    return list;
                }
                // url是否为空
                if (!URL.toString().length) {
                    return list;
                }
                // 判断协议是否支持
                if (!this.protocolSupported(URL.toString())) {
                    return list;
                }
                // maxDepth是否符合
                if (!this.depthAllowed(queueItem)) {
                    return list;
                }
                // 后缀名是否支持
                if (!this.extendSupported(URL.suffix())) {
                    return list;
                }
                // 路径是否需要爬
                if (!this.pathSupported(URL.path())) {
                    return list;
                }
                // 判断是否在机器人应答的允许列表中
                if (!this.ignoreRobots && !this.urlIsAllowed(URL)) {
                    return list;
                }
                // url是否已经存在列表中
                if (list.reduce(function(prev, current) {
                        return prev || current === URL.toString();
                    }, false)) {
                    return list;
                }

                return list.concat(URL.toString());
            }, []);
    }

    /**
     * 清理文本中的一些信息
     * @param queueItem {Object}
     * @param URL       {String}
     * @returns {*|string}
     */
    cleanURL(queueItem, URL) {
        return URL
            .replace(/^(?:\s*href|\s*src)\s*=+\s*/i, "")
            .replace(/^\s*/, "")
            .replace(/^(['"])(.*)\1$/, "$2")
            .replace(/^url\((.*)\)/i, "$1")
            .replace(/^javascript\:\s*([a-z0-9]*\(["'](.*)["']\))*.*/i, "$2")
            .replace(/^(['"])(.*)\1$/, "$2")
            .replace(/^\((.*)\)$/, "$1")
            .replace(/^\/\//, queueItem.protocol + "://")
            .replace(/\&amp;/gi, "&")
            .replace(/\&#38;/gi, "&")
            .replace(/\&#x00026;/gi, "&")
            .split("#")
            .shift()
            .trim();
    }

    /**
     * 深度是否允许爬取
     * @param queueItem
     * @returns {boolean|*}
     */
    depthAllowed(queueItem) {
        let belowMaxDepth = this.fetchWhitelistedMimeTypesBelowMaxDepth;

        if (typeof belowMaxDepth === "boolean") {
            belowMaxDepth = belowMaxDepth === false ? 0 : Infinity;
        }

        let whitelistedDepth = queueItem.depth - belowMaxDepth;

        return this.maxDepth === 0 ||
            queueItem.depth <= this.maxDepth ||
            whitelistedDepth <= this.maxDepth &&
            whitelistedMimeTypes.some(function(mimeCheck) {
                return mimeCheck.test(queueItem.stateData.contentType);
            });
    }

    /**
     * 判断链接是否合法
     * @param parsedURL {String} 链接
     * @returns {boolean}
     */
    urlIsAllowed(parsedURL) {
        if (typeof parsedURL === "object") {
            parsedURL = {
                protocol: parsedURL.protocol(),
                hostname: parsedURL.host(),
                port: parsedURL.port().toString(),
                path: parsedURL.path(),
                query: parsedURL.query()
            };
        }

        let formattedURL = uri(parsedURL).normalize().href(),
            allowed = false;

        // The punycode module sometimes chokes on really weird domain
        // names. Catching those errors to prevent crawler from crashing
        try {
            allowed = this._robotsTxts.reduce((result, robots) => {
                let allowed = robots.isAllowed(formattedURL, this.userAgent);
                return result !== undefined ? result : allowed;
            }, undefined);
        } catch (error) {
            // URL will be avoided
        }

        allowed !== undefined && console.log(`${formattedURL} is ${allowed === undefined ? "allow" : "disallow"}`);

        return allowed === undefined ? true : allowed;
    }

    /**
     * 发现页面中的链接
     * @param queueItem    {Object}
     * @returns {*}
     */
    discoverResources(queueItem) {
        if (!queueItem) {
            queueItem = {};
        }

        if (!queueItem.protocol) {
            queueItem.protocol = "http";
        }

        let resourceText = queueItem.responseBody || "";

        if (!this.parseHTMLComments) {
            resourceText = resourceText.replace(/<!--([\s\S]+?)-->/g, "");
        }

        if (!this.parseScriptTags) {
            resourceText = resourceText.replace(/<script(.*?)>([\s\S]*?)<\/script>/gi, "");
        }

        return discoverRegex
            .reduce((list, regex) => {
                let resources = typeof regex === "function" ?
                    regex(resourceText) :
                    resourceText.match(regex);

                return list.concat(
                    this.cleanExpandResources(resources, queueItem));
            }, [])
            .reduce((list, check) => {
                if (list.indexOf(check) < 0) {
                    return list.concat([check]);
                }

                return list;
            }, []);
    }
}