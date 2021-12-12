/*
 * Copyright (c) 2021-2021.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { getRepository } from 'typeorm';
import { applyFilters, applyPagination, applyQueryRelations } from 'typeorm-extension';
import {
    MasterImage,
    PermissionID, Proposal, Train, TrainCommand, TrainFile,
    TrainType, isPermittedForResourceRealm,
    onlyRealmPermittedQueryResources,
} from '@personalhealthtrain/ui-common';
import { check, matchedData, validationResult } from 'express-validator';

import {
    Body, Controller, Delete, Get, Params, Post, Request, Response,
} from '@decorators/express';
import { ResponseExample, SwaggerTags } from '@trapi/swagger';
import { BadRequestError, ForbiddenError, NotFoundError } from '@typescript-error/http';
import { handleTrainCommandRouteHandler } from './action';
import { ForceLoggedInMiddleware } from '../../../../config/http/middleware/auth';
import { ExpressRequest, ExpressResponse } from '../../../../config/http/type';
import { ExpressValidationError } from '../../../../config/http/error/validation';

export async function getOneRouteHandler(req: ExpressRequest, res: ExpressResponse) : Promise<any> {
    const { include } = req.query;
    const { id } = req.params;

    if (typeof id !== 'string') {
        throw new BadRequestError();
    }

    const repository = getRepository(Train);
    const query = repository.createQueryBuilder('train')
        .where('train.id = :id', { id });

    onlyRealmPermittedQueryResources(query, req.realmId, 'train.realm_id');

    applyQueryRelations(query, include, {
        defaultAlias: 'train',
        allowed: ['train_stations', 'user', 'proposal', 'master_image'],
    });

    const entity = await query.getOne();

    if (typeof entity === 'undefined') {
        throw new NotFoundError();
    }

    if (!isPermittedForResourceRealm(req.realmId, entity.realm_id)) {
        throw new ForbiddenError();
    }

    return res.respond({ data: entity });
}

async function getManyRouteHandler(req: ExpressRequest, res: ExpressResponse) : Promise<any> {
    const { filter, page, include } = req.query;

    const repository = getRepository(Train);
    const query = repository.createQueryBuilder('train');

    onlyRealmPermittedQueryResources(query, req.realmId, 'train.realm_id');

    applyQueryRelations(query, include, {
        defaultAlias: 'train',
        allowed: ['train_stations', 'user', 'proposal', 'master_image'],
    });

    applyFilters(query, filter, {
        defaultAlias: 'train',
        allowed: ['id', 'name', 'proposal_id', 'realm_id'],
    });

    const pagination = applyPagination(query, page, { maxLimit: 50 });

    query.orderBy('train.updated_at', 'DESC');

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

async function runValidations(req: ExpressRequest, mode: 'create' | 'update') {
    if (mode === 'create') {
        await check('proposal_id')
            .exists()
            .isInt()
            .custom((value) => getRepository(Proposal).findOne(value).then((proposal) => {
                if (typeof proposal === 'undefined') throw new Error('The referenced proposal does not exist.');

                if (proposal.realm_id !== req.realmId) {
                    throw new Error('You are not permitted to create a train for that realm.');
                }
            }))
            .run(req);

        await check('type')
            .exists()
            .notEmpty()
            .isString()
            .custom((value) => Object.values(TrainType).includes(value))
            .run(req);
    }

    await check('name')
        .exists()
        .notEmpty()
        .optional({ nullable: true })
        .isLength({ min: 1, max: 128 })
        .run(req);

    await check('entrypoint_file_id')
        .exists()
        .optional()
        .custom((value) => getRepository(TrainFile).findOne(value).then((res) => {
            if (typeof res === 'undefined') throw new Error('The entrypoint file is not valid.');
        }))
        .run(req);

    await check('hash_signed')
        .exists()
        .notEmpty()
        .isLength({ min: 10, max: 8096 })
        .optional({ nullable: true })
        .run(req);

    const masterImagePromise = check('master_image_id')
        .exists()
        .optional({ nullable: true })
        .isString()
        .custom((value) => getRepository(MasterImage).findOne(value).then((res) => {
            if (typeof res === 'undefined') throw new Error('The master image is not valid.');
        }));

    await check('query')
        .exists()
        .notEmpty()
        .optional({ nullable: true })
        .isLength({ min: 1, max: 4096 })
        .run(req);

    await masterImagePromise.run(req);
}

async function addRouteHandler(req: ExpressRequest, res: ExpressResponse) : Promise<any> {
    if (!req.ability.hasPermission(PermissionID.TRAIN_ADD)) {
        throw new ForbiddenError();
    }

    await runValidations(req, 'create');

    const validation = validationResult(req);
    if (!validation.isEmpty()) {
        throw new ExpressValidationError(validation);
    }

    const validationData = matchedData(req, { includeOptionals: true });

    const repository = getRepository(Train);

    const entity = repository.create({
        realm_id: req.realmId,
        user_id: req.user.id,
        ...validationData,
    });

    await repository.save(entity);

    return res.respond({ data: entity });
}

export async function editRouteHandler(req: ExpressRequest, res: ExpressResponse) : Promise<any> {
    const { id } = req.params;

    if (typeof id !== 'string') {
        throw new BadRequestError();
    }

    if (!req.ability.hasPermission(PermissionID.TRAIN_EDIT)) {
        throw new ForbiddenError();
    }

    await runValidations(req, 'update');

    const validation = validationResult(req);
    if (!validation.isEmpty()) {
        throw new ExpressValidationError(validation);
    }

    const data = matchedData(req, { includeOptionals: true });
    if (!data) {
        return res.respondAccepted();
    }

    const repository = getRepository(Train);
    let train = await repository.findOne(id);

    if (typeof train === 'undefined') {
        throw new NotFoundError();
    }

    if (!isPermittedForResourceRealm(req.realmId, train.realm_id)) {
        throw new ForbiddenError();
    }

    train = repository.merge(train, data);

    const result = await repository.save(train);

    return res.respondAccepted({
        data: result,
    });
}

export async function dropRouteHandler(req: ExpressRequest, res: ExpressResponse) : Promise<any> {
    const { id } = req.params;

    if (typeof id !== 'string') {
        throw new BadRequestError();
    }

    if (!req.ability.hasPermission(PermissionID.TRAIN_DROP)) {
        throw new ForbiddenError();
    }

    const repository = getRepository(Train);

    const entity = await repository.findOne(id);

    if (typeof entity === 'undefined') {
        throw new NotFoundError();
    }

    if (!isPermittedForResourceRealm(req.realmId, entity.realm_id)) {
        throw new ForbiddenError();
    }

    await repository.delete(entity.id);

    return res.respondDeleted({ data: entity });
}

type PartialTrain = Partial<Train>;
const simpleExample = {
    user_id: 1,
    proposal_id: 1,
    hash: 'xxx',
    hash_signed: 'xxx',
    session_id: 'xxx',
};

@SwaggerTags('pht')
@Controller('/trains')
export class TrainController {
    @Get('', [ForceLoggedInMiddleware])
    @ResponseExample<PartialTrain[]>([simpleExample])
    async getMany(
        @Request() req: any,
            @Response() res: any,
    ): Promise<PartialTrain[]> {
        return getManyRouteHandler(req, res);
    }

    @Get('/:id', [ForceLoggedInMiddleware])
    @ResponseExample<PartialTrain>(simpleExample)
    async getOne(
        @Params('id') id: string,
            @Request() req: any,
            @Response() res: any,
    ): Promise<PartialTrain | undefined> {
        return getOneRouteHandler(req, res);
    }

    @Post('/:id', [ForceLoggedInMiddleware])
    @ResponseExample<PartialTrain>(simpleExample)
    async edit(
        @Params('id') id: string,
            @Body() data: PartialTrain,
            @Request() req: any,
            @Response() res: any,
    ): Promise<PartialTrain | undefined> {
        return editRouteHandler(req, res);
    }

    @Post('', [ForceLoggedInMiddleware])
    @ResponseExample<PartialTrain>(simpleExample)
    async add(
        @Body() data: PartialTrain,
            @Request() req: any,
            @Response() res: any,
    ): Promise<PartialTrain | undefined> {
        return addRouteHandler(req, res);
    }

    @Post('/:id/command', [ForceLoggedInMiddleware])
    @ResponseExample<PartialTrain>(simpleExample)
    async doTask(
        @Params('id') id: string,
            @Body() data: {
                command: TrainCommand
            },
            @Request() req: any,
            @Response() res: any,
    ): Promise<PartialTrain | undefined> {
        return handleTrainCommandRouteHandler(req, res);
    }

    @Delete('/:id', [ForceLoggedInMiddleware])
    @ResponseExample<PartialTrain>(simpleExample)
    async drop(
        @Params('id') id: string,
            @Request() req: any,
            @Response() res: any,
    ): Promise<PartialTrain | undefined> {
        return dropRouteHandler(req, res);
    }

    // --------------------------------------------------------------------------
}
