/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    DockerListImageOptions,
    NerdctlListImageOptions,
    SharedListImageRecordSchema,
    normalizeListImageRecord,
} from '../../../clients/DockerClientBase/SharedListImageRecord';

describe('(unit) normalizeListImageRecord', () => {
    it('Should compose the repository and tag into the image name', () => {
        const parsed = SharedListImageRecordSchema.parse({
            ID: 'sha256:abc',
            Repository: 'some/repository',
            Tag: 'sometag',
            CreatedAt: '2021-06-08 08:07:21 +0100 BST',
            Size: '1MB',
        });

        const result = normalizeListImageRecord(parsed);

        expect(result.id).to.equal('sha256:abc');
        expect(result.image.originalName).to.equal('some/repository:sometag');
        expect(result.image.image).to.equal('some/repository');
        expect(result.image.tag).to.equal('sometag');
        expect(result.size).to.equal(1_048_576);
        expect(result.createdAt).to.be.a('Date');
    });

    it('Should fall back to an empty id when ID is omitted', () => {
        const parsed = SharedListImageRecordSchema.parse({
            Repository: 'some/repository',
            Tag: 'sometag',
        });

        const result = normalizeListImageRecord(parsed);

        expect(result.id).to.equal('');
    });

    it('Should keep a <none> tag for Docker (default options)', () => {
        const parsed = SharedListImageRecordSchema.parse({
            Repository: 'some/repository',
            Tag: '<none>',
        });

        const result = normalizeListImageRecord(parsed, DockerListImageOptions);

        expect(result.image.originalName).to.equal('some/repository:<none>');
    });

    it('Should drop a <none> tag for nerdctl', () => {
        const parsed = SharedListImageRecordSchema.parse({
            Repository: 'some/repository',
            Tag: '<none>',
        });

        const result = normalizeListImageRecord(parsed, NerdctlListImageOptions);

        expect(result.image.originalName).to.equal('some/repository');
    });

    it('Should omit the tag when it is absent or blank', () => {
        const parsed = SharedListImageRecordSchema.parse({
            Repository: 'some/repository',
            Tag: '   ',
        });

        const result = normalizeListImageRecord(parsed);

        expect(result.image.originalName).to.equal('some/repository');
    });
});
