/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListNetworkItem } from '../../contracts/ContainerClient';
import { normalizeInspectNetworkRecordAsListItem, SharedInspectNetworkRecordSchema } from '../DockerClientBase/SharedInspectNetworkRecord';
import { normalizeListNetworkRecord, SharedListNetworkRecordSchema } from '../DockerClientBase/SharedListNetworkRecord';

/**
 * The `wslc network list --format json` shape emitted by wslc 2.9.8 and later: Docker's
 * `network ls --format json` record (`ID`, `"true"`/`"false"` strings, comma-joined `Labels`,
 * `CreatedAt` date string), which {@link SharedListNetworkRecordSchema} already models.
 *
 * `ID` is required here purely to discriminate this shape from the legacy one below; wslc always
 * emits it. Note that wslc truncates the id to 12 characters because `network list` has no
 * `--no-trunc` flag on the wslc releases the client supports.
 */
const WslcCurrentListNetworkRecordSchema = z.pipe(
    z.extend(SharedListNetworkRecordSchema, { ID: z.string() }),
    z.transform((network): ListNetworkItem => normalizeListNetworkRecord(network)),
);

/**
 * The `wslc network list --format json` shape emitted by wslc 2.9.7 and earlier: the same
 * inspect-style object shape as `wslc inspect --type network` (`Id`, real booleans, record
 * `Labels`, epoch-seconds `Created`).
 */
const WslcLegacyListNetworkRecordSchema = z.pipe(
    SharedInspectNetworkRecordSchema,
    z.transform((network): ListNetworkItem => normalizeInspectNetworkRecordAsListItem(network)),
);

/**
 * `wslc network list --format json` switched from the inspect-style object shape to Docker's flat
 * `network ls` shape in wslc 2.9.8. Both are accepted so the extension works against either wslc
 * generation, and both normalize to {@link ListNetworkItem}.
 *
 * The current shape is tried first because it is the more specific of the two: it requires the
 * `ID` key that the legacy shape spells `Id`.
 */
export const WslcListNetworkRecordSchema = z.union([
    WslcCurrentListNetworkRecordSchema,
    WslcLegacyListNetworkRecordSchema,
]);
