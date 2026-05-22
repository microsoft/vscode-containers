/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as vscode from 'vscode';

export const OCI_BLOB_SCHEME = 'containers-oci';

// Wraps an OCI blob file path in a custom URI so it opens as a read-only,
// pretty-printed virtual document instead of editing the on-disk blob (whose
// digest must match its content byte-for-byte).
export function toOciBlobUri(filePath: string): vscode.Uri {
    return vscode.Uri.file(filePath).with({ scheme: OCI_BLOB_SCHEME });
}

export class OciBlobContentProvider implements vscode.TextDocumentContentProvider {
    public provideTextDocumentContent(uri: vscode.Uri): string {
        const raw = fs.readFileSync(uri.fsPath, 'utf8');
        try {
            return JSON.stringify(JSON.parse(raw) as unknown, null, 4);
        } catch {
            return raw;
        }
    }
}
