/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    architectureStringSchema,
    booleanStringSchema,
    dateStringSchema,
    dateStringWithFallbackSchema,
    labelsSchema,
    labelsStringSchema,
    osTypeStringSchema,
} from '../contracts/ZodTransforms';

describe('(unit) ZodTransforms', () => {
    describe('dateStringSchema', () => {
        it('Should parse ISO 8601 strings', () => {
            const result = dateStringSchema.parse('2024-06-01T12:00:00Z');
            expect(result).to.be.instanceOf(Date);
            expect(result!.getTime()).to.equal(Date.parse('2024-06-01T12:00:00Z'));
        });

        it('Should parse Docker-style timestamps', () => {
            const result = dateStringSchema.parse('2024-06-01 12:00:00 +0000 UTC');
            expect(result).to.be.instanceOf(Date);
            expect(result!.getUTCFullYear()).to.equal(2024);
            expect(result!.getUTCMonth()).to.equal(5); // June (0-based)
        });

        it('Should return undefined for invalid input', () => {
            expect(dateStringSchema.parse('not-a-date')).to.be.undefined;
        });
    });

    describe('dateStringWithFallbackSchema', () => {
        it('Should parse valid dates', () => {
            const result = dateStringWithFallbackSchema.parse('2024-06-01T12:00:00Z');
            expect(result.getTime()).to.equal(Date.parse('2024-06-01T12:00:00Z'));
        });

        it('Should fall back to a valid Date for invalid input', () => {
            const result = dateStringWithFallbackSchema.parse('not-a-date');
            expect(result).to.be.instanceOf(Date);
            expect(Number.isNaN(result.getTime())).to.be.false;
        });
    });

    describe('booleanStringSchema', () => {
        it('Should parse boolean-like strings', () => {
            expect(booleanStringSchema.parse('true')).to.be.true;
            expect(booleanStringSchema.parse('false')).to.be.false;
            expect(booleanStringSchema.parse('TRUE')).to.be.true;
        });

        it('Should reject non-boolean strings', () => {
            expect(booleanStringSchema.safeParse('bogus').success).to.be.false;
        });
    });

    describe('labelsStringSchema', () => {
        it('Should parse comma-separated key=value pairs', () => {
            expect(labelsStringSchema.parse('a=1,b=2')).to.deep.equal({ a: '1', b: '2' });
        });

        it('Should return an empty object for empty/whitespace strings', () => {
            expect(labelsStringSchema.parse('')).to.deep.equal({});
            expect(labelsStringSchema.parse('   ')).to.deep.equal({});
        });

        it('Should preserve commas in label values', () => {
            expect(labelsStringSchema.parse('com.docker.compose.project.config_files=/a/base.yml,/a/local.yml,com.docker.compose.project=demo')).to.deep.equal({
                'com.docker.compose.project.config_files': '/a/base.yml,/a/local.yml',
                'com.docker.compose.project': 'demo',
            });
        });

        it('Should preserve equals signs in label values', () => {
            expect(labelsStringSchema.parse('foo=a=b,baz=qux')).to.deep.equal({ foo: 'a=b', baz: 'qux' });
        });
    });

    describe('labelsSchema', () => {
        it('Should accept a string and parse it', () => {
            expect(labelsSchema.parse('a=1')).to.deep.equal({ a: '1' });
        });

        it('Should accept an already-parsed record', () => {
            expect(labelsSchema.parse({ x: 'y' })).to.deep.equal({ x: 'y' });
        });
    });

    describe('osTypeStringSchema', () => {
        it('Should normalize OS strings case-insensitively', () => {
            expect(osTypeStringSchema.parse('Linux')).to.equal('linux');
            expect(osTypeStringSchema.parse('WINDOWS')).to.equal('windows');
        });

        it('Should return undefined for unknown OS strings', () => {
            expect(osTypeStringSchema.parse('freebsd')).to.be.undefined;
        });
    });

    describe('architectureStringSchema', () => {
        it('Should normalize architecture aliases', () => {
            expect(architectureStringSchema.parse('x86_64')).to.equal('amd64');
            expect(architectureStringSchema.parse('amd64')).to.equal('amd64');
            expect(architectureStringSchema.parse('aarch64')).to.equal('arm64');
            expect(architectureStringSchema.parse('arm64')).to.equal('arm64');
        });

        it('Should return undefined for unknown architectures', () => {
            expect(architectureStringSchema.parse('riscv64')).to.be.undefined;
        });
    });
});
