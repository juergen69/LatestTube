# Task: Implement Video Feed Rendering with Watched Toggle

## Metadata
- **ID**: TASK-PRD001-05
- **Parent PRD**: PRD-001 — LatestTube
- **Assigned Agent**: frontend
- **Status**: done
- **Completed**: 2026-02-19
- **Priority**: high
- **Created**: 2026-02-17

## Description

Implement the video feed rendering that displays video cards from IndexedDB data, including the watched/unwatched toggle functionality.

### Video Card Rendering:

Each video card displays:
- **Thumbnail** (left side): clickable, opens `https://www.youtube.com/watch?v={videoId}` in new tab
- **Title**: clickable, same link as thumbnail
- **Channel name**: from the channels store (lookup by channelId)
- **Relative time**: "2 hours ago", "3 days ago", "2 weeks ago" etc.
- **Watched toggle button**: toggles between ✓ Watched (green) and ○ Unwatched (gray)
- **Tag area**: shows existing tags as chips + a "+Tag" button (tag functionality in TASK-PRD001-06)

### Feed Behavior:
- Load all videos from IndexedDB on page init
- Sort by `publishedAt` descending (newest first)
- Build a channel name lookup map for efficient rendering
- Show empty state if no videos: "No videos yet. Add channels in Settings to get started."
- After a refresh completes, re-render the feed with new videos

### Watched Toggle:
- Click toggles `watched` boolean in IndexedDB via `setVideoWatched(videoId, !current)`
- Visual change: watched videos get dimmed opacity (0.6) and a green checkmark
- Unwatched videos have full opacity and a gray circle icon
- Toggle is immediate (optimistic UI), no need to wait for DB write

### Relative Time Function:
- Implement `timeAgo(dateString)` that returns human-readable relative time
- Examples: "just now", "5 minutes ago", "2 hours ago", "3 days ago", "2 weeks ago", "3 months ago"

### Rendering Function:
- `renderVideoFeed(videos, channels, videoTags)` — builds the HTML for the video list
- Should be efficient: use `innerHTML` or `DocumentFragment` for batch DOM updates
- Called after initial load, after refresh, and after filter changes

## Acceptance Criteria
- [x] Videos display as cards with thumbnail, title, channel name, and relative time
- [x] Clicking thumbnail or title opens the YouTube video in a new tab
- [x] Watched toggle changes visual state immediately
- [x] Watched state persists across page reloads
- [x] Videos are sorted newest first
- [x] Empty state message shows when no videos exist
- [x] Feed re-renders after a refresh operation completes

## Technical Details

- All code in `index.html` `<script>` block
- Use template literals for HTML generation
- Channel name lookup: build `Map<channelId, channelTitle>` from channels array
- Thumbnail URL: use `medium` quality (320x180) from stored thumbnail URL
- For relative time, use simple math: `(Date.now() - new Date(publishedAt)) / 1000` then convert to appropriate unit

## Dependencies

- TASK-PRD001-01 (HTML structure with video feed container)
- TASK-PRD001-02 (IndexedDB functions)
- TASK-PRD001-04 (Videos exist in DB after fetching)

## Handoff

→ TASK-PRD001-06 (Tag management) adds tag functionality to the video cards.
→ TASK-PRD001-07 (Filtering) adds filter controls above the feed.

## Completion Notes

**Completed by**: Orchestrator ( Frontend Agent)
**Completion Date**: 2026-02-19
**Files Changed**: `index.html`

Notes:
- Implemented renderVideoFeed() to display video cards from IndexedDB
- Video cards show: thumbnail (link to YouTube), title, channel name, relative time
- Implemented timeAgo() function for human-readable relative dates
- Watched toggle with immediate visual feedback (opacity change + checkmark)
- setVideoWatched() persists state to IndexedDB
- Videos sorted by publishedAt descending (newest first)
- Empty state: "No videos yet. Add channels in Settings to get started."
- Feed re-renders automatically after refresh completes
- Event delegation used for watched toggle clicks

Next: Tag management (TASK-PRD001-06)
