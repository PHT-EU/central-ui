import {Train} from "../../../pht/train";

export async function buildTrainBuilderStopCommandPayload(train: Train) {
    return {
        trainId: train.id
    }
}
