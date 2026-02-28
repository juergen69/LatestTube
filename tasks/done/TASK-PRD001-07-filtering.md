# Task: Implement Tag-Based and Watched Filtering

## Metadata
- **ID**: TASK-PRD001-07
- **Parent PRD**: PRD-001 — LatestTube
- **Assigned Agent**: frontend
- **Status**: done
- **Completed": 2026-02-19
- **Priority**: medium
- **Created**: 2026-02-17

## Description

Implement the filter bar above the video feed that allows filtering by tags and watched/unwatched status.

### Filter Bar UI:
- Located between the header and the video feed
- Contains:
  - **"All" button**: clears all tag filters (active by default)
  - **Tag filter chips**: one for each unique tag in the database, clickable to toggle
  - **"Unwatched only" checkbox/toggle**: filters to only show unwatched videos

### Tag Filtering:
- Clicking a tag chip toggles it as an active filter
- Active tag chips get a highlighted style (brighter color, border)
- When one or more tags are active, only videos that have ANY of the active tags are shown (OR logic)
- Clicking "All" clears all active tag filters and shows everything
- The tag list in the filter bar updates dynamically when tags are added/removed from videos

### Watched Filtering:
- "Unwatched only" toggle: when active, hides all videos where `watched === true`
- Can be combined with tag filters (AND logic: must match tag filter AND be unwatched)

### Filter State:
- Maintain filter state in memory (no need to persist across reloads)
- When filters change, re-render the video feed with filtered results
- Show count of visible videos vs total: "Showing 12 of 45 videos"

### Implementation:
- `getFilteredVideos(allVideos, allVideoTags, activeTagFilters, unwatchedOnly)` — returns filtered video array
- Filter bar renders from `getAllTags()` result
- Re-render filter bar when tags change (new tag added, tag removed)
- Re-render video feed when any filter changes

## Acceptance Criteria
- [x] Filter bar shows all unique tags as clickable chips
- [x] Clicking a tag chip highlights it and filters the feed to show only videos with that tag
- [x] Multiple tag chips can be active (OR logic)
- [x] "All" button clears tag filters and shows all videos
- [x] "Unwatched only" toggle hides watched videos
- [x] Tag and watched filters combine correctly (AND logic between categories)
- [x] Video count indicator shows "Showing X of Y videos"
- [x] Filter bar updates when new tags are created or removed

## Technical Details

- All code in `index.html` `<script>` block
- Filter state: `{ activeTags: Set<string>, unwatchedOnly: boolean }`
- Filtering logic:
  ```
  if activeTags.size > 0:
    video must have at least one tag in activeTags
  if unwatchedOnly:
    video.watched must be false
  ```
- Use event delegation for filter chip clicks
- Re-render only the video feed area, not the entire page

## Dependencies

- TASK-PRD001-05 (Video feed rendering)
- TASK-PRD001-06 (Tag management — tags must exist to filter by)

## Handoff

→ TASK-PRD001-08 (App initialization and refresh) ties everything together.

## Completion Notes

**Completed by**: Orchestrator ( Frontend Agent)
**Completion Date**: 2026-02-19
**Files Changed**: `index.html`

Notes:
- Implemented filter bar with tag chips from getAllTags()
- Clicking tag chip toggles active state and filters feed (OR logic for multiple tags)
- "All" button clears all tag filters
- "Unwatched only" checkbox filters to show only unwatched videos
- Combined filters work with AND logic (must match tag filter AND unwatched filter)
- getFilteredVideos() handles the filtering logic
- Video count displays: "Showing X of Y videos"
- Filter bar re-renders automatically when tags are added/removed
- State maintained in memory: { activeTags: Set<string>, unwatchedOnly: boolean }

Next: App initialization and refresh (TASK-PRD001-08)
