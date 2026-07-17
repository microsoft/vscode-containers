/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { NerdctlClient } from '../clients/NerdctlClient/NerdctlClient';

/**
 * The output-parsing helpers live on DockerClientBase as protected members.
 * Subclass a concrete client to exercise them directly.
 */
class TestClient extends NerdctlClient {
    public perLineJson<T>(output: string, strict: boolean, parseOne: (json: string) => T): Promise<T[]> {
        return this.parsePerLineJson(output, strict, parseOne);
    }

    public jsonArrayOrLines(output: string, strict?: boolean): unknown[] {
        return this.parseJsonArrayOrLines(output, strict);
    }

    public inspectJson<T>(output: string, strict: boolean, normalizeOne: (item: unknown) => T): Promise<T[]> {
        return this.parseInspectJson(output, strict, normalizeOne);
    }
}

describe('(unit) DockerClientBase output parsing helpers', () => {
    const client = new TestClient();

    describe('parsePerLineJson', () => {
        it('Should parse each non-empty line and skip blanks', async () => {
            const output = '{"a":1}\n\n{"a":2}\n';
            const result = await client.perLineJson(output, true, (json) => JSON.parse(json) as { a: number });
            expect(result).to.deep.equal([{ a: 1 }, { a: 2 }]);
        });

        it('Should swallow bad lines in non-strict mode', async () => {
            const output = '{"a":1}\nnot-json\n{"a":2}';
            const result = await client.perLineJson(output, false, (json) => JSON.parse(json) as { a: number });
            expect(result).to.deep.equal([{ a: 1 }, { a: 2 }]);
        });

        it('Should throw on bad lines in strict mode', async () => {
            const output = '{"a":1}\nnot-json';
            let threw = false;
            try {
                await client.perLineJson(output, true, (json) => JSON.parse(json) as unknown);
            } catch {
                threw = true;
            }
            expect(threw).to.be.true;
        });

        it('Should tolerate CRLF line endings in strict mode', async () => {
            const output = '{"a":1}\r\n{"a":2}\r\n';
            const result = await client.perLineJson(output, true, (json) => JSON.parse(json) as { a: number });
            expect(result).to.deep.equal([{ a: 1 }, { a: 2 }]);
        });
    });

    describe('parseJsonArrayOrLines', () => {
        it('Should unwrap a JSON array', () => {
            expect(client.jsonArrayOrLines('[{"a":1},{"a":2}]')).to.deep.equal([{ a: 1 }, { a: 2 }]);
        });

        it('Should wrap a single JSON object in an array', () => {
            expect(client.jsonArrayOrLines('{"a":1}')).to.deep.equal([{ a: 1 }]);
        });

        it('Should parse newline-delimited JSON objects', () => {
            expect(client.jsonArrayOrLines('{"a":1}\n{"a":2}')).to.deep.equal([{ a: 1 }, { a: 2 }]);
        });

        it('Should return an empty array for empty/whitespace output', () => {
            expect(client.jsonArrayOrLines('   \n  ')).to.deep.equal([]);
        });

        it('Should skip bad newline-delimited lines in non-strict mode', () => {
            expect(client.jsonArrayOrLines('{"a":1}\nnot-json\n{"a":2}')).to.deep.equal([{ a: 1 }, { a: 2 }]);
        });

        it('Should throw on bad newline-delimited lines in strict mode', () => {
            expect(() => client.jsonArrayOrLines('{"a":1}\nnot-json', true)).to.throw();
        });
    });

    describe('parseInspectJson', () => {
        it('Should normalize each item from an array', async () => {
            const result = await client.inspectJson('[{"a":1},{"a":2}]', true, (item) => (item as { a: number }).a);
            expect(result).to.deep.equal([1, 2]);
        });

        it('Should swallow normalization errors in non-strict mode', async () => {
            const result = await client.inspectJson('[{"a":1},{"a":2}]', false, (item) => {
                const value = (item as { a: number }).a;
                if (value === 1) {
                    throw new Error('boom');
                }
                return value;
            });
            expect(result).to.deep.equal([2]);
        });

        it('Should propagate malformed-JSON errors in strict mode', async () => {
            // Newline-delimited output with an unparseable line; strict inspect must not silently drop it.
            let threw = false;
            try {
                await client.inspectJson('{"a":1}\nnot-json', true, (item) => (item as { a: number }).a);
            } catch {
                threw = true;
            }
            expect(threw).to.be.true;
        });
    });
});
