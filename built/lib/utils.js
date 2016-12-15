"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = {
    replaceRegexp: function replaceRegexp(str) {
        str = str || "";
        str = str.toString();

        return str.replace(/(^\/)|(\/$)/g, "");
    }
};