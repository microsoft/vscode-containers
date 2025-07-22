/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { ShellQuotedString, ShellQuoting } from 'vscode';
import { IShell } from '../contracts/Shell';
import { CommandLineArgs } from './commandLineBuilder';

/**
 * A {@link Shell} class applies quoting rules for a specific shell.
 * Quoth the cmd.exe 'nevermore'.
 */
export abstract class Shell implements IShell {
    public static getShellOrDefault(shell?: Shell | null | undefined): Shell {
        if (shell) {
            return shell;
        }

        if (os.platform() === 'win32') {
            return new Cmd();
        } else {
            return new Bash();
        }
    }

    /**
     * Expands ShellQuotedString for a specific shell
     * @param args Array of {@link CommandLineArgs} to expand
     */
    public abstract quote(args: CommandLineArgs): Array<string>;

    /**
     * Apply shell specific escaping rules to a Go Template string
     * @param arg The string to apply Go Template specific escaping rules for a given shell
     * @param quoting A {@link ShellQuotedString} that is properly escaped for Go Templates in the given shell
     */
    public goTemplateQuotedString(arg: string, quoting: ShellQuoting): ShellQuotedString {
        return {
            value: arg,
            quoting,
        };
    }

    public getShellOrDefault(shell?: string | boolean): string | boolean | undefined {
        return shell || true;
    }
}

/**
 * Quoting/escaping rules for Powershell shell
 */
export class Powershell extends Shell {
    public quote(args: CommandLineArgs): Array<string> {
        const escape = (value: string) => `\`${value}`;

        return args.map((quotedArg) => {
            // If it's a verbatim argument, return it as-is.
            // The overwhelming majority of arguments are `ShellQuotedString`, so
            // verbatim arguments will only show up if `withVerbatimArg` is used.
            if (typeof quotedArg === 'string') {
                return quotedArg;
            }

            switch (quotedArg.quoting) {
                case ShellQuoting.Escape:
                    return quotedArg.value.replace(/[ "'()]/g, escape);
                case ShellQuoting.Weak:
                    return `"${quotedArg.value.replace(/["]/g, escape)}"`;
                case ShellQuoting.Strong:
                    return `'${quotedArg.value.replace(/[']/g, escape)}'`;
            }
        });
    }

    public override goTemplateQuotedString(arg: string, quoting: ShellQuoting): ShellQuotedString {
        switch (quoting) {
            case ShellQuoting.Escape:
                return { value: arg, quoting };
            case ShellQuoting.Weak:
            case ShellQuoting.Strong:
                return {
                    value: arg.replace(/["]/g, (value) => `\\${value}`),
                    quoting,
                };
        }
    }

    public override getShellOrDefault(shell?: string | boolean | undefined): string | boolean | undefined {
        if (typeof shell !== 'string' && shell !== false) {
            return 'powershell.exe';
        }

        return shell;
    }
}

/**
 * Quoting/escaping rules for bash/zsh shell
 */
export class Bash extends Shell {
    public quote(args: CommandLineArgs): Array<string> {
        const escape = (value: string) => `\\${value}`;

        return args.map((quotedArg) => {
            // If it's a verbatim argument, return it as-is.
            // The overwhelming majority of arguments are `ShellQuotedString`, so
            // verbatim arguments will only show up if `withVerbatimArg` is used.
            if (typeof quotedArg === 'string') {
                return quotedArg;
            }

            switch (quotedArg.quoting) {
                case ShellQuoting.Escape:
                    return quotedArg.value.replace(/[ "']/g, escape);
                case ShellQuoting.Weak:
                    return `"${quotedArg.value.replace(/["]/g, escape)}"`;
                case ShellQuoting.Strong:
                    return `'${quotedArg.value.replace(/[']/g, escape)}'`;
            }
        });
    }
}

/**
 * Quoting/escaping rules for cmd shell
 */
export class Cmd extends Shell {
    public quote(args: CommandLineArgs): Array<string> {
        const escapeQuote = (value: string) => `\\${value}`;
        const escape = (value: string) => `^${value}`;

        return args.map((quotedArg) => {
            // If it's a verbatim argument, return it as-is.
            // The overwhelming majority of arguments are `ShellQuotedString`, so
            // verbatim arguments will only show up if `withVerbatimArg` is used.
            if (typeof quotedArg === 'string') {
                return quotedArg;
            }

            switch (quotedArg.quoting) {
                case ShellQuoting.Escape:
                    return quotedArg.value.replace(/[ "^&\\<>|]/g, escape);
                case ShellQuoting.Weak:
                    return quotedArg.value.replace(/[ "^&\\<>|]/g, escape);
                case ShellQuoting.Strong:
                    return `"${quotedArg.value.replace(/["]/g, escapeQuote)}"`;
            }
        });
    }
}

/**
 * Quoting/escaping rules for no shell
 */
export class NoShell extends Shell {
    private readonly isWindows: boolean;

    public constructor(isWindows?: boolean) {
        super();

        this.isWindows = typeof isWindows === 'boolean' ? isWindows : os.platform() === 'win32';
    }

    public quote(args: CommandLineArgs): Array<string> {
        const windowsEscape = (value: string) => `\\${value}`;

        return args.map((quotedArg) => {
            // If it's a verbatim argument, return it as-is.
            // The overwhelming majority of arguments are `ShellQuotedString`, so
            // verbatim arguments will only show up if `withVerbatimArg` is used.
            if (typeof quotedArg === 'string') {
                return quotedArg;
            }

            // Windows requires special quoting behavior even when running without a shell
            // to allow us to use windowsVerbatimArguments: true
            if (this.isWindows) {
                switch (quotedArg.quoting) {
                    case ShellQuoting.Weak:
                    case ShellQuoting.Strong:
                        return `"${quotedArg.value.replace(/["]/g, windowsEscape)}"`;
                    default:
                        return quotedArg.value;
                }
            }

            return quotedArg.value;
        });
    }

    public override getShellOrDefault(shell?: string | boolean | undefined): string | boolean | undefined {
        return false;
    }
}
