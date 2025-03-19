/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromiseCommandResponse, Shell, VoidCommandResponse } from '@microsoft/vscode-container-client';
import { CancellationToken, CancellationTokenSource, Event, EventEmitter, Pseudoterminal, TaskScope, TerminalDimensions, workspace, WorkspaceFolder } from 'vscode';
import { execAsync, ExecAsyncOutput } from '../utils/execAsync';
import { resolveVariables } from '../utils/resolveVariables';
import { withDockerEnvSettings } from '../utils/withDockerEnvSettings';
import { DockerBuildTask, DockerBuildTaskDefinition } from './DockerBuildTaskProvider';
import { DockerRunTask, DockerRunTaskDefinition } from './DockerRunTaskProvider';
import { DockerTaskProvider } from './DockerTaskProvider';
import { DockerTaskExecutionContext } from './TaskHelper';

const DEFAULT = '0m';
const DEFAULTBOLD = '0;1m';
const YELLOW = '33m';

export class DockerPseudoterminal implements Pseudoterminal {
    private readonly closeEmitter: EventEmitter<number> = new EventEmitter<number>();
    private readonly writeEmitter: EventEmitter<string> = new EventEmitter<string>();
    private readonly cts: CancellationTokenSource = new CancellationTokenSource();

    public readonly onDidWrite: Event<string> = this.writeEmitter.event;
    public readonly onDidClose: Event<number> = this.closeEmitter.event;

    public constructor(private readonly taskProvider: DockerTaskProvider, private readonly task: DockerBuildTask | DockerRunTask, private readonly resolvedDefinition: DockerBuildTaskDefinition | DockerRunTaskDefinition) { }

    public open(initialDimensions: TerminalDimensions | undefined): void {
        const folder = this.task.scope === TaskScope.Workspace
            ? workspace.workspaceFolders[0]
            : this.task.scope as WorkspaceFolder;

        const executeContext: DockerTaskExecutionContext = {
            folder,
            cancellationToken: this.cts.token,
            terminal: this,
        };

        this.task.definition = this.resolvedDefinition;

        // We intentionally don't have an error handler in the then() below. DockerTaskProvider.executeTask() cannot throw--errors will be caught and some nonzero integer returned.
        // Can't wait here
        void this.taskProvider.executeTask(executeContext, this.task).then(result => this.close(result));
    }

    public close(code?: number): void {
        this.cts.cancel();
        this.closeEmitter.fire(code || 0);
    }

    public getCommandRunner(options: Omit<ExecuteCommandResponseInTerminalOptions, 'commandResponse'>): <T>(commandResponse: VoidCommandResponse | PromiseCommandResponse<T>) => Promise<T> {
        return async <T>(commandResponse: VoidCommandResponse | PromiseCommandResponse<T>) => {
            const output = await this.executeCommandResponseInTerminal({
                ...options,
                commandResponse: commandResponse,
            });

            if (commandResponse.parse) {
                return commandResponse.parse(output.stdout, true);
            }

            return undefined;
        };
    }

    public writeOutput(message: string): void {
        this.write(message, DEFAULT);
    }

    public writeWarning(message: string): void {
        this.write(message, YELLOW);
    }

    public writeError(message: string): void {
        this.write(message, DEFAULT);
    }

    public writeOutputLine(message: string): void {
        this.writeOutput(`${message}\r\n`); // The carriage return (/r) is necessary or the pseudoterminal does not return back to the start of line
    }

    public writeWarningLine(message: string): void {
        this.writeWarning(`${message}\r\n`); // The carriage return (/r) is necessary or the pseudoterminal does not return back to the start of line
    }

    public writeErrorLine(message: string): void {
        this.writeError(`${message}\r\n`); // The carriage return (/r) is necessary or the pseudoterminal does not return back to the start of line
    }

    private write(message: string, color: string): void {
        message = message.replace(/\r?\n/g, '\r\n'); // The carriage return (/r) is necessary or the pseudoterminal does not return back to the start of line
        this.writeEmitter.fire(`\x1b[${color}${message}\x1b[0m`);
    }

    private async executeCommandResponseInTerminal(options: ExecuteCommandResponseInTerminalOptions): Promise<ExecAsyncOutput> {
        const quotedArgs = Shell.getShellOrDefault().quote(options.commandResponse.args);
        const resolvedQuotedArgs = resolveVariables(quotedArgs, options.folder);
        const commandLine = [options.commandResponse.command, ...resolvedQuotedArgs].join(' ');

        return await this.execAsyncInTerminal(commandLine, options);
    }

    public async execAsyncInTerminal(command: string, options?: ExecAsyncInTerminalOptions): Promise<ExecAsyncOutput> {

        // Output what we're doing, same style as VSCode does for ShellExecution/ProcessExecution
        this.write(`> ${command} <\r\n\r\n`, DEFAULTBOLD);

        return await execAsync(
            command,
            {
                cwd: this.resolvedDefinition.options?.cwd || options.cwd || options.folder.uri.fsPath,
                env: withDockerEnvSettings({ ...process.env, ...this.resolvedDefinition.options?.env }),
                cancellationToken: options.token,
            },
            (output: string, err: boolean) => {
                if (err) {
                    this.writeErrorLine(output);
                } else {
                    this.writeOutputLine(output);
                }
            }
        );
    }

}

type ExecuteCommandResponseInTerminalOptions = ExecAsyncInTerminalOptions & {
    commandResponse: VoidCommandResponse | PromiseCommandResponse<unknown>;
};

type ExecAsyncInTerminalOptions = {
    folder: WorkspaceFolder;
    token?: CancellationToken;
    cwd?: string;
};
