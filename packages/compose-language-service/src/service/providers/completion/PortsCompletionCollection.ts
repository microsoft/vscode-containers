/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionCollection } from './CompletionCollection';

export const PortsCompletionCollection = new CompletionCollection(
    { logicalPaths: [/foo/i], indentationDepth: 3 },
    ...[
    ]
);
