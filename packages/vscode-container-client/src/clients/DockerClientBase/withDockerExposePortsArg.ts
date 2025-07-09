/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { withNamedArg } from "@microsoft/vscode-processutils";

export function withDockerExposePortsArg(ports?: Array<number>) {
    return withNamedArg('--expose', (ports || []).map(port => port.toString()), { shouldQuote: false });
}
