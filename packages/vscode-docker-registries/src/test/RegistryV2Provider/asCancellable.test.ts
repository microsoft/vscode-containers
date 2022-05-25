/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asCancellable, CancelError } from "../../RegistryV2Provider/utils/asCancellable";
import { TestCancellationToken } from '../TestCancellationToken';

describe('(Unit) asCancellable', function () {
    it('Should throw CancelError when cancelling', function () {
        const token = new TestCancellationToken();

        const callback = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                clearTimeout(timer);
                resolve();
            }, 20);
        });

        const cancelTimer = setTimeout(() => {
            clearTimeout(cancelTimer);
            token.cancel();
        }, 10);

        return asCancellable(callback, token).should.eventually.be.rejectedWith(CancelError);
    });

    it('Should reject when callback rejects', function () {
        const callback = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                clearTimeout(timer);
                reject('canary');
            }, 10);
        });

        return asCancellable(callback, new TestCancellationToken()).should.eventually.be.rejectedWith('canary');
    });

    it('Should resolve when callback resolves', function () {
        const callback = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                clearTimeout(timer);
                resolve('canary');
            }, 20);
        });

        return asCancellable(callback, new TestCancellationToken()).should.eventually.equal('canary');
    });
});
