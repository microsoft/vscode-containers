/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This file is used to provide vscode specific types when running mocha test cases
 */

/**
 * Defines how an argument should be quoted if it contains
 * spaces or unsupported characters.
 */
export enum ShellQuoting {

    /**
     * Character escaping should be used. This for example
     * uses \ on bash and ` on PowerShell.
     */
    Escape = 1,

    /**
     * Strong string quoting should be used. This for example
     * uses " for Windows cmd and ' for bash and PowerShell.
     * Strong quoting treats arguments as literal strings.
     * Under PowerShell echo 'The value is $(2 * 3)' will
     * print `The value is $(2 * 3)`
     */
    Strong = 2,

    /**
     * Weak string quoting should be used. This for example
     * uses " for Windows cmd, bash and PowerShell. Weak quoting
     * still performs some kind of evaluation inside the quoted
     * string.  Under PowerShell echo "The value is $(2 * 3)"
     * will print `The value is 6`
     */
    Weak = 3
}

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
