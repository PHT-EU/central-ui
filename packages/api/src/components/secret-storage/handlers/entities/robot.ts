/*
 * Copyright (c) 2022-2022.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Ecosystem,
    ROBOT_SECRET_ENGINE_KEY,
    ServiceID,
    buildRobotSecretStoragePayload,
} from '@personalhealthtrain/central-common';
import { useClient } from 'hapic';
import { publish } from 'amqp-extension';
import type { Client as VaultClient } from '@hapic/vault';
import { useDataSource } from 'typeorm-extension';
import { ApiKey } from '../../../../config';
import { RegistryCommand } from '../../../registry';
import { buildRegistryPayload } from '../../../registry/utils/queue';
import type { SecretStorageRobotDeletePayload, SecretStorageRobotSavePayload } from '../../type';
import { RegistryProjectEntity } from '../../../../domains/registry-project/entity';

export async function saveRobotToSecretStorage(payload: SecretStorageRobotSavePayload) {
    const dataSource = await useDataSource();

    const data = buildRobotSecretStoragePayload(payload.id, payload.secret);
    await useClient<VaultClient>(ApiKey.VAULT).keyValue.save(ROBOT_SECRET_ENGINE_KEY, `${payload.name}`, data);

    if (payload.name === ServiceID.REGISTRY) {
        const projectRepository = dataSource.getRepository(RegistryProjectEntity);
        const projects = await projectRepository.find({
            select: ['id'],
            where: {
                ecosystem: Ecosystem.DEFAULT,
            },
        });

        for (let i = 0; i < projects.length; i++) {
            const queueMessage = buildRegistryPayload({
                command: RegistryCommand.PROJECT_LINK,
                data: {
                    id: projects[i].id,
                },
            });

            await publish(queueMessage);
        }
    }
}

export async function deleteRobotFromSecretStorage(payload: SecretStorageRobotDeletePayload) {
    try {
        await useClient<VaultClient>(ApiKey.VAULT).keyValue.delete(ROBOT_SECRET_ENGINE_KEY, `${payload.name}`);
    } catch (e) {
        // ...
    }
}
