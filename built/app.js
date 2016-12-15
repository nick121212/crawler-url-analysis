"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.queueResultUrl = undefined;

var _regenerator = require("babel-runtime/regenerator");

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require("babel-runtime/helpers/asyncToGenerator");

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _boom = require("boom");

var _boom2 = _interopRequireDefault(_boom);

var _lodash = require("lodash");

var _lodash2 = _interopRequireDefault(_lodash);

var _discover = require("./lib/discover");

var _queue = require("./lib/queue");

var _utils = require("./lib/utils");

var _utils2 = _interopRequireDefault(_utils);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var dealConfig = function dealConfig(config) {
    config.blackPathList = config.blackPathList || [];
    config.blackPathList = config.blackPathList.map(function (path) {
        return new RegExp(_utils2.default.replaceRegexp(path.regexp), path.scope);
    });
    // 查找enable是true的白名单
    config.whitePathList = _lodash2.default.filter(config.whitePathList, function (list) {
        return list.enable === true;
    });
    config.whitePathList = config.whitePathList.map(function (path) {
        return new RegExp(_utils2.default.replaceRegexp(path.regexp), path.scope);
    });

    return config;
};

var queueResultUrl = exports.queueResultUrl = function queueResultUrl(options) {
    return function () {
        var _ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(ctx, next) {
            var config, queue, allowUrls;
            return _regenerator2.default.wrap(function _callee$(_context) {
                while (1) {
                    switch (_context.prev = _context.next) {
                        case 0:
                            config = dealConfig(ctx.config);
                            queue = new _queue.Queue(config || {});
                            allowUrls = [];


                            if (ctx.queueItem.analysisResultUrls) {
                                ctx.queueItem.analysisResultUrls.forEach(function (url) {
                                    allowUrls.push(queue.queueURL(url, ctx.queueItem));
                                });
                                ctx.queueItem.analysisResultUrlResult = allowUrls.filter(function (url) {
                                    return url !== false;
                                });
                            }

                            _context.next = 6;
                            return next();

                        case 6:
                        case "end":
                            return _context.stop();
                    }
                }
            }, _callee, undefined);
        }));

        return function (_x, _x2) {
            return _ref.apply(this, arguments);
        };
    }();
};

exports.default = function (options) {
    return function () {
        var _ref2 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2(ctx, next) {
            var config, discover, queue, urls, allowUrls;
            return _regenerator2.default.wrap(function _callee2$(_context2) {
                while (1) {
                    switch (_context2.prev = _context2.next) {
                        case 0:
                            config = dealConfig(ctx.config);
                            discover = new _discover.DiscoverLinks(config || {});
                            queue = new _queue.Queue(config || {});
                            _context2.next = 5;
                            return discover.discoverResources(ctx.queueItem);

                        case 5:
                            urls = _context2.sent;
                            allowUrls = [];


                            urls.forEach(function (url) {
                                allowUrls.push(queue.queueURL(url, ctx.queueItem));
                            });

                            ctx.queueItem.analysisUrlResult = allowUrls.filter(function (url) {
                                return url !== false;
                            });

                            ctx.status.htmlAnalysis = true;

                            _context2.next = 12;
                            return next();

                        case 12:
                        case "end":
                            return _context2.stop();
                    }
                }
            }, _callee2, undefined);
        }));

        return function (_x3, _x4) {
            return _ref2.apply(this, arguments);
        };
    }();
};