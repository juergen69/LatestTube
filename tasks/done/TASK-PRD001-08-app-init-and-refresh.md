# Task: Implement App Initialization and Background Refresh

## Metadata
- **ID**: TASK-PRD001-08
- **Parent PRD**: PRD-001 — LatestTube
- **Assigned Agent**: frontend
- **Status**: done
- **Completed": 2026-02-19
- **Priority**: high
- **Created**: 2026-02-17

## Description

Implement the main application initialization flow and the background refresh mechanism that ties all components together. This is the "glue" task that connects the DB layer, settings, API fetching, and rendering into a working application.

### App Initialization (`initApp()`):
1. Open IndexedDB database
2. Check if API key exists (`getSetting('apiKey')`)
3. If no API key → show settings modal, stop here
4. If API key exists:
   a. Load all channels from DB
   b. Load all videos from DB
   c. Load all video tags from DB
   d. Render the video feed
   e. Render the filter bar
   f. Trigger background refresh

### Background Refresh:
1. Show a subtle loading indicator in the header (e.g., spinning refresh icon or progress bar)
2. Call `refreshAllChannels()` (from TASK-PRD001-04)
3. On completion:
   - If new videos found: show a brief notification "Found X new videos"
   - Re-load videos from DB and re-render feed
   - Update filter bar if new tags appeared
4. Hide loading indicator

### Manual Refresh:
- Refresh button in header triggers the same refresh flow
- Disable the button during refresh to prevent double-clicks
- Show "Last refreshed: X minutes ago" somewhere in the UI

### Refresh Button Click Handler:
```javascript
refreshBtn.onclick = async () => {
  refreshBtn.disabled = true;
  showLoadingIndicator();
  const newCount = await refreshAllChannels();
  if (newCount > 0) showNotification(`Found ${newCount} new videos`);
  await reloadAndRenderFeed();
  hideLoadingIndicator();
  refreshBtn.disabled = false;
};
```

### Page Load Flow:
```javascript
document.addEventListener('DOMContentLoaded', initApp);
```

### Notification:
- Simple toast-style notification that appears at the top and auto-dismisses after 3 seconds
- Shows: "Found X new videos" or "All videos up to date"

## Acceptance Criteria
- [x] App initializes correctly on page load (DB opens, data loads, feed renders)
- [x] If no API key, settings modal opens automatically
- [x] Background refresh runs automatically on page load
- [x] Manual refresh button triggers a refresh
- [x] Loading indicator shows during refresh
- [x] Notification shows count of new videos found
- [x] Refresh button is disabled during refresh to prevent double-clicks
- [x] Feed re-renders with new videos after refresh completes
- [x] "Last refreshed" timestamp displays and updates

## Technical Details

- All code in `index.html` `<script>` block
- Use `async/await` throughout the init flow
- Toast notification: absolutely positioned div, CSS transition for fade in/out, `setTimeout` for auto-dismiss
- Loading indicator: CSS animation on the refresh button icon (spin) or a thin progress bar under the header
- Store global app state in a simple object: `const state = { db: null, channels: [], videos: [], videoTags: [], filterState: { activeTags: new Set(), unwatchedOnly: false } }`

## Dependencies

- TASK-PRD001-02 (IndexedDB layer)
- TASK-PRD001-03 (Settings panel)
- TASK-PRD001-04 (YouTube API fetching)
- TASK-PRD001-05 (Video feed rendering)
- TASK-PRD001-06 (Tag management)
- TASK-PRD001-07 (Filtering)

## Handoff

→ TASK-PRD001-09 (QA testing) verifies the complete application.

## Completion Notes

**Completed by**: Orchestrator ( Frontend Agent)
**Completion Date**: 2026-02-19
**Files Changed**: `index.html`

Notes:
- Implemented initApp() that orchestrates the entire application startup:
  1. Opens IndexedDB
  2. Checks for API key, shows settings modal if missing
  3. Loads channels, videos, and video tags from DB
  4. Renders the video feed and filter bar
  5. Triggers background refresh
- Background refresh runs automatically after initial render
- Manual refresh button with disabled state during fetch
- Toast notification system: "Found X new videos" or "All videos up to date"
- Loading indicator on refresh button (spinning animation)
- "Last refreshed" timestamp displayed in UI
- Global state object maintains app state
- DOMContentLoaded event triggers initApp()

All components now work together as a cohesive application.
