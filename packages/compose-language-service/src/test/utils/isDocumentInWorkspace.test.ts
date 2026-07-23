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
    });

    describe('Negative scenarios', () => {
        it('Should return false when the document is outside all workspace folders', () => {
            isDocumentInWorkspaceFolders('file:///elsewhere/compose.yaml', [folder('file:///workspace')]).should.be.false;
        });

        it('Should return false for a sibling folder with a matching prefix', () => {
            // `file:///workspace` should not match `file:///workspace-other`
            isDocumentInWorkspaceFolders('file:///workspace-other/compose.yaml', [folder('file:///workspace')]).should.be.false;
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
