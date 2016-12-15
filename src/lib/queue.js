import { EventEmitter } from "events";
import uri from "urijs";
import _ from "lodash";
import qs from "qs";
import md5 from "blueimp-md5";

const QUEUE_ITEM_INITIAL_DEPTH = 1;

export class Queue extends EventEmitter {
    /**
     * 构造函数
     * @param settings {object}
     *   ignoreWWWDomain   boolean       是否忽略www域名
     *   scanSubdomains    boolean       是否需要搜索子域名
     *   stripWWWDomain    boolean       是否严格的www域名
     *   host              string        当前的域名
     *   initialProtocol   string        默认协议
     *   initialPort       string        默认端口
     *   stripQuerystring  boolean       过滤掉参数
     *   fetchConditions   array         过滤地址条件数组
     *   domainWhiteList   array<string> 域名白名单
     *   filterByDomain    boolean       是否开启过滤域名白名单
     */
    constructor(settings) {
        super();

        this.ignoreWWWDomain = settings.ignoreWWWDomain == null ? true : settings.ignoreWWWDomain;
        this.scanSubdomains = settings.scanSubdomains == null ? false : settings.scanSubdomains;
        this.stripWWWDomain = settings.stripWWWDomain == null ? true : settings.stripWWWDomain;
        this.host = settings.host || "";
        this.initialProtocol = settings.initialProtocol || "http";
        this.domainWhiteList = settings.domainWhiteList;
        this.initialPort = settings.initialPort || 80;
        this._fetchConditions = settings.fetchConditions || [];
        this.filterByDomain = settings.filterByDomain == null ? true : settings.filterByDomain;
        this.stripQuerystring = settings.stripQuerystring == null ? true : settings.stripQuerystring;
        this.allowQueryParams = settings.allowQueryParams || [];
        this.urlEncoding = "iso8859";
    }

    /**
     * 去掉没用的搜索字符(^)
     * @param url
     * @returns {*}
     */
    removeUselessStr(url) {
        if (url.indexOf("^") > -1) {
            url = url.substr(0, url.indexOf("^"));
        }
        if (url.indexOf(encodeURIComponent("^")) > -1) {
            url = url.substr(0, url.indexOf(encodeURIComponent("^")));
        }
        return url;
    }

    /**
     * 去掉queryString
     * @param url {String} 链接
     * @returns {*}
     */
    removeQuerystring(url) {
        // url = decode
        if (url.indexOf("?") > -1) {
            return url.substr(0, url.indexOf("?"));
        }

        return url;
    }

    /**
     * 处理链接
     * @param URL  {String}
     * @param context {Object|String}
     * @returns {*}
     */
    processURL(URL, context) {
        let newURL;

        if (!context || typeof context !== "object") {
            context = {
                url: this.initialProtocol + "://" +
                    this.host + ":" +
                    this.initialPort + "/",
                depth: QUEUE_ITEM_INITIAL_DEPTH
            };
        }
        // If the URL didn't contain anything, don't fetch it.
        if (!(URL && URL.replace(/\s+/ig, "").length)) {
            return false;
        }
        // Check if querystring should be ignored
        this.stripQuerystring === true && (URL = this.removeQuerystring(URL));
        this.stripWWWDomain && URL.match(/https?\:\/\/(www\.).*/i) && (URL = URL.replace("www.", ""));

        URL = this.removeUselessStr(URL);

        try {
            newURL = uri(URL).absoluteTo(context.url).normalize();
            // if (this.urlEncoding === "iso8859") {
            //     newURL = newURL.iso8859();
            // }

            let queryString = newURL.query();

            // 只留下需要的querystring
            if (this.allowQueryParams && this.allowQueryParams.length && queryString) {
                let noSparse = qs.parse(queryString);

                newURL.query("");
                _.each(this.allowQueryParams, (qp) => {
                    if (noSparse[qp]) {
                        newURL.addQuery(qp, noSparse[qp]);
                    }
                });
            }
        } catch (e) {
            console.log(e.message);
            return false;
        }

        // simplecrawler uses slightly different terminology to URIjs. Sorry!
        return {
            protocol: newURL.protocol() || "http",
            host: newURL.hostname(),
            port: newURL.port() || 80,
            path: newURL.path(),
            uriPath: newURL.path(),
            query: newURL.query(),
            depth: context.depth + 1,
            url: newURL.toString()
        };
    }

    /**
     * 存储链接到queue
     * @param url   {String}
     * @param queueItem  {Object}
     * @returns {*}
     */
    queueURL(url, queueItem) {
        let parsedURL = typeof url === "object" ? url : this.processURL(url, queueItem);

        if (!parsedURL) return false;

        // 赋值一个ID
        if (queueItem && !queueItem.id) {
            queueItem._id = md5(queueItem.url);
        }
        let fetchDenied = this._fetchConditions.reduce((prev, callback) => {
            return prev || !callback(parsedURL, queueItem);
        }, false);

        if (fetchDenied) return false;

        // Check the domain is valid before adding it to the queue
        if (this.domainValid(parsedURL.host)) {
            return {
                protocol: parsedURL.protocol,
                host: parsedURL.host,
                query: parsedURL.query,
                port: parsedURL.port,
                path: parsedURL.path,
                depth: parsedURL.depth,
                url: parsedURL.url,
                _id: md5(parsedURL.url)
            };
        }

        return false;
    }

    /**
     * 判定域名是否合法
     * @param host    {String}
     * @returns {boolean|*}
     */
    domainValid(host) {
        let domainInWhitelist = (host) => {
            // If there's no whitelist, or the whitelist is of zero length,
            // just return false.
            if (!this.domainWhiteList || !this.domainWhiteList.length) {
                return false;
            }
            // Otherwise, scan through it.
            return !!this.domainWhiteList.reduce((prev, cur) => {
                // If we already located the relevant domain in the whitelist...
                if (prev) {
                    return prev;
                }
                // If the domain is just equal, return true.
                if (host === cur) {
                    return true;
                }

                // 正则匹配
                if (cur.constructor === Object && cur.regexp) {
                    return new RegExp(cur.regexp, cur.scope || "i").test(host);
                }

                // If we're ignoring WWW subdomains, and both domains,
                // less www. are the same, return true.
                if (this.ignoreWWWDomain && host === cur.replace(/^www\./i, "")) {
                    return true;
                }

                // Otherwise, sorry. No dice.
                return false;
            }, false);
        };
        let isSubdomainOf = (subdomain, host) => {
            subdomain = subdomain.toLowerCase();
            host = host.toLowerCase();
            // If we're ignoring www, remove it from both
            // (if www is the first domain component...)
            if (this.ignoreWWWDomain) {
                subdomain = subdomain.replace(/^www./ig, "");
                host = host.replace(/^www./ig, "");
            }
            // They should be the same flipped around!
            return subdomain.split("").reverse().join("").substr(0, host.length) === host.split("").reverse().join("");
        };

        if (this.ignoreWWWDomain) {
            host = host.replace(/^www\./i, "");
        }

        return !this.filterByDomain ||
            // Or if the domain is just the right one, return true.
            host === this.host ||
            // Or if we're ignoring WWW subdomains, and both domains,
            // less www. are the same, return true.
            (this.ignoreWWWDomain && this.host.replace(/^www\./i, "") === host.replace(/^www\./i, "")) ||
            // Or if the domain in question exists in the domain whitelist,
            // return true.
            domainInWhitelist(host) ||
            // Or if we're scanning subdomains, and this domain is a subdomain
            // of the crawler's set domain, return true.
            (this.scanSubdomains && isSubdomainOf(host, this.host));
    }
}