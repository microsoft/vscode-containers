/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ShellQuotedString, ShellQuoting } from 'vscode';
import { toArray } from './toArray';

export type CommandLineArgs = Array<ShellQuotedString>;

export type CommandLineCurryFn = (cmdLineArgs?: CommandLineArgs) => CommandLineArgs;

export function composeArgs(...cmdLineArgFns: Array<CommandLineCurryFn>): CommandLineCurryFn {
    return (cmdLineArgs: CommandLineArgs = []) => cmdLineArgFns.reduce((commandLineArgs: CommandLineArgs, cmdLineArgsFn) => cmdLineArgsFn(commandLineArgs), cmdLineArgs || []);
}

export function withArg(...args: Array<string | ShellQuotedString | null | undefined>): CommandLineCurryFn {
    return (cmdLineArgs: CommandLineArgs = []) => {
        return args.map(escaped).reduce<CommandLineArgs>((allArgs, arg) => {
            if (arg) {
                return [...allArgs, arg];
            }

            return allArgs;
        }, cmdLineArgs);
    };
}

export function withFlagArg(name: string, value: boolean | undefined): CommandLineCurryFn {
    return (cmdLineArgs: CommandLineArgs = []) => {
        if (value) {
            return withArg(name)(cmdLineArgs);
        }

        return cmdLineArgs;
    };
}

type WithNamedArgOptions = {
    assignValue?: boolean;
    quote?: boolean;
};
export function withNamedArg(name: string, args: Array<string | undefined> | string | null | undefined, { assignValue = false, quote = true }: WithNamedArgOptions = {}): CommandLineCurryFn {
    return (cmdLineArgs: CommandLineArgs = []) => {
        return toArray(args).map((arg) => quote ? quoted(arg) : escaped(arg)).reduce((allArgs, arg) => {
            if (arg) {
                if (assignValue) {
                    return withArg(`${name}=${arg}`)(allArgs);
                }

                return withArg(name, arg)(allArgs);
            }

            return allArgs;
        }, cmdLineArgs);
    };
}

export const quoted = (value: string | ShellQuotedString | null | undefined): ShellQuotedString | undefined => {
    if (value) {
        if (typeof value === 'string') {
            return {
                value,
                quoting: ShellQuoting.Strong,
            };
        } else {
            return {
                ...value,
                quoting: ShellQuoting.Strong,
            };
        }
    }

    return undefined;
};

export const escaped = (value: string | ShellQuotedString | null | undefined): ShellQuotedString | undefined => {
    if (value) {
        if (typeof value === 'string') {
            return {
                value,
                quoting: ShellQuoting.Escape,
            };
        } else {
            return value;
        }
    }

    return undefined;
};

export const innerQuoted = (value: string | ShellQuotedString | null | undefined): ShellQuotedString | undefined => {
    if (value) {
        if (typeof value === 'string') {
            return {
                value,
                quoting: ShellQuoting.Weak,
            };
        } else {
            return {
                ...value,
                quoting: value.quoting === ShellQuoting.Escape ? ShellQuoting.Weak : value.quoting,
            };
        }
    }

    return undefined;
};
