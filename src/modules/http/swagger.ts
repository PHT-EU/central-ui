import {generateDocumentation, SwaggerConfig} from "typescript-swagger/src/index";
import {getRootDirPath, getWritableDirPath} from "../../config/paths";
import path from "path";
import env from "../../env";

const packageJson = require('../../../package.json');
const tsConfig = require('../../../tsconfig.json');
const url = new URL(env.apiUrl);

export const swaggerConfig : SwaggerConfig = {
    yaml: true,
    host: url.host,
    name: 'API - Documentation',
    description: packageJson.description,
    basePath: '',
    version: packageJson.version,
    outputDirectory: getWritableDirPath(),
    entryFile: path.join(getRootDirPath(), 'src', 'app', 'controllers', '**', '*.ts'),
    ignore: ['**/node_modules/**'],
    securityDefinitions: {
        bearerHeader: {
            name: 'Bearer',
            type: 'apiKey',
            in: 'header',
            tokenUrl: url.host+'/auth/token'
        }
    },
    consumes: ['application/json'],
    produces: ['application/json']
}

export async function generateSwaggerDocumentation() : Promise<string> {
    return await generateDocumentation(swaggerConfig, tsConfig);
}
