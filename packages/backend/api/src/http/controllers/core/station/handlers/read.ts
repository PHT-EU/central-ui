/*
 * Copyright (c) 2022.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { SelectQueryBuilder } from 'typeorm';
import { PermissionID } from '@personalhealthtrain/central-common';
import {
    ParseAllowedOption,
    parseQueryFields,
} from 'rapiq';
import {
    applyFilters, applyPagination, applyQueryFieldsParseOutput, applyRelations, useDataSource,
} from 'typeorm-extension';
import { ForbiddenError, NotFoundError } from '@ebec/http';
import { onlyRealmPermittedQueryResources } from '@authelion/server-core';
import { StationEntity } from '../../../../../domains/core/station/entity';
import { ExpressRequest, ExpressResponse } from '../../../../type';

async function checkAndApplyFields(req: ExpressRequest, query: SelectQueryBuilder<any>, fields: any) {
    const protectedFields : ParseAllowedOption<StationEntity> = [
        'public_key',
        'email',
    ];

    const fieldsParsed = parseQueryFields<StationEntity>(fields, {
        default: [
            'id',
            'name',
            'ecosystem',
            'external_name',
            'hidden',
            'realm_id',
            'registry_id',
            'registry_project_id',
            'created_at',
            'updated_at',
        ],
        allowed: protectedFields,
        defaultPath: 'station',
    });

    const protectedSelected = fieldsParsed
        .filter((field) => field.path === 'station' &&
            protectedFields.indexOf(field.key as any) !== -1);

    if (protectedSelected.length > 0) {
        if (
            !req.ability.has(PermissionID.STATION_EDIT)
        ) {
            throw new ForbiddenError(
                `You are not permitted to read the restricted fields: ${
                    protectedSelected.map((field) => field.key).join(', ')}`,
            );
        }

        onlyRealmPermittedQueryResources(query, req.realmId, 'station.realm_id');
    }

    applyQueryFieldsParseOutput(query, fieldsParsed, { defaultAlias: 'station' });
}

export async function getOneStationRouteHandler(req: ExpressRequest, res: ExpressResponse) : Promise<any> {
    const { id } = req.params;
    const { fields, include } = req.query;

    const dataSource = await useDataSource();
    const repository = dataSource.getRepository(StationEntity);
    const query = repository.createQueryBuilder('station')
        .where('station.id = :id', { id });

    await checkAndApplyFields(req, query, fields);

    applyRelations(query, include, {
        defaultAlias: 'station',
        allowed: ['realm', 'registry_project', 'registry'],
    });

    const entity = await query.getOne();

    if (!entity) {
        throw new NotFoundError();
    }

    return res.respond({ data: entity });
}

export async function getManyStationRouteHandler(req: ExpressRequest, res: ExpressResponse) : Promise<any> {
    const {
        filter, page, fields, include,
    } = req.query;

    const dataSource = await useDataSource();
    const repository = dataSource.getRepository(StationEntity);
    const query = repository.createQueryBuilder('station');

    await checkAndApplyFields(req, query, fields);

    applyRelations(query, include, {
        defaultAlias: 'station',
        allowed: ['realm', 'registry_project', 'registry'],
    });

    applyFilters(query, filter, {
        allowed: ['id', 'name', 'hidden', 'realm_id'],
        defaultAlias: 'station',
    });

    const pagination = applyPagination(query, page, { maxLimit: 50 });

    const [entities, total] = await query.getManyAndCount();

    return res.respond({
        data: {
            data: entities,
            meta: {
                total,
                ...pagination,
            },
        },
    });
}
