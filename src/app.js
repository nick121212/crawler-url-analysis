import boom from "boom";
import _ from "lodash";
import { DiscoverLinks } from "./lib/discover";
import { Queue } from "./lib/queue";
import utils from "./lib/utils";

const dealConfig = (config) => {
    config.blackPathList = config.blackPathList || [];
    config.blackPathList = config.blackPathList.map((path) => {
        return new RegExp(utils.replaceRegexp(path.regexp), path.scope);
    });
    // 查找enable是true的白名单
    config.whitePathList = _.filter(config.whitePathList, (list) => {
        return list.enable === true;
    });
    config.whitePathList = config.whitePathList.map((path) => {
        return new RegExp(utils.replaceRegexp(path.regexp), path.scope);
    });

    return config;
}

export const queueResultUrl = (options) => {
    return async(ctx, next) => {
        let config = dealConfig(ctx.config);
        let queue = new Queue(config || {});
        let allowUrls = [];

        if (ctx.queueItem.analysisResultUrls) {
            ctx.queueItem.analysisResultUrls.forEach((url) => {
                allowUrls.push(queue.queueURL(url, ctx.queueItem));
            });
            ctx.queueItem.analysisResultUrlResult = allowUrls.filter((url) => {
                return url !== false;
            });
        }

        await next();
    };
}

export default (options) => {
    return async(ctx, next) => {
        let config = dealConfig(ctx.config);
        let discover = new DiscoverLinks(config || {});
        let queue = new Queue(config || {});
        let urls = await discover.discoverResources(ctx.queueItem);
        let allowUrls = [];

        urls.forEach((url) => {
            allowUrls.push(queue.queueURL(url, ctx.queueItem));
        });

        ctx.queueItem.analysisUrlResult = allowUrls.filter((url) => {
            return url !== false;
        });

        ctx.status.htmlAnalysis = true;

        await next();
    };
}