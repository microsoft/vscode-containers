/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { httpRequest, RequestOptionsLike } from '../../utils/httpRequest';

suite('(unit) utils/httpRequest', () => {
    let originalFetch: typeof globalThis.fetch;
    let lastFetchUrl: string | URL | Request;
    let lastFetchInit: RequestInit | undefined;

    function stubFetch(status = 200, body = '{}', headers?: Record<string, string>): void {
        globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
            lastFetchUrl = input;
            lastFetchInit = init;
            return new Response(body, {
                status,
                statusText: status === 200 ? 'OK' : 'Error',
                headers: headers ?? {},
            });
        };
    }

    setup(() => {
        originalFetch = globalThis.fetch;
        lastFetchUrl = undefined!;
        lastFetchInit = undefined;
    });

    teardown(() => {
        globalThis.fetch = originalFetch;
    });

    test('sets duplex to half when body is provided', async () => {
        stubFetch();
        const options: RequestOptionsLike = { method: 'POST', body: 'test' };
        await httpRequest('https://example.com', options);

        assert.strictEqual(lastFetchInit?.duplex, 'half');
    });

    test('sets duplex to half when body is empty string', async () => {
        stubFetch();
        const options: RequestOptionsLike = { method: 'POST', body: '' };
        await httpRequest('https://example.com', options);

        assert.strictEqual(lastFetchInit?.duplex, 'half');
    });

    test('does not set duplex when no body is provided', async () => {
        stubFetch();
        const options: RequestOptionsLike = { method: 'GET' };
        await httpRequest('https://example.com', options);

        assert.strictEqual(lastFetchInit?.duplex, undefined);
    });

    test('does not mutate original options headers via signRequest', async () => {
        stubFetch();
        const sharedOptions: RequestOptionsLike = {
            method: 'HEAD',
            headers: { 'Accept': 'application/json' },
        };

        const signRequest = async (request: RequestOptionsLike): Promise<void> => {
            request.headers!['Authorization'] = 'Bearer token123';
        };

        await httpRequest('https://example.com', sharedOptions, signRequest);

        // The signed header should have been sent
        const sentHeaders = lastFetchInit?.headers as Record<string, string>;
        assert.strictEqual(sentHeaders['Authorization'], 'Bearer token123');

        // But the original options should be unmodified
        assert.strictEqual(sharedOptions.headers!['Authorization'], undefined, 'Original options.headers should not be mutated');
        assert.strictEqual(Object.keys(sharedOptions.headers!).length, 1);
    });

    test('passes signed headers through to fetch', async () => {
        stubFetch();
        const options: RequestOptionsLike = {
            method: 'GET',
            headers: { 'X-Custom': 'value' },
        };

        const signRequest = async (request: RequestOptionsLike): Promise<void> => {
            request.headers!['Authorization'] = 'Bearer mytoken';
        };

        await httpRequest('https://example.com', options, signRequest);

        const sentHeaders = lastFetchInit?.headers as Record<string, string>;
        assert.strictEqual(sentHeaders['Authorization'], 'Bearer mytoken');
        assert.strictEqual(sentHeaders['X-Custom'], 'value');
    });

    test('passes url directly to fetch', async () => {
        stubFetch();
        await httpRequest('https://example.com/v2/test', { method: 'GET' });

        assert.strictEqual(lastFetchUrl, 'https://example.com/v2/test');
    });
});
