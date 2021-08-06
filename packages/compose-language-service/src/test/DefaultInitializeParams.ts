/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InitializeParams } from 'vscode-languageserver';

export const DefaultInitializeParams: InitializeParams = {
    capabilities: {},
    processId: 1,
    rootUri: null,
    workspaceFolders: null
};
