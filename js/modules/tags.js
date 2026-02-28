// ========================================
// Tags Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    // DOM Elements
    const popover = document.getElementById('tag-popover');
    const tagInput = document.getElementById('tag-popover-input');
    const addBtn = document.getElementById('tag-add-btn');
    const cancelBtn = document.getElementById('tag-cancel-btn');
    const suggestionsContainer = document.getElementById('tag-suggestions');
    const validationError = document.getElementById('tag-validation-error');

    // State
    let currentVideoId = null;
    let existingTagsCache = [];

    // ========================================
    // Validation
    // ========================================

    /**
     * Validate a tag name
     * @param {string} tag - Raw tag input
     * @returns {Object} - { valid: boolean, tag?: string, error?: string }
     */
    function validateTag(tag) {
        tag = tag.trim().toLowerCase();
        if (!tag) return { valid: false, error: 'Tag cannot be empty' };
        if (tag.length > 20) return { valid: false, error: 'Tag too long (max 20 chars)' };
        if (!/^[a-z0-9\s\-_]+$/.test(tag)) return { valid: false, error: 'Invalid characters (alphanumeric, spaces, hyphens, underscores only)' };
        return { valid: true, tag };
    }

    /**
     * Show validation error
     * @param {string} message - Error message
     */
    function showValidationError(message) {
        validationError.textContent = message;
        validationError.classList.add('visible');
        tagInput.classList.add('error');
    }

    /**
     * Clear validation error
     */
    function clearValidationError() {
        validationError.textContent = '';
        validationError.classList.remove('visible');
        tagInput.classList.remove('error');
    }

    // ========================================
    // Popover Positioning
    // ========================================

    /**
     * Position the popover near the anchor element
     * @param {HTMLElement} anchorElement - The element to position near
     */
    function positionPopover(anchorElement) {
        const rect = anchorElement.getBoundingClientRect();
        const scrollY = globalThis.scrollY || globalThis.pageYOffset;
        const scrollX = globalThis.scrollX || globalThis.pageXOffset;

        popover.style.top = `${rect.bottom + scrollY + 5}px`;
        popover.style.left = `${rect.left + scrollX}px`;
    }

    // ========================================
    // Suggestions
    // ========================================

    /**
     * Load and cache existing tags
     */
    async function loadExistingTags() {
        try {
            const tags = await globalThis.LatestTube.DB.tags.getAllUnique();
            existingTagsCache = tags.sort((a, b) => a.localeCompare(b));
        } catch (error) {
            console.error('Tags: Error loading existing tags', error);
            existingTagsCache = [];
        }
    }

    /**
     * Render suggestions list
     * @param {Array} tags - Array of tag names
     */
    function renderSuggestions(tags) {
        suggestionsContainer.innerHTML = '';

        if (tags.length === 0) {
            suggestionsContainer.innerHTML = '<div class="tag-suggestions-empty">No existing tags</div>';
            return;
        }

        const label = document.createElement('div');
        label.className = 'tag-suggestions-label';
        label.textContent = 'Existing tags:';
        suggestionsContainer.appendChild(label);

        tags.forEach(tag => {
            const item = document.createElement('div');
            item.className = 'tag-suggestion-item';
            item.textContent = tag;
            item.addEventListener('click', () => {
                tagInput.value = tag;
                tagInput.focus();
            });
            suggestionsContainer.appendChild(item);
        });
    }

    // ========================================
    // Public Methods
    // ========================================

    /**
     * Open the tag popover
     * @param {string} videoId - Video ID to add tag to
     * @param {HTMLElement} anchorElement - Element to position popover near
     */
    async function openPopover(videoId, anchorElement) {
        currentVideoId = videoId;

        // Clear input and errors
        tagInput.value = '';
        clearValidationError();

        // Position popover
        positionPopover(anchorElement);

        // Show popover
        popover.classList.add('active');

        // Focus input
        tagInput.focus();

        // Load existing tags for suggestions
        await loadExistingTags();
        renderSuggestions(existingTagsCache);

        console.log(`Tags: Opened popover for video ${videoId}`);
    }

    /**
     * Close the tag popover
     */
    function closePopover() {
        popover.classList.remove('active');
        currentVideoId = null;
        clearValidationError();
        console.log('Tags: Closed popover');
    }

    /**
     * Add a tag to the current video
     * @param {string} tagName - Tag to add
     */
    async function addTag(videoId, tagName) {
        const validation = validateTag(tagName);

        if (!validation.valid) {
            showValidationError(validation.error);
            return false;
        }

        const normalizedTag = validation.tag;

        try {
            const video = await globalThis.LatestTube.DB.videos.get(videoId);
            if (!video) {
                showValidationError('Video not found');
                return false;
            }

            // Check if tag already exists on this channel
            const existingTags = await globalThis.LatestTube.DB.tags.getByChannel(video.channelId);
            if (existingTags.includes(normalizedTag)) {
                showValidationError('Tag already exists on this channel');
                return false;
            }

            // Add tag to database
            await globalThis.LatestTube.DB.tags.add(video.channelId, normalizedTag);
            console.log(`Tags: Added tag "${normalizedTag}" to channel ${video.channelId}`);

            const updatedTags = [...existingTags, normalizedTag];
            await globalThis.LatestTube.VideoFeed.updateChannelTags(video.channelId, updatedTags);

            // Refresh filter chips to show new tag
            if (globalThis.LatestTube.Filters) {
                await globalThis.LatestTube.Filters.renderFilterChips();
            }

            return true;
        } catch (error) {
            console.error('Tags: Error adding tag', error);
            showValidationError('Failed to add tag');
            return false;
        }
    }

    /**
     * Remove a tag from a video
     * @param {string} videoId - Video ID
     * @param {string} tagName - Tag to remove
     */
    async function removeTag(videoId, tagName) {
        try {
            const video = await globalThis.LatestTube.DB.videos.get(videoId);
            if (!video) return false;
            await globalThis.LatestTube.DB.tags.remove(video.channelId, tagName);
            console.log(`Tags: Removed tag "${tagName}" from channel ${video.channelId}`);

            const existingTags = await globalThis.LatestTube.DB.tags.getByChannel(video.channelId);
            await globalThis.LatestTube.VideoFeed.updateChannelTags(video.channelId, existingTags);

            if (globalThis.LatestTube.Filters) {
                const allTags = await globalThis.LatestTube.DB.tags.getAllUnique();
                const normalizedTags = allTags.map(tag => tag.toLowerCase());
                const currentFilters = globalThis.LatestTube.Filters.getCurrentFilters();

                if (currentFilters.tag && !normalizedTags.includes(currentFilters.tag.toLowerCase())) {
                    globalThis.LatestTube.Filters.setTagFilter(null);
                    await globalThis.LatestTube.Filters.applyFilters();
                } else {
                    await globalThis.LatestTube.Filters.renderFilterChips();
                }
            }

            return true;
        } catch (error) {
            console.error('Tags: Error removing tag', error);
            return false;
        }
    }

    /**
     * Get all unique tags
     * @returns {Promise<string[]>}
     */
    async function getAllTags() {
        return await globalThis.LatestTube.DB.tags.getAllUnique();
    }

    /**
     * Render tag chips for a video card
     * @param {string} videoId - Video ID
     * @param {HTMLElement} container - Container element
     */
    async function renderTagChips(videoId, container) {
        try {
            const video = await globalThis.LatestTube.DB.videos.get(videoId);
            if (!video) return;
            const tags = await globalThis.LatestTube.DB.tags.getByChannel(video.channelId);

            // Clear existing tag chips (but not the add button)
            const addBtn = container.querySelector('.add-tag-btn');
            container.querySelectorAll('.video-tag-chip').forEach(chip => chip.remove());

            // Add tag chips
            for (const tag of tags) {
                const tagChip = document.createElement('span');
                tagChip.className = 'tag-chip video-tag-chip';
                tagChip.dataset.tag = tag;

                const tagText = document.createTextNode(tag);
                tagChip.appendChild(tagText);

                const removeBtn = document.createElement('button');
                removeBtn.className = 'tag-remove';
                removeBtn.dataset.tag = tag;
                removeBtn.title = 'Remove tag';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeTag(videoId, tag);
                });
                tagChip.appendChild(removeBtn);

                addBtn.before(tagChip);
            }
        } catch (error) {
            console.error('Tags: Error rendering tag chips', error);
        }
    }

    // ========================================
    // Event Handlers
    // ========================================

    // Add button click
    addBtn.addEventListener('click', async () => {
        if (!currentVideoId) return;

        const tagName = tagInput.value.trim();
        if (!tagName) {
            showValidationError('Please enter a tag name');
            return;
        }

        const success = await addTag(currentVideoId, tagName);
        if (success) {
            closePopover();
        }
    });

    // Cancel button click
    cancelBtn.addEventListener('click', () => {
        closePopover();
    });

    // Enter key on input
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });

    // Clear validation error on input
    tagInput.addEventListener('input', () => {
        clearValidationError();
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (popover.classList.contains('active') &&
            !popover.contains(e.target) &&
            !e.target.closest('.add-tag-btn')) {
            closePopover();
        }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popover.classList.contains('active')) {
            closePopover();
        }
    });

    // Listen for custom add tag event from VideoFeed
    document.addEventListener('video:addTag', (e) => {
        const { videoId, button } = e.detail;
        openPopover(videoId, button);
    });

    // Expose Tags API
    globalThis.LatestTube.Tags = {
        openPopover,
        closePopover,
        addTag,
        removeTag,
        getAllTags,
        renderTagChips,
        validateTag
    };
})();
