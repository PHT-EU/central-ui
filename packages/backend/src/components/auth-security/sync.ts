/*
 * Copyright (c) 2021-2021.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {Message} from "amqp-extension";
import {
    AuthClientType,
    ensureHarborProjectWebHook,
    HarborProjectWebhook,
    REGISTRY_INCOMING_PROJECT_NAME,
    REGISTRY_MASTER_IMAGE_PROJECT_NAME,
    REGISTRY_OUTGOING_PROJECT_NAME,
    saveServiceSecretsToSecretEngine,
    SERVICE_ID,
    Station
} from "@personalhealthtrain/ui-common";
import {getRepository, IsNull, Not} from "typeorm";
import env from "../../env";
import {AuthClientSecurityQueueMessagePayload} from "../../domains/service/queue";

export async function syncAuthClientSecurity(message: Message) {
    const payload : AuthClientSecurityQueueMessagePayload = message.data as AuthClientSecurityQueueMessagePayload;

    switch (payload.type) {
        case AuthClientType.SERVICE:
            switch (payload.id) {
                case SERVICE_ID.RESULT_SERVICE:
                case SERVICE_ID.TRAIN_BUILDER:
                case SERVICE_ID.TRAIN_ROUTER:
                    await saveServiceSecretsToSecretEngine(payload.id, {
                        id: payload.clientId,
                        secret: payload.clientSecret
                    });
                    break;
                case SERVICE_ID.REGISTRY:
                    const stationRepository = getRepository(Station);
                    const stations = await stationRepository.find({
                        registry_project_id: Not(IsNull())
                    });

                    const promises : Promise<HarborProjectWebhook>[] = stations.map((station: Station) => {
                        return ensureHarborProjectWebHook(station.registry_project_id, {
                            id: payload.clientId,
                            secret: payload.clientSecret
                        }, {internalAPIUrl: env.internalApiUrl});
                    });

                    const specialProjects = [
                        REGISTRY_MASTER_IMAGE_PROJECT_NAME,
                        REGISTRY_INCOMING_PROJECT_NAME,
                        REGISTRY_OUTGOING_PROJECT_NAME
                    ];

                    specialProjects.map(repository => {
                        promises.push(ensureHarborProjectWebHook(repository, {
                            id: payload.clientId,
                            secret: payload.clientSecret
                        }, {internalAPIUrl: env.internalApiUrl}, true));

                        return repository;
                    });

                    await Promise.all(promises);
                    break;
            }
            break;
    }
}
