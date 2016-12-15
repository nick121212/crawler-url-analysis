"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.Queue = undefined;

var _typeof2 = require("babel-runtime/helpers/typeof");

var _typeof3 = _interopRequireDefault(_typeof2);

var _getPrototypeOf = require("babel-runtime/core-js/object/get-prototype-of");

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require("babel-runtime/helpers/possibleConstructorReturn");

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require("babel-runtime/helpers/inherits");

var _inherits3 = _interopRequireDefault(_inherits2);

var _events = require("events");

var _urijs = require("urijs");

var _urijs2 = _interopRequireDefault(_urijs);

var _lodash = require("lodash");

var _lodash2 = _interopRequireDefault(_lodash);

var _qs = require("qs");

var _qs2 = _interopRequireDefault(_qs);

var _blueimpMd = require("blueimp-md5");

var _blueimpMd2 = _interopRequireDefault(_blueimpMd);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var QUEUE_ITEM_INITIAL_DEPTH = 1;

var Queue = exports.Queue = function (_EventEmitter) {
    (0, _inherits3.default)(Queue, _EventEmitter);

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
    function Queue(settings) {
        (0, _classCallCheck3.default)(this, Queue);

        var _this = (0, _possibleConstructorReturn3.default)(this, (Queue.__proto__ || (0, _getPrototypeOf2.default)(Queue)).call(this));

        _this.ignoreWWWDomain = settings.ignoreWWWDomain == null ? true : settings.ignoreWWWDomain;
        _this.scanSubdomains = settings.scanSubdomains == null ? false : settings.scanSubdomains;
        _this.stripWWWDomain = settings.stripWWWDomain == null ? true : settings.stripWWWDomain;
        _this.host = settings.host || "";
        _this.initialProtocol = settings.initialProtocol || "http";
        _this.domainWhiteList = settings.domainWhiteList;
        _this.initialPort = settings.initialPort || 80;
        _this._fetchConditions = settings.fetchConditions || [];
        _this.filterByDomain = settings.filterByDomain == null ? true : settings.filterByDomain;
        _this.stripQuerystring = settings.stripQuerystring == null ? true : settings.stripQuerystring;
        _this.allowQueryParams = settings.allowQueryParams || [];
        _this.urlEncoding = "iso8859";
        return _this;
    }

    /**
     * 去掉没用的搜索字符(^)
     * @param url
     * @returns {*}
     */


    (0, _createClass3.default)(Queue, [{
        key: "removeUselessStr",
        value: function removeUselessStr(url) {
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

    }, {
        key: "removeQuerystring",
        value: function removeQuerystring(url) {
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

    }, {
        key: "processURL",
        value: function processURL(URL, context) {
            var _this2 = this;

            var newURL = void 0;

            if (!context || (typeof context === "undefined" ? "undefined" : (0, _typeof3.default)(context)) !== "object") {
                context = {
                    url: this.initialProtocol + "://" + this.host + ":" + this.initialPort + "/",
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
                newURL = (0, _urijs2.default)(URL).absoluteTo(context.url).normalize();
                // if (this.urlEncoding === "iso8859") {
                //     newURL = newURL.iso8859();
                // }

                var queryString = newURL.query();

                // 只留下需要的querystring
                if (this.allowQueryParams && this.allowQueryParams.length && queryString) {
                    (function () {
                        var noSparse = _qs2.default.parse(queryString);

                        newURL.query("");
                        _lodash2.default.each(_this2.allowQueryParams, function (qp) {
                            if (noSparse[qp]) {
                                newURL.addQuery(qp, noSparse[qp]);
                            }
                        });
                    })();
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

    }, {
        key: "queueURL",
        value: function queueURL(url, queueItem) {
            var parsedURL = (typeof url === "undefined" ? "undefined" : (0, _typeof3.default)(url)) === "object" ? url : this.processURL(url, queueItem);

            if (!parsedURL) return false;

            // 赋值一个ID
            if (queueItem && !queueItem.id) {
                queueItem._id = (0, _blueimpMd2.default)(queueItem.url);
            }
            var fetchDenied = this._fetchConditions.reduce(function (prev, callback) {
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
                    _id: (0, _blueimpMd2.default)(parsedURL.url)
                };
            }

            return false;
        }

        /**
         * 判定域名是否合法
         * @param host    {String}
         * @returns {boolean|*}
         */

    }, {
        key: "domainValid",
        value: function domainValid(host) {
            var _this3 = this;

            var domainInWhitelist = function domainInWhitelist(host) {
                // If there's no whitelist, or the whitelist is of zero length,
                // just return false.
                if (!_this3.domainWhiteList || !_this3.domainWhiteList.length) {
                    return false;
                }
                // Otherwise, scan through it.
                return !!_this3.domainWhiteList.reduce(function (prev, cur) {
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
                    if (_this3.ignoreWWWDomain && host === cur.replace(/^www\./i, "")) {
                        return true;
                    }

                    // Otherwise, sorry. No dice.
                    return false;
                }, false);
            };
            var isSubdomainOf = function isSubdomainOf(subdomain, host) {
                subdomain = subdomain.toLowerCase();
                host = host.toLowerCase();
                // If we're ignoring www, remove it from both
                // (if www is the first domain component...)
                if (_this3.ignoreWWWDomain) {
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
            this.ignoreWWWDomain && this.host.replace(/^www\./i, "") === host.replace(/^www\./i, "") ||
            // Or if the domain in question exists in the domain whitelist,
            // return true.
            domainInWhitelist(host) ||
            // Or if we're scanning subdomains, and this domain is a subdomain
            // of the crawler's set domain, return true.
            this.scanSubdomains && isSubdomainOf(host, this.host);
        }
    }]);
    return Queue;
}(_events.EventEmitter);