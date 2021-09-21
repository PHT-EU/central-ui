import {EntitySubscriberInterface, InsertEvent, UpdateEvent} from "typeorm";
import {buildServiceSecurityQueueMessage} from "../../service/queue";
import {Client} from "./index";
import {publishQueueMessage} from "../../../modules/message-queue";
import {ServiceSecurityComponent} from "../../../components/service-security";

export class AuthClientSubscriber implements EntitySubscriberInterface<Client> {
    listenTo(): Function | string {
        return Client;
    }

    async afterInsert(event: InsertEvent<Client>): Promise<any|void> {
        if(typeof event.entity.service_id === 'string') {
            const queueMessage = buildServiceSecurityQueueMessage(
                ServiceSecurityComponent.SYNC,
                event.entity.service_id,
                {
                    id: event.entity.id,
                    secret: event.entity.secret
                }
            );
            await publishQueueMessage(queueMessage);
        }
    }

    async afterUpdate(event: UpdateEvent<Client>): Promise<any|void> {
        if(typeof event.entity.service_id === 'string') {
            const queueMessage = buildServiceSecurityQueueMessage(
                ServiceSecurityComponent.SYNC,
                event.entity.service_id,
                {
                    id: event.entity.id,
                    secret: event.entity.secret
                }
            );
            await publishQueueMessage(queueMessage);
        }
    }
}
