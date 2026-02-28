// ========================================
// Filters Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    // DOM Elements
    const tagChipsContainer = document.getElementById('tag-chips-container');
    const unwatchedCheckbox = document.getElementById('unwatched-only');
    const videoCountElement = document.getElementById('video-count');
    const videoCountValue = document.getElementById('video-count-value');
    const markAllWatchedBtn = document.getElementById('mark-all-watched-btn');
    const videoSearchInput = document.getElementById('video-search-input');

    // State
    let currentFilters = {
        tag: null,         // null for "All", or tag string
        unwatchedOnly: false,
        searchQuery: ''
    };

    // ========================================
    // Filter State Management
    // ========================================

    /**
     * Set the tag filter
     * @param {string|null} tag - Tag to filter by, or 'all'/null for all videos
     */
    function setTagFilter(tag) {
        currentFilters.tag = (tag === 'all' || tag === null) ? null : tag;
        console.log('Filters: Tag filter set to', currentFilters.tag || 'All');
    }

    /**
     * Set the unwatched-only filter
     * @param {boolean} checked - Whether to show only unwatched videos
     */
    function setUnwatchedFilter(checked) {
        currentFilters.unwatchedOnly = checked;
        console.log('Filters: Unwatched filter set to', checked);
    }

    /**
     * Set the search filter
     * @param {string} query - Search query text
     */
    function setSearchFilter(query) {
        currentFilters.searchQuery = query;
        console.log('Filters: Search filter set to', query);
    }

    /**
     * Get current filter state
     * @returns {Object} - Current filters { tag: string|null, unwatchedOnly: boolean }
     */
    function getCurrentFilters() {
        return { ...currentFilters };
    }

    /**
     * Clear all filters to default state
     */
    function clearFilters() {
        currentFilters = {
            tag: null,
            unwatchedOnly: false,
            searchQuery: ''
        };
        // Reset UI
        unwatchedCheckbox.checked = false;
        if (videoSearchInput) {
            videoSearchInput.value = '';
        }
        updateFilterChipUI();
        console.log('Filters: All filters cleared');
    }

    // ========================================
    // Filter Chip Rendering
    // ========================================

    /**
     * Render filter chips in the filter bar
     */
    async function renderFilterChips() {
        try {
            // Get all unique tags
            const tags = await globalThis.LatestTube.DB.tags.getAllUnique();

            // Clear existing chips except the initial "All" button
            tagChipsContainer.innerHTML = '';

            // Add "All" chip (always present)
            const allChip = createFilterChip('All', 'all', currentFilters.tag === null);
            tagChipsContainer.appendChild(allChip);

            // Add one chip per unique tag (sorted alphabetically)
            tags.sort((a, b) => a.localeCompare(b));
            tags.forEach(tag => {
                const chip = createFilterChip(tag, tag, currentFilters.tag === tag);
                tagChipsContainer.appendChild(chip);
            });

            console.log(`Filters: Rendered ${tags.length + 1} filter chips`);
        } catch (error) {
            console.error('Filters: Error rendering filter chips', error);
        }
    }

    /**
     * Create a filter chip element
     * @param {string} label - Display label
     * @param {string} tag - Tag value (or 'all')
     * @param {boolean} isActive - Whether this chip is active
     * @returns {HTMLElement} - Filter chip button
     */
    function createFilterChip(label, tag, isActive) {
        const chip = document.createElement('button');
        chip.className = `filter-chip${isActive ? ' active' : ''}`;
        chip.dataset.tag = tag;
        chip.textContent = label;
        return chip;
    }

    /**
     * Update the active state of filter chips in the UI
     */
    function updateFilterChipUI() {
        const chips = tagChipsContainer.querySelectorAll('.filter-chip');
        chips.forEach(chip => {
            const chipTag = chip.dataset.tag;
            const isActive = (currentFilters.tag === null && chipTag === 'all') ||
                             (currentFilters.tag === chipTag);
            chip.classList.toggle('active', isActive);
        });
    }

    // ========================================
    // Filter Application
    // ========================================

    /**
     * Update video count display
     * @param {number} count - Number of videos
     */
    function updateVideoCount(count) {
        if (videoCountValue) {
            videoCountValue.textContent = count;
        }
        if (videoCountElement) {
            videoCountElement.style.display = count > 0 ? 'block' : 'none';
        }
    }

    /**
     * Apply current filters and re-render the video feed
     */
    async function applyFilters() {
        console.log('Filters: Applying filters', currentFilters);

        // Load videos with current filters
        const videos = await globalThis.LatestTube.VideoFeed.loadVideos(currentFilters);

        // Update filter chip UI
        updateFilterChipUI();

        // Update video count
        updateVideoCount(videos.length);

        // Render videos or show empty state
        if (videos.length === 0) {
            globalThis.LatestTube.VideoFeed.renderEmptyState(
                'No videos match the selected filters',
                'No videos found'
            );
        } else {
            await globalThis.LatestTube.VideoFeed.renderVideos(videos);
        }

        // Update video count in title if desired
        const tagSuffix = currentFilters.tag ? ` - ${currentFilters.tag}` : '';
        const unwatchedSuffix = currentFilters.unwatchedOnly ? ' (Unwatched)' : '';
        document.title = `LatestTube${tagSuffix}${unwatchedSuffix}`;
    }

    /**
     * Persist current filters to IndexedDB settings
     */
    async function persistFilters() {
        try {
            await globalThis.LatestTube.DB.settings.set('filters', { ...currentFilters });
        } catch (error) {
            console.error('Filters: Error saving filter state', error);
        }
    }

    /**
     * Load saved filters from IndexedDB settings
     */
    async function loadSavedFilters() {
        try {
            const saved = await globalThis.LatestTube.DB.settings.get('filters');
            if (saved) {
                if (saved.tag !== undefined) {
                    currentFilters.tag = saved.tag || null;
                }
                if (saved.unwatchedOnly !== undefined) {
                    currentFilters.unwatchedOnly = !!saved.unwatchedOnly;
                }
                if (saved.searchQuery !== undefined) {
                    currentFilters.searchQuery = saved.searchQuery || '';
                    if (videoSearchInput) {
                        videoSearchInput.value = currentFilters.searchQuery;
                    }
                }
                if (unwatchedCheckbox) {
                    unwatchedCheckbox.checked = currentFilters.unwatchedOnly;
                }
            }
        } catch (error) {
            console.error('Filters: Error loading saved filters', error);
        }
    }

    /**
     * Mark all videos in current filter as watched
     */
    async function handleMarkAllWatched() {
        if (!markAllWatchedBtn) return;

        markAllWatchedBtn.disabled = true;
        markAllWatchedBtn.textContent = 'Marking...';

        try {
            const videos = await globalThis.LatestTube.VideoFeed.loadVideos(currentFilters);
            const unwatchedVideos = videos.filter(video => !video.watched);

            if (unwatchedVideos.length === 0) {
                if (globalThis.LatestTube.App?.showToast) {
                    globalThis.LatestTube.App.showToast('No unwatched videos to update', 'success');
                }
                await applyFilters();
                return;
            }

            await Promise.all(
                unwatchedVideos.map(video => {
                    const updated = { ...video, watched: true };
                    return globalThis.LatestTube.DB.videos.update(updated);
                })
            );

            await applyFilters();

            if (globalThis.LatestTube.App?.showToast) {
                globalThis.LatestTube.App.showToast(`Marked ${unwatchedVideos.length} videos as watched`, 'success');
            }
        } catch (error) {
            console.error('Filters: Error marking all watched', error);
            if (globalThis.LatestTube.App?.showToast) {
                globalThis.LatestTube.App.showToast('Failed to mark videos as watched', 'error');
            }
        } finally {
            markAllWatchedBtn.disabled = false;
            markAllWatchedBtn.textContent = 'Mark all watched';
        }
    }

    // ========================================
    // Event Handlers
    // ========================================

    /**
     * Handle filter chip click
     * @param {Event} e - Click event
     */
    function handleChipClick(e) {
        if (!e.target.matches('.filter-chip')) return;

        const tag = e.target.dataset.tag;
        setTagFilter(tag);
        applyFilters();
    }

    /**
     * Handle unwatched checkbox change
     * @param {Event} e - Change event
     */
    function handleUnwatchedChange(e) {
        setUnwatchedFilter(e.target.checked);
        persistFilters();
        applyFilters();
    }

    /**
     * Handle search input changes
     * @param {Event} e - Input event
     */
    function handleSearchInput(e) {
        const raw = e.target.value || '';
        const trimmed = raw.trim();
        const query = trimmed.length >= 3 ? trimmed : '';
        setSearchFilter(query);
        persistFilters();
        applyFilters();
    }

    // ========================================
    // Event Listeners
    // ========================================

    // Tag chip clicks (delegated)
    tagChipsContainer.addEventListener('click', handleChipClick);

    // Unwatched checkbox change
    unwatchedCheckbox.addEventListener('change', handleUnwatchedChange);

    // Mark all watched button
    if (markAllWatchedBtn) {
        markAllWatchedBtn.addEventListener('click', handleMarkAllWatched);
    }

    // Search input changes
    if (videoSearchInput) {
        videoSearchInput.addEventListener('input', handleSearchInput);
    }

    // ========================================
    // Expose Filters API
    // ========================================
    globalThis.LatestTube.Filters = {
        currentFilters: currentFilters,
        setTagFilter,
        setUnwatchedFilter,
        setSearchFilter,
        getCurrentFilters,
        applyFilters,
        renderFilterChips,
        clearFilters,
        loadSavedFilters
    };
})();
