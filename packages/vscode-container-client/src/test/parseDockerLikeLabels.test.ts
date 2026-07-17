/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { parseDockerLikeLabels } from '../clients/DockerClientBase/parseDockerLikeLabels';

describe('(unit) parseDockerLikeLabels', () => {
    it('Should parse an empty string correctly', () => {
        expect(parseDockerLikeLabels('')).to.deep.equal({});
    });

    it('Should parse a single label correctly', () => {
        expect(parseDockerLikeLabels('com.docker.compose.project=demo')).to.deep.equal({
            'com.docker.compose.project': 'demo',
        });
    });

    it('Should parse multiple labels correctly', () => {
        expect(parseDockerLikeLabels('foo=bar,baz=qux')).to.deep.equal({
            foo: 'bar',
            baz: 'qux',
        });
    });

    it('Should parse an empty label value correctly', () => {
        expect(parseDockerLikeLabels('foo=,baz=qux')).to.deep.equal({
            foo: '',
            baz: 'qux',
        });
    });

    it('Should preserve commas in label values', () => {
        expect(parseDockerLikeLabels('com.docker.compose.project.config_files=/a/base.yml,/a/local.yml,com.docker.compose.project=demo')).to.deep.equal({
            'com.docker.compose.project.config_files': '/a/base.yml,/a/local.yml',
            'com.docker.compose.project': 'demo',
        });
    });

    it('Should preserve multiple commas in a single label value', () => {
        expect(parseDockerLikeLabels('files=/a.yml,/b.yml,/c.yml,project=demo')).to.deep.equal({
            files: '/a.yml,/b.yml,/c.yml',
            project: 'demo',
        });
    });

    it('Should preserve commas in the final label value', () => {
        expect(parseDockerLikeLabels('project=demo,files=/a.yml,/b.yml')).to.deep.equal({
            project: 'demo',
            files: '/a.yml,/b.yml',
        });
    });

    it('Should preserve equals signs in label values', () => {
        expect(parseDockerLikeLabels('foo=a=b,baz=qux')).to.deep.equal({
            foo: 'a=b',
            baz: 'qux',
        });
    });
});
