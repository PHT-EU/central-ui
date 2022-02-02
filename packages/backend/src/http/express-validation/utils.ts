/*
 * Copyright (c) 2022.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export function buildExpressValidationErrorMessage<
    T extends Record<string, any> = Record<string, any>,
    >(names: (keyof T)[]) {
    if (names.length > 1) {
        return `The parameters ${names.join(', ')} is invalid.`;
    }
    return `The parameter ${names[0]} is invalid.`;
}
