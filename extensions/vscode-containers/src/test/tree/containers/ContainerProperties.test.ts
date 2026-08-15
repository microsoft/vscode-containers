/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ListContainersItem } from '@microsoft/vscode-container-client';
import assert from 'assert';
import { getComposeProjectGroup, NonComposeGroupName } from '../../../tree/containers/ContainerProperties';

function makeContainer(labels: { [key: string]: string } | undefined): ListContainersItem {
    return {
        labels: labels,
    } as ListContainersItem;
}

suite('(unit) ContainerProperties.getComposeProjectGroup', () => {
    test('Groups compose containers by their compose project name', () => {
        const container = makeContainer({ 'com.docker.compose.project': 'myproject' });
        assert.strictEqual(getComposeProjectGroup(container), 'myproject');
    });

    test('Groups swarm stack containers by their stack namespace', () => {
        const container = makeContainer({ 'com.docker.stack.namespace': 'mystack' });
        assert.strictEqual(getComposeProjectGroup(container), 'mystack');
    });

    test('Prefers the compose project name when both labels are present', () => {
        const container = makeContainer({
            'com.docker.compose.project': 'myproject',
            'com.docker.stack.namespace': 'mystack',
        });
        assert.strictEqual(getComposeProjectGroup(container), 'myproject');
    });

    test('Returns the non-compose group name for standalone containers', () => {
        assert.strictEqual(getComposeProjectGroup(makeContainer({})), NonComposeGroupName);
        assert.strictEqual(getComposeProjectGroup(makeContainer(undefined)), NonComposeGroupName);
        assert.strictEqual(getComposeProjectGroup(makeContainer({ 'some.other.label': 'value' })), NonComposeGroupName);
    });
});
