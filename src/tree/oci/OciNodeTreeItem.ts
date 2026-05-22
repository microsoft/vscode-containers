/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { l10n, MarkdownString, ThemeIcon, TreeItemCollapsibleState, Uri } from "vscode";
import { toOciBlobUri } from "../../oci/ociBlobContentProvider";
import { getKindDisplayLabel, LayoutNode } from "../../oci/ociLayout";
import { ToolTipParentTreeItem } from "../ToolTipTreeItem";

export class OciNodeTreeItem extends ToolTipParentTreeItem {
    public static readonly contextValue: string = 'ociNode';
    public contextValue: string = OciNodeTreeItem.contextValue;
    public declare readonly initialCollapsibleState: TreeItemCollapsibleState | undefined;

    private readonly _node: LayoutNode;
    private readonly _nodesByKey: Record<string, LayoutNode>;

    public constructor(parent: AzExtParentTreeItem, node: LayoutNode, nodesByKey: Record<string, LayoutNode>, index: number) {
        super(parent);

        this._node = node;
        this._nodesByKey = nodesByKey;
        this.id = index.toString().padStart(4, '0');

        if (node.children.length === 0) {
            this.initialCollapsibleState = TreeItemCollapsibleState.None;
        }

        if (node.filePath) {
            this.commandId = 'vscode.open';
            this.commandArgs = [
                node.kind === 'layer' ? Uri.file(node.filePath) : toOciBlobUri(node.filePath),
            ];
        }
    }

    public get label(): string {
        return this._node.label;
    }

    public get description(): string {
        const details = [getKindDisplayLabel(this._node.kind)];

        if (this._node.name && !getNodePrimaryName(this._node).includes(this._node.name)) {
            details.push(this._node.name);
        }

        if (this._node.mediaType) {
            details.push(this._node.mediaType.replace(/^application\/vnd\./, ''));
        }

        if (this._node.digest) {
            details.push(this._node.digest.slice(0, 19));
        }

        return details.join(' • ');
    }

    public get iconPath(): ThemeIcon {
        switch (this._node.kind) {
            case 'image-index':
                return new ThemeIcon('references');
            case 'image-manifest':
                return new ThemeIcon('package');
            case 'config':
                return new ThemeIcon('settings-gear');
            case 'layer':
                return new ThemeIcon('archive');
            case 'layout':
                return new ThemeIcon('folder-library');
            default:
                return new ThemeIcon('file');
        }
    }

    public get filePath(): string | undefined {
        return this._node.filePath ?? undefined;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, _context: IActionContext): Promise<AzExtTreeItem[]> {
        return this._node.children.map(
            (child, index) => new OciNodeTreeItem(this, this._nodesByKey[child.key], this._nodesByKey, index)
        );
    }

    public compareChildrenImpl(item1: AzExtTreeItem, item2: AzExtTreeItem): number {
        return item1.id.localeCompare(item2.id);
    }

    public async resolveTooltipInternal(actionContext: IActionContext): Promise<MarkdownString> {
        actionContext.telemetry.properties.tooltipType = 'ociNode';

        const lines = [`**${this._node.label}**`, '', l10n.t('Kind: `{0}`', getKindDisplayLabel(this._node.kind))];

        if (this._node.mediaType) {
            lines.push(l10n.t('Media type: `{0}`', this._node.mediaType));
        }

        if (this._node.digest) {
            lines.push(l10n.t('Digest: `{0}`', this._node.digest));
        }

        if (this._node.filePath) {
            lines.push(l10n.t('File: `{0}`', this._node.filePath));
        }

        return new MarkdownString(lines.join('\n\n'));
    }
}

function getNodePrimaryName(node: Pick<LayoutNode, 'displayName' | 'name'>): string {
    return node.displayName || node.name;
}
