# Quick Start Guide: Using the Search/Filter Feature

## Where to Find It

The search/filter button appears in the header of each tree view section:

```
┌─────────────────────────────────────────┐
│ CONTAINERS                    🔍 ⚙️ 🔄 │  ← Search icon added here
├─────────────────────────────────────────┤
│ ⏵ container1                            │
│ ⏵ container2                            │
│ ⏵ container3                            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ IMAGES                        🔍 ⚙️ 🔄 │  ← Search icon added here
├─────────────────────────────────────────┤
│ ⏵ nginx:latest                          │
│ ⏵ postgres:14                           │
│ ⏵ redis:alpine                          │
└─────────────────────────────────────────┘
```

## How to Use

### Step 1: Click the Search Icon

Click the magnifying glass (🔍) icon in any view header.

### Step 2: Enter Search Term

A quick pick input appears at the top of VS Code:

```
┌───────────────────────────────────────────────┐
│ Filter containers... (Press Enter to apply)   │
│ ┌───────────────────────────────────────────┐ │
│ │ nginx_                                    │ │  ← Type here
│ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

### Step 3: See Filtered Results

The view automatically updates to show only matching items:

```
┌─────────────────────────────────────────────────┐
│ CONTAINERS       🔍 Filtered: "nginx"  ⚙️ 🔄   │
├─────────────────────────────────────────────────┤
│ ⏵ nginx_app                                    │
│ ⏵ nginx_proxy                                  │
└─────────────────────────────────────────────────┘
```

### Step 4: Clear Filter (Optional)

To clear the filter:

1. Click the search icon again
2. Either:
   - Press Enter with empty input, or
   - Select "Clear Filter" option

## Tips & Tricks

### Search Across Multiple Properties

The filter searches through:

- Container/Image/Volume names
- Tags
- IDs
- Status
- Description fields
- And more!

Example: Searching "running" will show all running containers.

### Case-Insensitive Search

- "NGINX" = "nginx" = "Nginx"
- Type in lowercase for faster searching

### Partial Matching

- "ngi" matches "nginx"
- "post" matches "postgres"
- "8080" matches containers with port 8080

### Multiple Views, Independent Filters

Each view maintains its own filter:

- Filter containers by "web"
- Filter images by "node"
- Both filters remain active simultaneously

## Examples

### Example 1: Find Development Containers

```
1. Click search in Containers view
2. Type: "dev"
3. See: dev_frontend, dev_backend, dev_database
```

### Example 2: Find Images by Version

```
1. Click search in Images view
2. Type: "14"
3. See: postgres:14, node:14-alpine, python:3.14
```

### Example 3: Find Networks by Name

```
1. Click search in Networks view
2. Type: "bridge"
3. See: bridge, custom_bridge, my_bridge_network
```

### Example 4: Find Stopped Containers

```
1. Click search in Containers view
2. Type: "exited"
3. See: All containers with "exited" status
```

## Keyboard Shortcuts

While the search Quick Pick is open:

- **Enter**: Apply filter
- **Esc**: Cancel (keep previous filter)
- **↑/↓**: Navigate options (when multiple)
- **Backspace**: Clear input

## Troubleshooting

### No Results Shown?

- Check your search term for typos
- Try a shorter, partial search term
- Clear the filter and try again

### Filter Not Working?

- Make sure you pressed Enter to apply
- Check that the description shows "Filtered: ..."
- Try refreshing the view (🔄 icon)

### Want to See Everything Again?

- Click search icon
- Press Enter with empty input
- Description will clear and all items return

## Comparison: Before vs After

### Before (No Filter)

```
CONTAINERS                          ⚙️ 🔄
├─ nginx_app
├─ nginx_proxy
├─ postgres_db
├─ redis_cache
├─ mongo_db
├─ rabbitmq_broker
├─ elasticsearch_search
└─ kibana_viz
```

### After (Filtered by "nginx")

```
CONTAINERS  🔍 Filtered: "nginx"    ⚙️ 🔄
├─ nginx_app
└─ nginx_proxy
```

## Video Tutorial Equivalent

1. **[0:00]** Open VS Code with Container Tools extension
2. **[0:05]** Navigate to Containers view
3. **[0:10]** Click search icon (🔍) in header
4. **[0:12]** Type "nginx" in quick pick input
5. **[0:15]** Press Enter
6. **[0:16]** View filtered to show only nginx containers
7. **[0:20]** Notice "Filtered: nginx" in description
8. **[0:25]** Click search again to clear
9. **[0:27]** Press Enter with empty input
10. **[0:28]** All containers visible again

Enjoy faster navigation with the new search feature! 🎉
