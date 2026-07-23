/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    NerdctlEventRecordSchema,
    getActorFromEventPayload,
    parseContainerdTopic,
} from '../clients/NerdctlClient/NerdctlEventRecord';

describe('(unit) parseContainerdTopic', () => {
    it('Should map known containerd topics to Docker-like type/action', () => {
        expect(parseContainerdTopic('/containers/create')).to.deep.equal({ type: 'container', action: 'create' });
        expect(parseContainerdTopic('/containers/delete')).to.deep.equal({ type: 'container', action: 'destroy' });
        expect(parseContainerdTopic('/tasks/start')).to.deep.equal({ type: 'container', action: 'start' });
        expect(parseContainerdTopic('/tasks/exit')).to.deep.equal({ type: 'container', action: 'stop' });
        expect(parseContainerdTopic('/tasks/paused')).to.deep.equal({ type: 'container', action: 'pause' });
        expect(parseContainerdTopic('/images/delete')).to.deep.equal({ type: 'image', action: 'delete' });
    });

    it('Should map known categories that are not in the exact-match table', () => {
        expect(parseContainerdTopic('/networks/create')).to.deep.equal({ type: 'network', action: 'create' });
        expect(parseContainerdTopic('/volumes/create')).to.deep.equal({ type: 'volume', action: 'create' });
    });

    it('Should return undefined for snapshot (internal) events', () => {
        expect(parseContainerdTopic('/snapshot/prepare')).to.be.undefined;
        expect(parseContainerdTopic('/snapshot/commit')).to.be.undefined;
    });

    it('Should return undefined when the topic has fewer than two segments', () => {
        expect(parseContainerdTopic('')).to.be.undefined;
        expect(parseContainerdTopic('/tasks')).to.be.undefined;
    });
});

describe('(unit) getActorFromEventPayload', () => {
    it('Should return an empty actor for an undefined payload', () => {
        expect(getActorFromEventPayload(undefined)).to.deep.equal({ id: '', attributes: {} });
    });

    it('Should extract id and attributes from a payload', () => {
        expect(getActorFromEventPayload({ id: 'abc123', image: 'alpine:latest', name: 'my-container' }))
            .to.deep.equal({ id: 'abc123', attributes: { image: 'alpine:latest', name: 'my-container' } });
    });

    it('Should fall back to the key field for snapshot events', () => {
        expect(getActorFromEventPayload({ key: 'snap-1' })).to.deep.equal({ id: 'snap-1', attributes: {} });
    });

    it('Should fall back to container_id for containerd task events', () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        expect(getActorFromEventPayload({ container_id: 'task-container' }))
            .to.deep.equal({ id: 'task-container', attributes: {} });
    });

    it('Should fall back to camelCase containerId for containerd task events', () => {
        expect(getActorFromEventPayload({ containerId: 'task-container' }))
            .to.deep.equal({ id: 'task-container', attributes: {} });
    });

    it('Should prefer id over container_id when both are present', () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        expect(getActorFromEventPayload({ id: 'primary', container_id: 'secondary' }))
            .to.deep.equal({ id: 'primary', attributes: {} });
    });
});

describe('(unit) NerdctlEventRecordSchema', () => {
    it('Should parse the nested Event JSON string into a payload object', () => {
        const parsed = NerdctlEventRecordSchema.parse({
            Timestamp: '2026-01-10T23:38:26.737324778Z',
            Namespace: 'nerdctl',
            Topic: '/containers/create',
            Event: '{"id":"container-id","image":"alpine:latest"}',
        });

        expect(parsed.Topic).to.equal('/containers/create');
        expect(parsed.Event).to.deep.equal({ id: 'container-id', image: 'alpine:latest' });
    });

    it('Should tolerate an invalid Event JSON string by yielding undefined', () => {
        const parsed = NerdctlEventRecordSchema.parse({
            Timestamp: '2026-01-10T23:38:26.737324778Z',
            Topic: '/containers/create',
            Event: 'not-json',
        });

        expect(parsed.Event).to.be.undefined;
    });
});
