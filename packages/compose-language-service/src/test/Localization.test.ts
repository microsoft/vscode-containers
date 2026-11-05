/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { expect } from 'chai';
import { CodeLensRequest, type CompletionItem, CompletionRequest, type Hover, HoverRequest, type MarkupContent, Position } from 'vscode-languageserver';
import { DefaultInitializeParams, TestConnection } from './TestConnection';

// The language service localizes its text with the translations that the client sends in `initializationOptions.l10nBundle`
const translations = {
    'The version of the Docker Compose document': 'Translated version hover',
    '$(run-all) Run All Services': 'Translated run all',
    '$(play) Run Service': 'Translated run service',
    'Short form': 'Translated short form',
    // `Long form` is intentionally missing, to verify that it falls back to English
};

function createTranslatedConnection(): TestConnection {
    return new TestConnection({ ...DefaultInitializeParams, initializationOptions: { l10nBundle: translations } });
}

async function requestHoverText(testConnection: TestConnection, text: string, position: Position): Promise<string | undefined> {
    const uri = testConnection.sendTextAsYamlDocument(text);
    const result = await testConnection.client.sendRequest(HoverRequest.type, { textDocument: { uri }, position }) as Hover | undefined;
    return (result?.contents as MarkupContent | undefined)?.value;
}

describe('Localization', () => {
    describe('When the client sends translations', () => {
        let testConnection: TestConnection;
        before('Prepare a language server for testing', () => {
            testConnection = createTranslatedConnection();
        });

        after('Remove the translations', () => {
            testConnection.dispose();
            l10n.config({ contents: {} });
        });

        it('Should localize hovers', async () => {
            const hover = await requestHoverText(testConnection, 'version: "3"\n', Position.create(0, 3)); // Inside `version`
            expect(hover).to.equal('Translated version hover');
        });

        it('Should localize code lenses', async () => {
            const uri = testConnection.sendTextAsYamlDocument('services:\n  abc:\n    image: alpine\n');
            const result = (await testConnection.client.sendRequest(CodeLensRequest.type, { textDocument: { uri } }))!;

            expect(result.map(lens => lens.command?.title)).to.have.members(['Translated run all', 'Translated run service']);
        });

        it('Should localize completions, and use English for text without a translation', async () => {
            const uri = testConnection.sendTextAsYamlDocument('services:\n  foo:\n    image: redis\n    ');
            const result = await testConnection.client.sendRequest(CompletionRequest.type, { textDocument: { uri }, position: Position.create(3, 4) }) as CompletionItem[];

            const buildDetails = result.filter(item => item.label === 'build:').map(item => item.detail);
            expect(buildDetails).to.have.members(['Translated short form', 'Long form']);
        });
    });

    describe('When the client does not send translations', () => {
        it('Should use English, even after a language service that had translations', async () => {
            createTranslatedConnection().dispose();

            const testConnection = new TestConnection();
            try {
                const hover = await requestHoverText(testConnection, 'version: "3"\n', Position.create(0, 3));
                expect(hover).to.equal('The version of the Docker Compose document');
            } finally {
                testConnection.dispose();
            }
        });
    });
});
