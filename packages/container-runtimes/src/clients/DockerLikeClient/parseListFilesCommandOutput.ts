/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { FileItemType, ListFilesCommandOptions, ListFilesItem } from "../../contracts/ContainerClient";

export function parseListFilesCommandLinuxOutput(
    options: ListFilesCommandOptions,
    output: string
): ListFilesItem[] {
    return parseListFilesOutput(
        output,
        /^(?<type>[bcdDlps-])(?<perm>[r-][w-][sStTx-]){3}\s+(?<links>\d+)\s+(?<owner>[a-z0-9_.][a-z0-9_.-]*\$?)\s+(?<group>[a-z0-9_.][a-z0-9_.-]*\$?)\s+(?<size>\d+(, \d+)?)\s+(?<date>\w+\s+\d+)\s+(?<yearOrTime>\d{4}|\d{1,2}:\d{2})\s+(?<name>.*)$/gm,
        parseLinuxType,
        (name) => path.posix.join(options.path, name)
    );
}

export function parseListFilesCommandWindowsOutput(
    options: ListFilesCommandOptions,
    output: string
): ListFilesItem[] {
    return parseListFilesOutput(
        output,
        /^(?<date>\d{1,2}(\/|\.)\d{1,2}(\/|\.)\d{4})\s+(?<time>\d{1,2}:\d{1,2}( (AM|PM))?)\s+(?<type><DIR>|<SYMLINKD>|\d+)\s+(?<name>.*)$/gm,
        parseWindowsType,
        (name) => path.win32.join(options.path, name)
    );
}

function parseListFilesOutput(
    output: string,
    expression: RegExp,
    parseType: (type: string) => FileItemType | 'other',
    pathJoin: (name: string) => string
): ListFilesItem[] {
    let match = expression.exec(output);

    const items: ListFilesItem[] = [];

    while (match !== null) {
        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        const name = match.groups!.name;
        const type = parseType(match.groups!.type);
        /* eslint-enable @typescript-eslint/no-non-null-assertion */

        match = expression.exec(output);

        //
        // NOTE: Do not use `match` below this point.
        //

        // Ignore relative directory items...
        if (type === 'directory' && (name === '.' || name === '..')) {
            continue;
        }

        // Ignore everything other than directories and plain files
        if (type === 'other') {
            continue;
        }

        items.push(
            {
                name,
                path: pathJoin(name),
                type,
            }
        );
    }

    return items;
}

function parseLinuxType(type: string): FileItemType | 'other' {
    switch (type) {
        case 'd':
            return 'directory';
        case '-':
            return 'file';
        default:
            return 'other';
    }
}

function parseWindowsType(typeOrSize: string): FileItemType | 'other' {
    // On Windows, "type" is actually either the type or, if a file, the size
    if (typeOrSize.toUpperCase() === '<DIR>') {
        return 'directory';
    } else if (!Number.isNaN(Number.parseInt(typeOrSize, 10))) {
        return 'file';
    } else {
        return 'other';
    }
}
