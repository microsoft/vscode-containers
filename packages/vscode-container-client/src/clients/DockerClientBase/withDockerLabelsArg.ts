/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { withNamedArg } from "@microsoft/vscode-processutils";
import { Labels } from "../../contracts/ContainerClient";

export function withDockerLabelsArg(labels?: Labels) {
    return withNamedArg(
        '--label',
        Object.entries(labels ?? {}).map(([label, value]) => `${label}=${value}`),
    );
}
