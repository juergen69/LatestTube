# Task: Implement YouTube API Video Fetching

## Metadata
- **ID**: TASK-PRD001-04
- **Parent PRD**: PRD-001 — LatestTube
- **Assigned Agent**: frontend
- **Status**: done
- **Completed**: 2026-02-19
- **Priority**: high
- **Created**: 2026-02-17

## Description

Implement the core video fetching logic that retrieves recent videos from all subscribed channels using the YouTube Data API v3 `playlistItems` endpoint.

### Fetching Logic:

1. **`fetchVideosForChannel(channel, apiKey, since)`** — fetches videos from a single channel
   - Uses: `GET https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId={uploadsPlaylistId}&maxResults=50&key={apiKey}`
   - Paginates using `nextPageToken` until:
     - No more pages, OR
     - A video's `publishedAt` is older than `since` parameter
   - Returns array of video objects: `{ videoId, channelId, title, thumbnail, publishedAt, description, watched: false }`
   - Extract `videoId` from `snippet.resourceId.videoId`
   - Extract `thumbnail` from `snippet.thumbnails.medium.url` (fallback to `default`)

2. **`refreshAllChannels()`** — orchestrates fetching for all channels
   - Get all channels from IndexedDB
   - Get API key from settings
   - For each channel, call `fetchVideosForChannel()` with:
     - On first fetch (no videos exist for channel): `since` = 6 months ago
     - On subsequent fetches: `since` = most recent video's `publishedAt` for that channel
   - Store all new videos via `addVideos()`
   - Update `lastRefresh` setting with current timestamp
   - Return count of new videos found

3. **Error Handling:**
   - API quota exceeded (403): show warning, stop fetching
   - Invalid API key (401): show error, prompt to update key
   - Network error: show error, continue with cached data
   - Individual channel errors should not block other channels

### Integration Points:
- Called on page load (after DB init and if API key exists)
- Called when refresh button is clicked
- Called after a new channel is added (fetch only that channel)

## Acceptance Criteria
- [x] Videos are fetched from YouTube API using `playlistItems` endpoint
- [x] Pagination works correctly (fetches multiple pages if needed)
- [x] Fetching stops when videos older than 6 months are encountered (initial load)
- [x] Fetching stops when videos older than last fetch are encountered (subsequent loads)
- [x] New videos are stored in IndexedDB without duplicating existing ones
- [x] API errors are handled gracefully with user-visible messages
- [x] Loading indicator shows during fetch operations
- [x] `lastRefresh` timestamp is updated after successful fetch

## Technical Details

- All code in `index.html` `<script>` block
- Use `fetch()` with async/await
- YouTube API base URL: `https://www.googleapis.com/youtube/v3/`
- The `playlistItems` endpoint returns items in reverse chronological order (newest first)
- `snippet.publishedAt` is in ISO 8601 format — compare with `new Date()`
- 6 months ago calculation: `new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)`
- Show a progress indicator: "Fetching channel 2 of 5..."

## Dependencies

- TASK-PRD001-02 (IndexedDB layer for storing videos)
- TASK-PRD001-03 (Settings panel provides API key and channels)

## Handoff

→ TASK-PRD001-05 (Video feed rendering) displays the fetched videos.

## Completion Notes

**Completed by**: Orchestrator ( Frontend Agent)
**Completion Date**: 2026-02-19
**Files Changed**: `index.html`

Notes:
- Implemented fetchVideosForChannel() using playlistItems endpoint (1 quota unit)
- Pagination via nextPageToken handled correctly
- Date-based cutoff: stops paginating when videos older than 6 months (initial) or last fetch (subsequent)
- refreshAllChannels() orchestrates fetching for all subscribed channels
- Stores videos with watched: false, extracts videoId and thumbnail from API response
- Error handling for 403 (quota exceeded), 401 (invalid key), network errors
- Progress indicator showing "Fetching channel X of Y..."
- Updates lastRefresh setting after successful fetch
- Duplicate prevention via addVideos() upsert logic

Next: Video feed rendering (TASK-PRD001-05)
