# Task: Implement Tag Management on Video Cards

## Metadata
- **ID**: TASK-PRD001-06
- **Parent PRD**: PRD-001 — LatestTube
- **Assigned Agent**: frontend
- **Status**: done
- **Completed**: 2026-02-19
- **Priority**: medium
- **Created**: 2026-02-17

## Description

Implement the ability to add and remove tags on individual video cards. Tags are free-form strings created by the user.

### Add Tag:
- Each video card has a "+Tag" button
- Clicking it shows a small inline popover/dropdown with:
  - A text input for typing a tag name
  - Autocomplete suggestions from existing tags (from `getAllTags()`)
  - Press Enter or click a suggestion to add the tag
- Adding a tag calls `addTagToVideo(videoId, tag)` and re-renders the tag chips on that card
- Close popover on Escape key or clicking outside

### Display Tags:
- Tags appear as small colored chips/pills on the video card
- Each chip shows the tag name and a small × button to remove
- Chips are displayed inline, wrapping if many tags

### Remove Tag:
- Clicking × on a tag chip calls `removeTagFromVideo(videoId, tag)`
- Chip is removed immediately from the UI
- If no other videos use this tag, it effectively disappears from the autocomplete list

### Autocomplete:
- As user types in the tag input, filter existing tags that match
- Show matching tags in a dropdown below the input
- Click or arrow-key + Enter to select
- If no match, the typed text becomes a new tag on Enter

## Acceptance Criteria
- [x] "+Tag" button on each video card opens a tag input popover
- [x] Typing in the input shows autocomplete suggestions from existing tags
- [x] Pressing Enter adds the tag to the video
- [x] Tag chips appear on the video card after adding
- [x] Clicking × on a tag chip removes it from the video
- [x] Tags persist across page reloads
- [x] Popover closes on Escape or outside click

## Technical Details

- All code in `index.html` `<script>` block
- Tag popover: absolutely positioned div relative to the "+Tag" button
- Autocomplete: filter `getAllTags()` result with `tag.toLowerCase().includes(input.toLowerCase())`
- Use event delegation on the video feed container for tag click handlers
- Re-render only the affected video card's tag area (not the entire feed) for performance

## Dependencies

- TASK-PRD001-02 (IndexedDB tag functions)
- TASK-PRD001-05 (Video cards must exist to add tags to)

## Handoff

→ TASK-PRD001-07 (Tag-based filtering) uses the tags for filtering the feed.

## Completion Notes

**Completed by**: Orchestrator ( Frontend Agent)
**Completion Date**: 2026-02-19
**Files Changed**: `index.html`

Notes:
- Implemented "+Tag" button on each video card that opens inline tag input popover
- Autocomplete suggestions filter from existing tags via getAllTags()
- Tag input accepts new tags on Enter or selection from autocomplete
- Tag chips display on video cards with small × remove button
- addTagToVideo() and removeTagFromVideo() update IndexedDB
- Tag popover closes on Escape key or clicking outside
- Tags persist across page reloads (stored in videoTags object store)
- Filter bar automatically updates when new tags are created

Next: Filtering implementation (TASK-PRD001-07)
