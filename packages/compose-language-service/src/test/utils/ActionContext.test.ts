/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { ResponseError } from 'vscode-jsonrpc';
import { initEvent } from '../../client/TelemetryEvent';
import { ActionContext, getCurrentContext, runWithContext } from '../../service/utils/ActionContext';

describe('(Unit) ActionContext', () => {
    describe('Common scenarios', () => {
        it('Should provide a context when called correctly', async () => {
            const ctx = {
                telemetry: initEvent('foo'),
            } as ActionContext;

            await runWithContext(ctx, async () => {
                const localCtx = getCurrentContext();

                ctx.should.equal(localCtx);
                ctx.should.deep.equal(localCtx);

                ctx.telemetry.properties.test = '1';
                localCtx.telemetry.properties.test?.should.equal('1');
            });
        });
    });

    describe('Error scenarios', () => {
        it('Should throw a ResponseError if called incorrectly', async () => {
            expect(getCurrentContext).to.throw(ResponseError);
        });
    });
});
