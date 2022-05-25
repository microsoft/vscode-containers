/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'events';
import { CancellationToken, Disposable } from "vscode";

export class TestCancellationToken implements CancellationToken {
    public isCancellationRequested = false;

    public readonly emitter = new EventEmitter();

    public onCancellationRequested(listener: (...args: unknown[]) => unknown): Disposable {
        this.emitter.on('cancel', listener);

        return {
            dispose: (): void => { this.emitter.off('cancel', listener); }
        };
    }

    public cancel(): void {
        this.isCancellationRequested = true;
        this.emitter.emit('cancel');
    }
}
