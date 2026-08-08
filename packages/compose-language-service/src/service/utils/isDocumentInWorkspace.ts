/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkspaceFolder } from 'vscode-languageserver';
import type { DocumentUri } from 'vscode-languageserver-textdocument';
import type { ActionContext } from './ActionContext';

/**
 * Determines whether a document is located within one of the workspace folders open in the client.
 * If the client does not support the `workspace/workspaceFolders` request, the document is
 * optimistically treated as being within the workspace (so behavior is unchanged for such clients).
 * @param ctx The current action context (used to access client capabilities and the connection)
 * @param documentUri The URI of the document
 * @returns True if the document is within a workspace folder (or the capability is unsupported), false otherwise
 */
export async function isDocumentInWorkspace(ctx: ActionContext, documentUri: DocumentUri): Promise<boolean> {
    // If the client doesn't support workspace folders, we can't verify, so optimistically show code lenses
    if (!ctx.clientCapabilities?.workspace?.workspaceFolders) {
        return true;
    }

    const folders = await ctx.connection.workspace.getWorkspaceFolders();
    return isDocumentInWorkspaceFolders(documentUri, folders);
}

/**
 * Determines whether a document is located within one of the given workspace folders.
 * @param documentUri The URI of the document
 * @param folders The workspace folders reported by the client (may be `null`/`undefined` if none are open)
 * @returns True if the document is within one of the workspace folders, false otherwise
 */
export function isDocumentInWorkspaceFolders(documentUri: DocumentUri, folders: WorkspaceFolder[] | null | undefined): boolean {
    if (!folders?.length) {
        return false;
    }

    return folders.some(folder => uriIsWithinFolder(documentUri, folder.uri));
}

function uriIsWithinFolder(documentUri: string, folderUri: string): boolean {
    // Ensure the folder URI ends with a slash so that a folder like `file:///foo` does not match `file:///foobar`
    const normalizedFolderUri = folderUri.endsWith('/') ? folderUri : `${folderUri}/`;
    return documentUri === folderUri || documentUri.startsWith(normalizedFolderUri);
}
