/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Dayjs } from 'dayjs';
import { dayjs } from '../../utils/dayjs';

/**
 * Parse a raw created-at value into a Dayjs, falling back to the current time
 * when it is missing or invalid. Useful as a baseline for comparisons where an
 * invalid operand would otherwise produce surprising results (dayjs comparisons
 * against an invalid Dayjs are always `false`).
 */
export function resolveCreatedAtBaseline(raw: string | number | undefined): Dayjs {
    const parsed = dayjs.utc(raw);
    return parsed.isValid() ? parsed : dayjs.utc();
}

/**
 * How a list-style created-at value should be resolved.
 *
 * - `lenient` reproduces Docker's behavior: an invalid date becomes an
 *   `Invalid Date` and a missing date becomes the current time.
 * - `validated` (used by runtimes such as nerdctl) throws in strict mode when
 *   the date is missing or invalid, and otherwise falls back to the current time
 *   (less misleading than an Invalid Date).
 */
export type CreatedAtMode = 'lenient' | 'validated';

/**
 * Resolve a list-style created-at string to a Date, per the given
 * {@link CreatedAtMode}.
 */
export function resolveCreatedAt(raw: string | undefined, strict: boolean, mode: CreatedAtMode): Date {
    const validateDate = mode === 'validated';

    if (raw) {
        const parsed = dayjs.utc(raw);
        if (parsed.isValid()) {
            return parsed.toDate();
        }
        if (validateDate) {
            if (strict) {
                throw new Error(`Invalid container creation date: ${raw}`);
            }
            return new Date(); // Use current time as fallback (less misleading than an Invalid Date)
        }
        return parsed.toDate(); // Docker: preserve the (invalid) parse result
    }

    if (validateDate && strict) {
        throw new Error('Container creation date is missing');
    }
    // Docker: dayjs.utc(undefined) yields the current time
    return validateDate ? new Date() : dayjs.utc(raw).toDate();
}
