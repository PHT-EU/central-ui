/*
 * Copyright (c) 2022.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    SocketClientToServerEvents,
    SocketServerToClientEventContext,
    SocketServerToClientEvents,
    TrainStation, TrainStationEventContext,
} from '@personalhealthtrain/central-common';
import {
    DomainEventName,
    DomainEventSubscriptionName,
    DomainSubType,
    DomainType,
    buildDomainChannelName, buildDomainEventFullName, buildDomainEventSubscriptionFullName,
} from '@personalhealthtrain/central-common';
import type { FiltersBuildInput } from 'rapiq';

import type { PropType, SlotsType, VNodeChild } from 'vue';
import { computed, defineComponent } from 'vue';
import type { Socket } from 'socket.io-client';
import { realmIdForSocket } from '../../../composables/domain/realm';
import { useSocket } from '../../../composables/socket';
import type {
    DomainListSlotsType,
} from '../../../core';
import {
    createDomainListBuilder, defineDomainListEvents, defineDomainListProps,
} from '../../../core';
import type { DomainDetailsSlotProps } from '../type';
import TrainStationDetails from './TrainStationDetails';

enum Direction {
    IN = 'in',
    OUT = 'out',
}

export default defineComponent({
    name: 'TrainStationList',
    props: {
        ...defineDomainListProps<TrainStation>(),
        realmId: {
            type: String,
        },
        sourceId: {
            type: String,
            default: undefined,
        },
        target: {
            type: String as PropType<'station' | 'train'>,
            default: DomainType.STATION,
        },
        direction: {
            type: String as PropType<'in' | 'out'>,
            default: Direction.OUT,
        },
    },
    slots: Object as SlotsType<DomainListSlotsType<TrainStation>>,
    emits: defineDomainListEvents<TrainStation>(),
    async setup(props, ctx) {
        const refs = toRefs(props);

        const source = computed(() => (refs.target.value === DomainType.STATION ?
            DomainType.TRAIN :
            DomainType.STATION));

        const realmId = realmIdForSocket(refs.realmId);

        const {
            build,
            handleCreated,
        } = createDomainListBuilder<TrainStation>({
            props,
            setup: ctx,
            load: (buildInput) => useAPI().trainStation.getMany(buildInput),
            queryFilter: (q) => {
                let filter : FiltersBuildInput<TrainStation>;

                if (refs.target.value === DomainType.STATION) {
                    filter = {
                        'station.name': q.length > 0 ? `~${q}` : q,
                    };
                } else {
                    filter = {
                        'train.name': q.length > 0 ? `~${q}` : q,
                    };
                }

                if (realmId.value) {
                    if (refs.direction.value === Direction.IN) {
                        filter.station_realm_id = realmId.value;
                    } else {
                        filter.train_realm_id = realmId.value;
                    }
                }

                return filter;
            },
            query: () => {
                if (refs.target.value === DomainType.STATION) {
                    return {
                        include: ['station'],
                    };
                }

                return {
                    include: ['train'],
                };
            },
            defaults: {
                footerPagination: true,

                headerSearch: true,
                headerTitle: {
                    content: refs.target.value === DomainType.STATION ?
                        'Stations' :
                        'Trains',
                    icon: refs.target.value === DomainType.STATION ?
                        'fa fa-hospital' :
                        'fa-solid fa-train-tram',
                },

                item: {
                    content(
                        item,
                        itemProps,
                        sections,
                    ) {
                        return h(TrainStationDetails, {
                            entity: item,
                            direction: refs.direction.value,
                            target: refs.target.value,
                            onUpdated: itemProps.updated,
                            onDeleted: itemProps.deleted,
                            onFailed: itemProps.failed,
                        }, {
                            default: (props: DomainDetailsSlotProps<TrainStation>) => {
                                if (sections.slot) {
                                    return sections.slot;
                                }

                                let text : VNodeChild | undefined;

                                if (
                                    refs.target.value === DomainType.STATION &&
                                    props.data.station
                                ) {
                                    text = h('div', [props.data.station.name]);
                                } else if (
                                    refs.target.value === DomainType.TRAIN &&
                                    props.data.train
                                ) {
                                    text = h('div', [props.data.train.name]);
                                } else {
                                    text = h('div', [props.data.id]);
                                }

                                return [
                                    sections.icon,
                                    text,
                                    sections.actions,
                                ];
                            },
                        });
                    },
                },

                noMore: {
                    content: `No more ${refs.target.value} available...`,
                },
            },
        });

        const isSameSocketRoom = (room?: string) => {
            if (realmId.value) {
                switch (refs.direction.value) {
                    case Direction.IN:
                        return room === buildDomainChannelName(DomainSubType.TRAIN_STATION_IN);
                    case Direction.OUT:
                        return room === buildDomainChannelName(DomainSubType.TRAIN_STATION_OUT);
                }
            } else {
                return room === buildDomainChannelName(DomainType.TRAIN_STATION);
            }

            return false;
        };

        const isSocketEventForSource = (item: TrainStation) => {
            switch (source.value) {
                case DomainType.STATION:
                    if (typeof refs.sourceId.value === 'undefined') {
                        return refs.realmId.value === item.station_realm_id;
                    }

                    return refs.sourceId.value === item.station_id;
                case DomainType.TRAIN:
                    if (typeof refs.sourceId.value === 'undefined') {
                        return refs.realmId.value === item.train_realm_id;
                    }

                    return refs.sourceId.value === item.train_id;
            }

            return false;
        };

        const handleSocketCreated = (context: SocketServerToClientEventContext<TrainStationEventContext>) => {
            if (
                !isSameSocketRoom(context.meta.roomName) ||
                !isSocketEventForSource(context.data)
            ) return;

            handleCreated(context.data);
        };

        const socket : Socket<
        SocketServerToClientEvents,
        SocketClientToServerEvents
        > = useSocket().useRealmWorkspace(realmId.value);

        onMounted(() => {
            if (refs.direction.value === Direction.IN) {
                socket.emit(buildDomainEventSubscriptionFullName(
                    DomainSubType.TRAIN_STATION_IN,
                    DomainEventSubscriptionName.SUBSCRIBE,
                ));
            } else if (refs.direction.value === Direction.OUT) {
                socket.emit(buildDomainEventSubscriptionFullName(
                    DomainSubType.TRAIN_STATION_OUT,
                    DomainEventSubscriptionName.SUBSCRIBE,
                ));
            } else {
                socket.emit(buildDomainEventSubscriptionFullName(
                    DomainType.TRAIN_STATION,
                    DomainEventSubscriptionName.SUBSCRIBE,
                ));
            }

            socket.on(buildDomainEventFullName(
                DomainType.TRAIN_STATION,
                DomainEventName.CREATED,
            ), handleSocketCreated);
        });

        onUnmounted(() => {
            if (refs.direction.value === Direction.IN) {
                socket.emit(buildDomainEventSubscriptionFullName(
                    DomainSubType.TRAIN_STATION_IN,
                    DomainEventSubscriptionName.UNSUBSCRIBE,
                ));
            } else if (refs.direction.value === Direction.OUT) {
                socket.emit(buildDomainEventSubscriptionFullName(
                    DomainSubType.TRAIN_STATION_OUT,
                    DomainEventSubscriptionName.UNSUBSCRIBE,
                ));
            } else {
                socket.emit(buildDomainEventSubscriptionFullName(
                    DomainType.TRAIN_STATION,
                    DomainEventSubscriptionName.UNSUBSCRIBE,
                ));
            }

            socket.off(buildDomainEventFullName(
                DomainType.TRAIN_STATION,
                DomainEventName.CREATED,
            ), handleSocketCreated);
        });

        return () => build();
    },
});
