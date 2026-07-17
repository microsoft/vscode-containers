/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type CommandLineCurryFn, withArg } from "@microsoft/vscode-processutils";
import type { ReadFileCommandOptions, WriteFileCommandOptions } from "../../contracts/ContainerClient";

export function withContainerPathArg(options: ReadFileCommandOptions | WriteFileCommandOptions): CommandLineCurryFn {
    return withArg(`${options.container}:${options.path}`);
}
