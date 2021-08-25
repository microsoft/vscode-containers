/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vscode-languageserver';
import { ComposeDocument } from './ComposeDocument';
import { ExtendedPosition } from './ExtendedPosition';

export interface ExtendedParams {
    document: ComposeDocument;
}

export interface ExtendedPositionParams extends ExtendedParams {
    position: Position;
    extendedPosition: ExtendedPosition;
}
