/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CST, Document as YamlDocument } from 'yaml';

export interface CachedDocument {
    textDocument: TextDocument;
    cst: CST.Document;
    yamlDocument: YamlDocument;
}
