import {Train} from "../index";
import {getRepository, Not} from "typeorm";
import {findTrain} from "./utils";
import env from "../../../../env";
import {TrainStation} from "../../train-station";
import {TrainStationApprovalStatus} from "../../train-station/status";
import {
    buildTrainBuilderQueueMessage,
    TrainBuilderCommand
} from "../../../service/train-builder/queue";
import {TrainBuildStatus, TrainConfigurationStatus, TrainRunStatus} from "../status";
import {TrainResult} from "../../train-result";
import {TrainResultStatus} from "../../train-result/status";
import {publishQueueMessage} from "../../../../modules/message-queue";

export async function buildTrain(train: Train | number | string) : Promise<Train> {
    const repository = getRepository(Train);

    train = await findTrain(train, repository);

    if (typeof train === 'undefined') {
        // todo: make it a ClientError.BadRequest
        throw new Error('The train could not be found.');
    }

    if (!!train.run_status) {
        // todo: make it a ClientError.BadRequest
        throw new Error('The train can no longer be build...');
    } else {
        if(!env.demo) {
            const trainStationRepository = getRepository(TrainStation);
            const trainStations = await trainStationRepository.find({
                train_id: train.id,
                approval_status: Not(TrainStationApprovalStatus.APPROVED)
            });

            if (trainStations.length > 0) {
                // todo: make it a ClientError.NotFound
                throw new Error('Not all stations have approved your train yet.');
            }

            const queueMessage = await buildTrainBuilderQueueMessage(TrainBuilderCommand.START, train);

            await publishQueueMessage(queueMessage);
        }

        train = repository.merge(train, {
            configurator_status: TrainConfigurationStatus.FINISHED,
            run_status: env.demo ? TrainRunStatus.FINISHED : null,
            build_status: env.demo ? null : TrainBuildStatus.STARTING
        });

        await repository.save(train);

        if(env.demo) {
            const trainResultRepository = getRepository(TrainResult);
            // tslint:disable-next-line:no-shadowed-variable
            const trainResult = trainResultRepository.create({
                download_id: 'DEMO',
                train_id: train.id,
                status: TrainResultStatus.FINISHED
            });

            await trainResultRepository.save(trainResult);
            train.result = trainResult;
        }
    }

    return train;
}
