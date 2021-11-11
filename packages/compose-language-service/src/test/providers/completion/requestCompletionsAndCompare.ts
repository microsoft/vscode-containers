/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { CompletionItem, CompletionRequest, DocumentUri, InsertTextFormat, InsertTextMode, Position } from 'vscode-languageserver';
import { TestConnection } from '../../TestConnection';

export interface ExpectedCompletionItem {
    label: string;
    insertTextCanary: string;
    insertTextFormat?: InsertTextFormat;
    insertTextMode?: InsertTextMode;
}

export interface UnexpectedCompletionItem {
    insertTextCanary: string;
}

/**
 * Requests completions from the server and compares to expected/unexpected results
 * @param testConnection The test connection to use for sending the request
 * @param uri The URI of a document already sent to the test connection
 * @param position The position within the document to test at
 * @param expected Expected completion items, all of which must be present (if the result contains extra items they will NOT cause a failure). If undefined, the result must also be undefined.
 * @param unexpected Unexpected completion items, none of which may be present
 */
export async function requestCompletionsAndCompare(testConnection: TestConnection, uri: DocumentUri, position: Position, expected: ExpectedCompletionItem[] | undefined, unexpected: UnexpectedCompletionItem[] | undefined): Promise<void> {
    const result = await testConnection.client.sendRequest(CompletionRequest.type, { textDocument: { uri }, position: position }) as CompletionItem[] | undefined;

    if (!expected) {
        expect(result).to.not.be.ok; // Completion providers will return undefined rather than an empty list
    } else {
        if (expected.length) {
            expect(result).to.be.ok;
            /* eslint-disable @typescript-eslint/no-non-null-assertion */
            result!.length.should.be.greaterThanOrEqual(expected.length);

            for (const expectedItem of expected) {
                result!.some(ci => completionItemsMatch(expectedItem, ci)).should.be.true;
            }
            /* eslint-enable @typescript-eslint/no-non-null-assertion */
        }

        if (unexpected?.length && result?.length) {
            // If any of the unexpected items show up, fail
            for (const unexpectedItem of unexpected) {
                result.some(ci => (ci.insertText?.indexOf(unexpectedItem.insertTextCanary) ?? -1) >= 0).should.be.false;
            }
        }
    }
}

function completionItemsMatch(expected: ExpectedCompletionItem, actual: CompletionItem): boolean {
    return (
        actual.label === expected.label && // Labels must match
        (expected.insertTextCanary === undefined || (actual.insertText?.indexOf(expected.insertTextCanary) ?? -1) >= 0) && // Insert text must be defined and contain the value of `insertTextCanary`
        (actual.insertTextMode === expected.insertTextMode || expected.insertTextMode === undefined) && // If expected.insertTextMode is defined, the actual must match it
        (actual.insertTextFormat === expected.insertTextFormat || expected.insertTextFormat === undefined) // If expected.insertTextFormat is defined, the actual must match it
    );
}
