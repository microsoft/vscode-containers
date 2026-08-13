/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkspaceFolder } from 'vscode-languageserver';
import type { DocumentUri } from 'vscode-languageserver-textdocument';
import type { ActionContext } from './ActionContext';

const useCaseInsensitivePathComparison = process.platform === 'darwin' || process.platform === 'win32';

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
 * @internal Exported only for tests
 */
export function isDocumentInWorkspaceFolders(documentUri: DocumentUri, folders: WorkspaceFolder[] | null | undefined): boolean {
    if (!folders?.length) {
        return false;
    }

    const document = parseUri(documentUri);
    if (!document) {
        return false;
    }

    return folders.some(folder => {
        const parsedFolder = parseUri(folder.uri);
        if (!parsedFolder) {
            return false;
        }

        // The scheme and authority must match exactly, so that (for example) a `file://` document is
        // never considered to be within a `vscode-vfs://` folder, or a folder on a different host
        if (parsedFolder.scheme !== document.scheme || parsedFolder.authority !== document.authority) {
            return false;
        }

        // The document is within the folder if the folder's path segments are a prefix of the document's.
        // Comparing whole segments (rather than raw strings) means a folder at `/foo` is correctly seen as
        // containing `/foo/compose.yaml`, but not the sibling `/foobar/compose.yaml`.
        return parsedFolder.segments.every((segment, i) => {
            const documentSegment = document.segments[i];

            if (useCaseInsensitivePathComparison) {
                return segment.toLowerCase() === documentSegment?.toLowerCase();
            }

            return segment === documentSegment;
        });
    });
}

/**
 * Parses a URI into the pieces needed to compare it against another URI. LSP models URIs as plain
 * strings (`DocumentUri` is just a `string` alias) and offers no URI type of its own, so the
 * platform's WHATWG `URL` is used: it separates the scheme and authority from the path, and
 * normalizes dot segments (e.g. `/a/b/../c` becomes `/a/c`).
 * @param uri The URI to parse
 * @returns The parsed pieces, or `undefined` if the URI is malformed
 */
function parseUri(uri: string): { scheme: string, authority: string, segments: string[] } | undefined {
    try {
        const url = new URL(uri);

        return {
            scheme: url.protocol,
            authority: url.host,
            // Decoding is done per-segment (after splitting) so that an encoded separator within a
            // segment can never be mistaken for a real one. This also makes comparison insensitive
            // to differences in percent-encoding between the document and folder URIs.
            segments: url.pathname.split('/').filter(segment => !!segment).map(decodeURIComponent),
        };
    } catch {
        // Malformed URI, or malformed percent-encoding within it
        return undefined;
    }
}
