export default {
    replaceRegexp: (str) => {
        str = str || "";
        str = str.toString();

        return str.replace(/(^\/)|(\/$)/g, "");
    }
}