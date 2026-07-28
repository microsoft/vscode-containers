/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    SharedInspectContainerRecordSchema,
    normalizeInspectContainerRecord,
} from '../clients/DockerClientBase/SharedInspectContainerRecord';

describe('(unit) SharedInspectContainerRecordSchema mounts', () => {
    const baseRecord = {
        Id: 'abc123',
        Name: '/my-container',
        Image: 'alpine:latest',
        Created: '2026-01-10T23:38:26.737324778Z',
    };

    it('Should not drop the whole container when an unrecognized mount type is present', () => {
        const raw = JSON.stringify({
            ...baseRecord,
            Mounts: [
                { Type: 'bind', Source: '/host/path', Destination: '/container/path', RW: true },
                { Type: 'tmpfs', Destination: '/tmp', RW: true },
                { Type: 'volume', Name: 'myvol', Source: '/var/lib/vol', Destination: '/data', RW: true },
            ],
        });

        const parsed = SharedInspectContainerRecordSchema.parse(JSON.parse(raw));
        const normalized = normalizeInspectContainerRecord(parsed, raw, { defaultVolumeDriver: 'local' });

        // The tmpfs mount is skipped, but bind + volume survive (container is not dropped).
        expect(normalized.mounts).to.have.lengthOf(2);
        expect(normalized.mounts.map((m) => m.type)).to.deep.equal(['bind', 'volume']);
    });

    it('Should parse a container with only unrecognized mount types without throwing', () => {
        const raw = JSON.stringify({
            ...baseRecord,
            Mounts: [
                { Type: 'tmpfs', Destination: '/tmp' },
                { Type: 'npipe', Source: '\\\\.\\pipe\\x', Destination: '\\\\.\\pipe\\y' },
            ],
        });

        const parsed = SharedInspectContainerRecordSchema.parse(JSON.parse(raw));
        const normalized = normalizeInspectContainerRecord(parsed, raw, { defaultVolumeDriver: 'local' });

        expect(normalized.mounts).to.deep.equal([]);
    });
});

