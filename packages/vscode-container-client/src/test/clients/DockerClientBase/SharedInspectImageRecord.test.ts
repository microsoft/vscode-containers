/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    SharedInspectImageRecordSchema,
    normalizeInspectImageRecord,
} from '../../../clients/DockerClientBase/SharedInspectImageRecord';

describe('(unit) normalizeInspectImageRecord', () => {
    it('Should normalize a full Docker-style image inspect record', () => {
        const record = {
            Id: 'sha256:abc',
            RepoTags: ['some/repository:sometag'],
            RepoDigests: ['localhost/some/repository@sha256:deadbeef'],
            Architecture: 'x86_64',
            Os: 'linux',
            Created: '2024-06-01T12:00:00Z',
            Config: {
                Entrypoint: '/entry.sh',
                Cmd: ['sh', '-c', 'echo hi'],
                Env: ['A=1', 'B=2'],
                Labels: { 'com.example.k': 'v' },
                ExposedPorts: { '80/tcp': {} },
                Volumes: { '/data': {} },
                WorkingDir: '/app',
                User: 'appuser',
            },
        };

        const raw = JSON.stringify(record);
        const result = normalizeInspectImageRecord(SharedInspectImageRecordSchema.parse(record), raw);

        expect(result.id).to.equal('sha256:abc');
        expect(result.image.originalName).to.equal('some/repository:sometag');
        expect(result.isLocalImage).to.equal(true);
        expect(result.environmentVariables).to.deep.equal({ A: '1', B: '2' });
        expect(result.ports).to.deep.equal([{ containerPort: 80, protocol: 'tcp' }]);
        expect(result.volumes).to.deep.equal(['/data']);
        expect(result.labels).to.deep.equal({ 'com.example.k': 'v' });
        // Entrypoint was a scalar string; the shared transform coalesces it to an array
        expect(result.entrypoint).to.deep.equal(['/entry.sh']);
        expect(result.command).to.deep.equal(['sh', '-c', 'echo hi']);
        expect(result.currentDirectory).to.equal('/app');
        expect(result.architecture).to.equal('amd64');
        expect(result.operatingSystem).to.equal('linux');
        expect(result.createdAt).to.be.a('Date');
        expect(result.user).to.equal('appuser');
        expect(result.raw).to.equal(raw);
    });

    it('Should treat an image with a non-localhost repo digest as not local', () => {
        const record = {
            Id: 'sha256:abc',
            RepoTags: ['some/repository:sometag'],
            RepoDigests: ['registry.example.com/some/repository@sha256:deadbeef'],
        };

        const result = normalizeInspectImageRecord(SharedInspectImageRecordSchema.parse(record), '{}');

        expect(result.isLocalImage).to.equal(false);
        expect(result.repoDigests).to.deep.equal(['registry.example.com/some/repository@sha256:deadbeef']);
    });

    it('Should treat an image with no repo digests as local', () => {
        const record = {
            Id: 'sha256:abc',
            RepoTags: ['some/repository:sometag'],
        };

        const result = normalizeInspectImageRecord(SharedInspectImageRecordSchema.parse(record), '{}');

        expect(result.isLocalImage).to.equal(true);
        expect(result.repoDigests).to.deep.equal([]);
    });

    it('Should fall back to top-level Labels and User (Podman-style) when Config omits them', () => {
        const record = {
            Id: 'sha256:abc',
            RepoTags: ['some/repository:sometag'],
            Labels: { 'top.level': 'label' },
            User: 'topuser',
            Config: {},
        };

        const result = normalizeInspectImageRecord(SharedInspectImageRecordSchema.parse(record), '{}');

        expect(result.labels).to.deep.equal({ 'top.level': 'label' });
        expect(result.user).to.equal('topuser');
    });

    it('Should coalesce null Entrypoint/Cmd to empty arrays', () => {
        const record = {
            Id: 'sha256:abc',
            RepoTags: ['some/repository:sometag'],
            Config: {
                Entrypoint: null,
                Cmd: null,
            },
        };

        const result = normalizeInspectImageRecord(SharedInspectImageRecordSchema.parse(record), '{}');

        expect(result.entrypoint).to.deep.equal([]);
        expect(result.command).to.deep.equal([]);
    });
});
