/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { LocalRootTreeItemBase } from '../../../tree/LocalRootTreeItemBase';
import { ContainerGroupTreeItem } from '../../../tree/containers/ContainerGroupTreeItem';
import { ContainerProperty, NonComposeGroupName, composeProjectLabel, swarmStackNamespaceLabel } from '../../../tree/containers/ContainerProperties';
import { DockerContainerInfo } from '../../../tree/containers/ContainersTreeItem';

function makeParent(groupBySetting: ContainerProperty): LocalRootTreeItemBase<DockerContainerInfo, ContainerProperty> {
    return { groupBySetting, compareChildrenImpl: () => 0 } as unknown as LocalRootTreeItemBase<DockerContainerInfo, ContainerProperty>;
}

function makeContainerInfo(labels?: { [key: string]: string }): DockerContainerInfo {
    return { id: 'abc', name: 'c', labels } as unknown as DockerContainerInfo;
}

suite('(unit) ContainerGroupTreeItem.contextValue', () => {
    test('Is "containerGroup;composeGroup" for a compose project group', () => {
        const group = new ContainerGroupTreeItem(
            makeParent('Compose Project Name'),
            'my-project',
            [makeContainerInfo({ [composeProjectLabel]: 'my-project' })]
        );
        assert.strictEqual(group.contextValue, 'containerGroup;composeGroup');
    });

    test('Is "containerGroup" for a Docker Swarm stack group (suppresses compose commands)', () => {
        const group = new ContainerGroupTreeItem(
            makeParent('Compose Project Name'),
            'my-stack',
            [makeContainerInfo({ [swarmStackNamespaceLabel]: 'my-stack' })]
        );
        assert.strictEqual(group.contextValue, 'containerGroup');
    });

    test('Is "containerGroup" for the individual containers group', () => {
        const group = new ContainerGroupTreeItem(
            makeParent('Compose Project Name'),
            NonComposeGroupName,
            [makeContainerInfo({ [composeProjectLabel]: 'my-project' })]
        );
        assert.strictEqual(group.contextValue, 'containerGroup');
    });
});
