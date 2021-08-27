/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vscode-languageserver-textdocument';
import { CST } from 'yaml';
import { ComposeDocument } from './ComposeDocument';

type ItemType = 'start' | 'key' | 'sep' | 'value';

export class ExtendedPosition {
    private constructor(
        public readonly item: CST.CollectionItem,
        public readonly itemType: ItemType,
        public readonly logicalPath: string,
    ) { }

    public static build(doc: ComposeDocument, position: Position): ExtendedPosition {
        const offset = doc.textDocument.offsetAt(position);

        const { item, path } = ExtendedPosition.loadItemAndPath(doc.documentCst, offset);
        if (!item || !path) {
            throw new Error(`Failed to load item at position (${position.line}, ${position.character}).`);
        }

        const itemType = ExtendedPosition.loadType(item, offset);
        const logicalPath = ExtendedPosition.loadLogicalPath(doc.documentCst, item, path, itemType);

        return new ExtendedPosition(item, itemType, logicalPath);
    }

    private static loadItemAndPath(cst: CST.Document, offset: number): { item: CST.CollectionItem | undefined, path: CST.VisitPath | undefined } {
        let currentItem: CST.CollectionItem | undefined;
        let currentPath: CST.VisitPath | undefined;

        CST.visit(cst, (item, path) => {
            const itemStart =
                item.start?.[0]?.offset ??
                item.key?.offset ??
                item.sep?.[0]?.offset ??
                item.value?.offset ??
                -1;

            if (itemStart > offset) {
                // As soon as we get past the offset, break;
                // The previous item is the `CollectionItem` at the position specified
                return CST.visit.BREAK;
            }

            currentItem = item;
            currentPath = path;
            return;
        });

        return {
            item: currentItem,
            path: currentPath,
        };
    }

    private static loadType(item: CST.CollectionItem, offset: number): ItemType {
        for (const start of item.start) {
            if (start.offset <= offset &&
                start.offset + start.source.length > offset) {
                return 'start';
            }
        }

        if (CST.isScalar(item.key) &&
            item.key.offset <= offset &&
            item.key.offset + item.key.source.length > offset) {
            return 'key';
        }

        for (const sep of item.sep ?? []) {
            if (sep.offset <= offset &&
                sep.offset + sep.source.length > offset) {
                return 'sep';
            }
        }

        // If it's not on the start, key, or separator, the only possible position is in the value
        return 'value';
    }

    private static loadLogicalPath(cst: CST.Document, item: CST.CollectionItem, path: CST.VisitPath, itemType: ItemType): string {
        const resultParts: string[] = [];

        // If it's a key, we want the actual key text as the logical path
        // Otherwise we just put <theType>
        if (itemType === 'key' && CST.isScalar(item.key)) {
            resultParts.unshift(item.key.source);
        } else {
            resultParts.unshift(`<${itemType}>`);
        }

        // To get the rest of the logical path, we must step backward to the root
        // In properly formatted compose documents it will be keys the rest of the way up
        for (let i = path.length - 1; i > 0; i--) {
            const parentPath = path.slice(0, i);
            const parent = CST.visit.itemAtPath(cst, parentPath);
            if (CST.isScalar(parent?.key)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                resultParts.unshift(parent!.key.source);
            }
        }

        return `/${resultParts.join('/')}`;
    }
}
