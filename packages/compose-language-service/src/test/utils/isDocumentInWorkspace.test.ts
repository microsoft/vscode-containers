/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkspaceFolder } from 'vscode-languageserver';
import { isDocumentInWorkspaceFolders } from '../../service/utils/isDocumentInWorkspace';

function folder(uri: string): WorkspaceFolder {
    return { uri, name: uri };
}

describe('(Unit) isDocumentInWorkspaceFolders', () => {
    describe('Common scenarios', () => {
        it('Should return true when the document is directly within a workspace folder', () => {
            isDocumentInWorkspaceFolders('file:///workspace/compose.yaml', [folder('file:///workspace')]).should.be.true;
        });

        it('Should return true when the document is nested within a workspace folder', () => {
            isDocumentInWorkspaceFolders('file:///workspace/sub/dir/compose.yaml', [folder('file:///workspace')]).should.be.true;
        });

        it('Should return true when the folder URI has a trailing slash', () => {
            isDocumentInWorkspaceFolders('file:///workspace/compose.yaml', [folder('file:///workspace/')]).should.be.true;
        });

        it('Should return true when the document is within one of several workspace folders', () => {
            isDocumentInWorkspaceFolders('file:///second/compose.yaml', [folder('file:///first'), folder('file:///second')]).should.be.true;
        });

        it('Should return true when the document and folder differ in percent-encoding', () => {
            // `%3A` and `%3a` encode the same character, as do `:` and `%3A` in a path
            isDocumentInWorkspaceFolders('file:///c%3a/workspace/compose.yaml', [folder('file:///c%3A/workspace')]).should.be.true;
        });

        it('Should return true when the document URI contains dot segments resolving into the folder', () => {
            isDocumentInWorkspaceFolders('file:///workspace/sub/../compose.yaml', [folder('file:///workspace')]).should.be.true;
        });

        it('Should return true for any document when the workspace folder is the root', () => {
            isDocumentInWorkspaceFolders('file:///workspace/compose.yaml', [folder('file:///')]).should.be.true;
        });
    });

    describe('Negative scenarios', () => {
        it('Should return false when the document is outside all workspace folders', () => {
            isDocumentInWorkspaceFolders('file:///elsewhere/compose.yaml', [folder('file:///workspace')]).should.be.false;
        });

        it('Should return false for a sibling folder with a matching prefix', () => {
            // `file:///workspace` should not match `file:///workspace-other`
            isDocumentInWorkspaceFolders('file:///workspace-other/compose.yaml', [folder('file:///workspace')]).should.be.false;
        });

        it('Should return false when the document URI contains dot segments resolving out of the folder', () => {
            isDocumentInWorkspaceFolders('file:///workspace/../elsewhere/compose.yaml', [folder('file:///workspace')]).should.be.false;
        });

        it('Should return false when the schemes differ', () => {
            isDocumentInWorkspaceFolders('vscode-vfs:///workspace/compose.yaml', [folder('file:///workspace')]).should.be.false;
        });

        it('Should return false when the authorities differ', () => {
            isDocumentInWorkspaceFolders('vscode-vfs://other/workspace/compose.yaml', [folder('vscode-vfs://github/workspace')]).should.be.false;
        });

        it('Should return false when the document URI is malformed', () => {
            isDocumentInWorkspaceFolders('not a uri', [folder('file:///workspace')]).should.be.false;
        });

        it('Should return false when a workspace folder URI is malformed', () => {
            isDocumentInWorkspaceFolders('file:///workspace/compose.yaml', [folder('not a uri')]).should.be.false;
        });

        it('Should return false when there are no workspace folders', () => {
            isDocumentInWorkspaceFolders('file:///workspace/compose.yaml', []).should.be.false;
        });

        it('Should return false when the folders are null', () => {
            isDocumentInWorkspaceFolders('file:///workspace/compose.yaml', null).should.be.false;
        });

        it('Should return false when the folders are undefined', () => {
            isDocumentInWorkspaceFolders('file:///workspace/compose.yaml', undefined).should.be.false;
        });
    });
});
