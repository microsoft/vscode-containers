/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

/**
 * Defines how an argument should be quoted if it contains
 * spaces or unsupported characters.
 */
export const ShellQuoting = {
    /**
     * Character escaping should be used. This for example
     * uses \ on bash and ` on PowerShell.
     */
    Escape: 1,

    /**
     * Strong string quoting should be used. This for example
     * uses " for Windows cmd and ' for bash and PowerShell.
     * Strong quoting treats arguments as literal strings.
     * Under PowerShell echo 'The value is $(2 * 3)' will
     * print `The value is $(2 * 3)`
     */
    Strong: 2,

    /**
     * Weak string quoting should be used. This for example
     * uses " for Windows cmd, bash and PowerShell. Weak quoting
     * still performs some kind of evaluation inside the quoted
     * string.  Under PowerShell echo "The value is $(2 * 3)"
     * will print `The value is 6`
     */
    Weak: 3,
} as const satisfies typeof vscode.ShellQuoting; // The `satisfies` ensures our copy stays in sync with vscode's ShellQuoting enum

export type ShellQuoting = (typeof ShellQuoting)[keyof typeof ShellQuoting];

/**
 * A string that will be quoted depending on the used shell.
 */
export interface ShellQuotedString {
    /**
     * The actual string value.
     */
    value: string;

    /**
     * The quoting style to use.
     */
    quoting: ShellQuoting;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const shellQuotedStringCheck: ShellQuotedString = Object.freeze({
    value: '',
    quoting: ShellQuoting.Escape,
}) satisfies vscode.ShellQuotedString; // The `satisfies` ensures our copy stays in sync with vscode's ShellQuotedString interface
