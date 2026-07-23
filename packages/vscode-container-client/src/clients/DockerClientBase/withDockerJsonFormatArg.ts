/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { withNamedArg } from "@microsoft/vscode-processutils";

export function withDockerJsonFormatArg(jsonFormat: string = '{{json .}}') {
    return withNamedArg('--format', jsonFormat);
}
