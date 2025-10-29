/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from "vscode";
import { ext } from "../extensionVariables";
import { TreePrefix } from "../tree/TreePrefix";

interface TreeFilterState {
  filterText: string;
  isActive: boolean;
}

const treeFilters: Map<TreePrefix, TreeFilterState> = new Map();

export function getTreeFilter(treePrefix: TreePrefix): TreeFilterState {
  return treeFilters.get(treePrefix) || { filterText: "", isActive: false };
}

export function setTreeFilter(
  treePrefix: TreePrefix,
  filterText: string
): void {
  treeFilters.set(treePrefix, {
    filterText: filterText.toLowerCase(),
    isActive: filterText.length > 0,
  });
}

export function clearTreeFilter(treePrefix: TreePrefix): void {
  treeFilters.set(treePrefix, { filterText: "", isActive: false });
}

export function shouldShowItem(
  treePrefix: TreePrefix,
  searchableText: string
): boolean {
  const filter = getTreeFilter(treePrefix);
  if (!filter.isActive) {
    return true;
  }
  return searchableText.toLowerCase().includes(filter.filterText);
}

/**
 * Command to filter a tree view
 */
export async function filterTreeView(
  context: IActionContext,
  treePrefix: TreePrefix
): Promise<void> {
  const currentFilter = getTreeFilter(treePrefix);

  const quickPick = vscode.window.createQuickPick();
  quickPick.placeholder = `Filter ${treePrefix}... (Press Enter to apply, Esc to cancel)`;
  quickPick.value = currentFilter.filterText;
  quickPick.title = `Filter ${capitalize(treePrefix)}`;

  if (currentFilter.isActive) {
    quickPick.items = [
      {
        label: "$(clear-all) Clear Filter",
        description: `Currently filtering by: "${currentFilter.filterText}"`,
      },
    ];
  }

  quickPick.onDidAccept(() => {
    const value = quickPick.value.trim();
    const selectedItem = quickPick.selectedItems[0];

    // Check if "Clear Filter" was selected
    if (selectedItem?.label === "$(clear-all) Clear Filter") {
      clearTreeFilter(treePrefix);
      context.telemetry.properties.action = "clearFilter";
    } else if (value) {
      setTreeFilter(treePrefix, value);
      context.telemetry.properties.action = "applyFilter";
      context.telemetry.properties.filterLength = value.length.toString();
    } else {
      clearTreeFilter(treePrefix);
      context.telemetry.properties.action = "clearFilter";
    }

    quickPick.hide();
    void refreshTreeView(treePrefix);
  });

  quickPick.onDidHide(() => {
    quickPick.dispose();
  });

  quickPick.show();
}

/**
 * Update the tree view title to show filter status
 */
export function updateTreeViewTitle(treePrefix: TreePrefix): void {
  const filter = getTreeFilter(treePrefix);
  const treeView = getTreeViewForPrefix(treePrefix);

  if (!treeView) {
    return;
  }

  if (filter.isActive) {
    treeView.description = `Filtered: "${filter.filterText}"`;
  } else {
    treeView.description = undefined;
  }
}

function getTreeViewForPrefix(
  treePrefix: TreePrefix
): vscode.TreeView<unknown> | undefined {
  switch (treePrefix) {
    case "containers":
      return ext.containersTreeView;
    case "images":
      return ext.imagesTreeView;
    default:
      return undefined;
  }
}

async function refreshTreeView(treePrefix: TreePrefix): Promise<void> {
  updateTreeViewTitle(treePrefix);

  // Get the root and refresh it
  const root = getTreeRootForPrefix(treePrefix);
  if (root) {
    await root.refresh(undefined);
  }
}

function getTreeRootForPrefix(
  treePrefix: TreePrefix
): { refresh(context: IActionContext): Promise<void> } | undefined {
  switch (treePrefix) {
    case "containers":
      return ext.containersRoot;
    case "images":
      return ext.imagesRoot;
    default:
      return undefined;
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function filterContainersTree(
  context: IActionContext
): Promise<void> {
  await filterTreeView(context, "containers");
}

export async function filterImagesTree(context: IActionContext): Promise<void> {
  await filterTreeView(context, "images");
}

export async function clearContainersFilter(
  context: IActionContext
): Promise<void> {
  clearTreeFilter("containers");
  context.telemetry.properties.action = "clearFilter";
  void refreshTreeView("containers");
}

export async function clearImagesFilter(
  context: IActionContext
): Promise<void> {
  clearTreeFilter("images");
  context.telemetry.properties.action = "clearFilter";
  void refreshTreeView("images");
}
