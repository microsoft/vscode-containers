/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import * as vscode from 'vscode';
import { TaskCommandRunnerFactory } from '../../../runtimes/runners/TaskCommandRunnerFactory';

suite('(unit) TaskCommandRunnerFactory', () => {
    async function executeTask(options: { close?: boolean; focus?: boolean }): Promise<vscode.TaskPresentationOptions> {
        const taskName = `TaskCommandRunnerFactory test ${Date.now()} ${Math.random()}`;
        let presentationOptions: vscode.TaskPresentationOptions | undefined;

        const taskStarted = new Promise<void>(resolve => {
            const disposable = vscode.tasks.onDidStartTask(event => {
                if (event.execution.task.name === taskName) {
                    presentationOptions = event.execution.task.presentationOptions;
                    disposable.dispose();
                    resolve();
                }
            });
        });

        const commandResponse = process.platform === 'win32' ?
            { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/c', 'exit', '0'] } :
            { command: '/bin/sh', args: ['-c', 'exit 0'] };

        const runner = new TaskCommandRunnerFactory({ taskName, ...options }).getCommandRunner();
        await Promise.all([runner(commandResponse), taskStarted]);

        expect(presentationOptions).not.to.be.undefined;
        return presentationOptions;
    }

    test('Leaves presentation options unset when they are not provided', async () => {
        const presentationOptions = await executeTask({});

        expect(presentationOptions.focus).to.be.undefined;
        expect(presentationOptions.close).to.be.undefined;
    });

    test('Preserves explicitly disabled presentation options', async () => {
        const presentationOptions = await executeTask({ focus: false, close: false });

        expect(presentationOptions.focus).to.equal(false);
        expect(presentationOptions.close).to.equal(false);
    });

    test('Enables terminal closing without changing focus', async () => {
        const presentationOptions = await executeTask({ close: true });

        expect(presentationOptions.focus).to.be.undefined;
        expect(presentationOptions.close).to.equal(true);
    });
});
