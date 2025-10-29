# Search/Filter Feature Implementation for Container Tools Extension

## Overview

This implementation adds a **search/filter feature** to all tree view sections in the VS Code Container Tools extension. Each section (Containers, Images, Networks, Volumes, Contexts, and Registries) now has a search button beside the section header that allows users to filter the displayed items.

## What Was Implemented

### 1. Core Filter Module (`src/commands/filterTree.ts`)

A new module that provides:

- **State Management**: Tracks filter state for each tree view independently
- **Filter UI**: Quick Pick interface for entering filter text
- **Filter Application**: Filters items based on multiple properties (label, description, and all configured properties)
- **Visual Feedback**: Updates tree view description to show active filters
- **Clear Filter**: Option to clear active filters

### 2. Integration with Tree Views (`src/tree/LocalRootTreeItemBase.ts`)

Modified the base tree class to:

- Import and use the filter state
- Filter items during the `loadMoreChildrenImpl` phase
- Match items against filter text across all properties
- Track filter telemetry

### 3. Commands Registration (`src/commands/registerCommands.ts`)

Added six new filter commands:

- `vscode-containers.containers.filter`
- `vscode-containers.images.filter`
- `vscode-containers.networks.filter`
- `vscode-containers.volumes.filter`
- `vscode-containers.contexts.filter`
- `vscode-containers.registries.filter`

### 4. UI Integration (`package.json`)

Added commands and menu items:

- Command definitions with search icon (`$(search)`)
- Navigation menu entries for each tree view
- Positioned beside the configure button for easy access

### 5. Localization (`package.nls.json`)

Added localized strings for all filter commands:

- "Filter..." label for all views

## Features

### How It Works

1. **Click the Search Icon**: In any tree view header (Containers, Images, etc.)
2. **Enter Filter Text**: Type search terms in the Quick Pick input
3. **See Results**: The tree automatically filters to show only matching items
4. **Clear Filter**: Either enter empty text or select the "Clear Filter" option

### What Gets Filtered

The filter searches across multiple properties for each item:

- **Label**: The primary display property
- **Description**: Secondary display properties
- **All Configured Properties**: Container names, image tags, network names, volume names, etc.

### Filter Behavior

- **Case-Insensitive**: "nginx" matches "Nginx", "NGINX", etc.
- **Partial Matching**: "ngi" matches "nginx"
- **Multi-Property**: Searches across all visible and configured properties
- **Independent**: Each view maintains its own filter state
- **Persistent**: Filter remains active until cleared or changed

### Visual Indicators

When a filter is active:

- The tree view description shows: `🔍 Filtered: "your-search-term"`
- Only matching items are displayed
- Groups are updated to show only filtered items

## Technical Details

### Filter State Management

```typescript
interface TreeFilterState {
  filterText: string;
  isActive: boolean;
}
```

Each tree prefix (containers, images, networks, etc.) has its own filter state stored in a Map.

### Filter Matching Algorithm

The `matchesFilter` method checks:

1. Item label (case-insensitive)
2. Item description (case-insensitive)
3. All properties from `labelSettingInfo` and `descriptionSettingInfo`

### Telemetry

Tracks:

- `filtered`: 'true' when items are filtered
- `filteredItemCount`: Number of items after filtering
- `filterLength`: Length of filter text
- `action`: 'applyFilter' or 'clearFilter'

## Usage Example

### Filtering Containers

1. Navigate to the **Containers** view
2. Click the search icon (🔍) in the view header
3. Type "nginx" to show only nginx containers
4. The description shows: `🔍 Filtered: "nginx"`
5. To clear, click search again and press Enter with empty input

### Filtering Images by Tag

1. Go to the **Images** view
2. Click the search icon
3. Type "latest" to see only images with "latest" tag
4. Clear by selecting "Clear Filter" or entering empty text

## Benefits

1. **Improved Navigation**: Quickly find specific containers, images, or resources
2. **Reduced Clutter**: Focus on relevant items by hiding non-matches
3. **Consistent UX**: Same filter experience across all views
4. **Non-Destructive**: Original items are not modified, only filtered
5. **Performance**: Filter is applied client-side with no API calls

## Notes

- The filter is applied after items are loaded from the container runtime
- Grouped views will only show groups that contain matching items
- The registry view filter is applied to the tree data provider's items
- Filters persist during the VS Code session but reset on reload

## Future Enhancements (Not Implemented)

Potential improvements could include:

- Filter history/suggestions
- Advanced filter syntax (e.g., regex, property-specific filters)
- Save/load filter presets
- Filter by multiple criteria simultaneously
- Export filtered results
