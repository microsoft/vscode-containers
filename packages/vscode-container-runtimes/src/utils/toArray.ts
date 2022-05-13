/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/**
 * Coalesces a value to an array
 * @param params Coallesce an array or individual item(s) to an array
 * @returns params as an array
 */
export function toArray<T>(...params: Array<Array<T> | T>): Array<T> {
    return ([] as Array<T>).concat(...params);
}