/*
 * Copyright (c) 2021-2021.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Connection, In } from 'typeorm';
import { Factory, Seeder } from 'typeorm-seeding';

import {
    MASTER_REALM_ID, Permission, Realm, RolePermission, UserRole,
} from '@personalhealthtrain/ui-common';
import { getPermissions } from '../../config/permissions';

import { UserRepository } from '../../domains/auth/user/repository';
import { RoleRepository } from '../../domains/auth/role/repository';

export default class DatabaseCoreSeeder implements Seeder {
    public async run(factory: Factory, connection: Connection) : Promise<any> {
        /**
         * Create default realm
         */
        const realmRepository = connection.getRepository(Realm);
        let realm = await realmRepository.findOne({ name: MASTER_REALM_ID });
        if (typeof realm === 'undefined') {
            realm = realmRepository.create({
                id: MASTER_REALM_ID,
                name: 'Master',
                drop_able: false,
            });
        }

        await realmRepository.save(realm);

        // -------------------------------------------------

        /**
         * Create default role
         */
        const roleRepository = connection.getCustomRepository(RoleRepository);
        let role = await roleRepository.findOne({
            name: 'admin',
        });
        if (typeof role === 'undefined') {
            role = roleRepository.create({
                name: 'admin',
            });
        }

        await roleRepository.save(role);

        // -------------------------------------------------

        /**
         * Create default user
         */
        const userRepository = connection.getCustomRepository(UserRepository);
        let user = await userRepository.findOne({
            name: 'admin',
        });

        if (typeof user === 'undefined') {
            user = userRepository.create({
                name: 'admin',
                password: await userRepository.hashPassword('start123'),
                email: 'peter.placzek1996@gmail.com',
                realm_id: MASTER_REALM_ID,
            });
        }

        await userRepository.save(user);

        // -------------------------------------------------

        /**
         * Create default user - role association
         */
        const userRoleData : Partial<UserRole> = {
            role_id: role.id,
            user_id: user.id,
        };

        const userRoleRepository = connection.getRepository(UserRole);
        let userRole = await userRoleRepository.findOne(userRoleData);

        if (typeof userRole === 'undefined') {
            userRole = userRoleRepository.create(userRoleData);
        }

        await userRoleRepository.save(userRole);

        // -------------------------------------------------

        /**
         * Create all permissions
         */
        const permissionRepository = connection.getRepository(Permission);
        const ids : string[] = getPermissions();

        const existingPermissions = await permissionRepository.find({
            id: In(ids),
        });

        for (let i = 0; i < existingPermissions.length; i++) {
            const index = ids.indexOf(existingPermissions[i].id);
            if (index !== -1) {
                ids.splice(index, 1);
            }
        }

        const permissions : Permission[] = ids.map((id: string) => permissionRepository.create({ id }));
        if (permissions.length > 0) {
            await permissionRepository.save(permissions);
        }

        // -------------------------------------------------

        /**
         * Assign all permissions to default role.
         */
        const rolePermissionRepository = connection.getRepository(RolePermission);

        const existingRolePermissions = await rolePermissionRepository.find({
            permission_id: In(ids),
            role_id: role.id,
        });

        for (let i = 0; i < existingRolePermissions.length; i++) {
            const index = ids.indexOf(existingRolePermissions[i].permission_id);
            if (index !== -1) {
                ids.splice(index, 1);
            }
        }

        const rolePermissions : RolePermission[] = [];
        for (let j = 0; j < ids.length; j++) {
            rolePermissions.push(rolePermissionRepository.create({
                role_id: role.id,
                permission_id: ids[j],
            }));
        }

        await rolePermissionRepository.save(rolePermissions);
    }
}
