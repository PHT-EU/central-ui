import { Message } from 'amqp-extension';
import { URL } from 'url';
import { getHarborFQRepositoryPath } from '../../config/services/harbor';
import { parseHarborConnectionString } from '../../domains/service/harbor';
import { ResultServiceDataPayload } from '../../domains/service/result-service';
import env from '../../env';
import { DockerPullOptions, pullDockerRegistryImage } from '../../modules/docker';

const harborConfig = parseHarborConnectionString(env.harborConnectionString);
const harborUrL = new URL(harborConfig.host);

const dockerOptions : DockerPullOptions = {
    authconfig: {
        username: harborConfig.user,
        password: harborConfig.password,
        serveraddress: harborUrL.hostname,
    },
};

export async function downloadImage(message: Message) {
    const data : ResultServiceDataPayload = message.data as ResultServiceDataPayload;
    const repositoryTag = getHarborFQRepositoryPath(data.train_id);

    await pullDockerRegistryImage(repositoryTag, dockerOptions);

    return message;
}
