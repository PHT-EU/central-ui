import {consumeQueue} from "amqp-extension";
import {MessageQueueSelfRoutingKey} from "../../config/services/rabbitmq";
import {createImageDownloadComponentHandlers} from "../image-download";
import {createImageExtractComponentHandlers} from "../image-extract";
import {createImageStatusComponentHandlers} from "../image-status";

export function buildCommandRouterComponent() {
    function start() {
        return consumeQueue({routingKey: MessageQueueSelfRoutingKey.COMMAND}, {
            ...createImageDownloadComponentHandlers(),
            ...createImageExtractComponentHandlers(),
            ...createImageStatusComponentHandlers()
        });
    }

    return {
        start
    }
}
