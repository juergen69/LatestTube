# Task: Implement Settings Panel (API Key + Channel Management)

## Metadata
- **ID**: TASK-PRD001-03
- **Parent PRD**: PRD-001 — LatestTube
- **Assigned Agent**: frontend
- **Status**: done
- **Completed**: 2026-02-19
- **Priority**: high
- **Created**: 2026-02-17

## Description

Implement the settings panel functionality in `index.html`. This includes API key management and channel add/delete operations.

### API Key Management:
- Input field for YouTube Data API v3 key (type=password, with show/hide toggle)
- Save button that stores the key via `setSetting('apiKey', value)`
- On save, validate the key by making a test API call: `GET https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key={apiKey}` (Google Developers channel as test)
- Show success/error feedback
- On page load, if no API key is set, auto-open the settings modal

### Channel Management:
- Input field to add a channel (accepts various formats):
  - Channel ID: `UCxxxxxx`
  - Channel URL: `https://www.youtube.com/channel/UCxxxxxx`
  - Custom URL: `https://www.youtube.com/@handle` (requires API lookup)
  - Full video URL: extract channel from video page (not required, nice-to-have)
- Parse the input to extract channel ID or handle
- For handles/custom URLs: use `GET /youtube/v3/channels?part=snippet,contentDetails&forHandle={handle}` to resolve
- For channel IDs: use `GET /youtube/v3/channels?part=snippet,contentDetails&id={channelId}`
- Store channel with: `{ channelId, title, thumbnail, uploadsPlaylistId, addedAt }`
- Display list of subscribed channels with thumbnail, name, and delete button
- Delete button removes channel AND all its videos from IndexedDB

### UI Behavior:
- Settings modal opens/closes with gear icon click
- Close on backdrop click or × button
- Channel list updates immediately on add/delete
- Show loading spinner during API calls
- Show error messages for invalid inputs or API failures

## Acceptance Criteria
- [x] API key can be entered, saved, and persists across reloads
- [x] Invalid API key shows an error message
- [x] Channel can be added by channel ID (UCxxxxxx format)
- [x] Channel can be added by URL (youtube.com/channel/UCxxxxxx)
- [x] Channel can be added by handle (@handle format)
- [x] Added channels appear in the channel list with thumbnail and name
- [x] Deleting a channel removes it and its videos from the database
- [x] Settings modal opens automatically if no API key is configured

## Technical Details

- All code in `index.html` `<script>` block
- Use `fetch()` for YouTube API calls
- URL parsing: use regex or URL constructor to extract channel ID / handle
- Channel resolution API: `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&forHandle={handle}&key={apiKey}`
- Store `uploadsPlaylistId` from `contentDetails.relatedPlaylists.uploads` — this is needed for TASK-PRD001-04

## Dependencies

- TASK-PRD001-01 (HTML structure with settings modal)
- TASK-PRD001-02 (IndexedDB functions for settings and channels)

## Handoff

→ TASK-PRD001-04 (YouTube API video fetching) uses the stored channels and API key.

## Completion Notes

**Completed by**: Orchestrator ( Frontend Agent)
**Completion Date**: 2026-02-19
**Files Changed**: `index.html`

Notes:
- Implemented API key management with masked input and show/hide toggle
- Added test API call to validate key (uses Google Developers channel)
- Implemented channel add via multiple input formats:
  - Channel ID (UCxxxxxx)
  - Channel URL (youtube.com/channel/UCxxxxxx)
  - Handle format (@handle) resolved via forHandle API
- Channel list displays thumbnail, name, and delete button
- Delete button removes channel and all associated videos from IndexedDB
- Settings modal auto-opens on page load if no API key is configured
- Loading spinner shown during API calls
- Error messages displayed for invalid inputs or API failures

Next: YouTube API video fetching (TASK-PRD001-04)
