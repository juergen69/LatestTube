# Task: Implement IndexedDB Database Layer

## Metadata
- **ID**: TASK-PRD001-02
- **Parent PRD**: PRD-001 — LatestTube
- **Assigned Agent**: frontend
- **Status**: done
- **Completed**: 2026-02-19
- **Priority**: high
- **Created**: 2026-02-17

## Description

Implement the IndexedDB database layer inside the `<script>` block of `index.html`. This provides all data persistence for the application. Use the native IndexedDB API wrapped in Promise-based helper functions.

### Database: `LatestTubeDB` (version 1)

**Object Stores:**

1. **`settings`** — keyPath: `key`
   - Stores: `{ key: 'apiKey', value: '...' }`, `{ key: 'lastRefresh', value: '...' }`

2. **`channels`** — keyPath: `channelId`
   - Schema: `{ channelId, title, thumbnail, uploadsPlaylistId, addedAt }`

3. **`videos`** — keyPath: `videoId`
   - Schema: `{ videoId, channelId, title, thumbnail, publishedAt, description, watched }`
   - Indexes: `channelId`, `publishedAt`, `watched`

4. **`videoTags`** — keyPath: `id` (autoIncrement)
   - Schema: `{ id, videoId, tag }`
   - Indexes: `videoId`, `tag`

### Helper Functions to Implement:

```javascript
// Database initialization
function openDB() → Promise<IDBDatabase>

// Settings
function getSetting(key) → Promise<string|null>
function setSetting(key, value) → Promise<void>

// Channels
function getAllChannels() → Promise<Channel[]>
function addChannel(channel) → Promise<void>
function deleteChannel(channelId) → Promise<void>

// Videos
function getAllVideos() → Promise<Video[]>
function getVideosByChannel(channelId) → Promise<Video[]>
function addVideos(videos[]) → Promise<void>  // bulk add, skip duplicates
function setVideoWatched(videoId, watched) → Promise<void>
function deleteVideosByChannel(channelId) → Promise<void>

// Tags
function getTagsForVideo(videoId) → Promise<string[]>
function getAllTags() → Promise<string[]>  // unique tag names
function addTagToVideo(videoId, tag) → Promise<void>
function removeTagFromVideo(videoId, tag) → Promise<void>
function getVideoIdsByTag(tag) → Promise<string[]>
```

## Acceptance Criteria
- [x] `openDB()` creates the database with all 4 object stores and indexes
- [x] All CRUD functions work correctly (testable via browser console)
- [x] `addVideos()` handles duplicates gracefully (skips existing videoIds)
- [x] `getAllTags()` returns deduplicated tag names
- [x] Database persists across page reloads
- [x] All functions return Promises (no callback-style code)

## Technical Details

- All code goes in the `<script>` block of `index.html`
- Use `indexedDB.open('LatestTubeDB', 1)` with `onupgradeneeded` for schema creation
- Wrap all transactions in Promises for clean async/await usage
- Use `transaction.objectStore().put()` for upserts where appropriate
- For `addVideos()`, use a single transaction with `put()` to handle duplicates

## Dependencies

- TASK-PRD001-01 (HTML structure must exist to add script to)

## Handoff

→ TASK-PRD001-03 (Settings panel) and TASK-PRD001-04 (YouTube API) depend on this.

## Completion Notes

**Completed by**: Orchestrator ( Frontend Agent)
**Completion Date**: 2026-02-19
**Files Changed**: `index.html` (script section)

Notes:
- Implemented LatestTubeDB with all 4 object stores: settings, channels, videos, videoTags
- Created Promise-based wrapper functions for all IndexedDB operations
- Database schema includes proper indexes on channelId, publishedAt, watched, videoId, tag
- Helper functions: openDB, getSetting, setSetting, getAllChannels, addChannel, deleteChannel, getAllVideos, getVideosByChannel, addVideos, setVideoWatched, deleteVideosByChannel, getTagsForVideo, getAllTags, addTagToVideo, removeTagFromVideo, getVideoIdsByTag
- addVideos() uses put() for upsert semantics (handles duplicates)
- getAllTags() returns unique tag names across all videos
- All async operations use Promise-based API with async/await support

Next: Settings panel implementation (TASK-PRD001-03)
