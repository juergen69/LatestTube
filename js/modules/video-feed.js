// ========================================
// Video Feed Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    // DOM Elements
    const videoList = document.getElementById('video-list');
    const emptyState = document.getElementById('empty-state');
    const infiniteSentinel = document.getElementById('infinite-sentinel');

    // Configuration
    const VIDEOS_PER_PAGE = 30;

    // State
    let currentVideos = [];
    let displayedCount = 0;
    let currentFilter = {};
    let infiniteObserver = null;
    let isObserverInitialized = false;
    let isLoadingMore = false;

    // Use shared utilities if available
    const Utils = globalThis.LatestTube.Utils || {};

    // ========================================
    // Video Card Builder
    // ========================================

    /**
     * Create a video card element
     * @param {Object} video - Video object
     * @param {string} channelName - Channel name
     * @param {Array} tags - Array of tags
     * @returns {HTMLElement} - Video card element
     */
    function createVideoCardElement(video, channelName, tags) {
        const card = document.createElement('div');
        card.className = `video-card${video.watched ? ' watched' : ''}`;
        card.dataset.videoId = video.videoId;

        const thumbnailUrl = video.thumbnail || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iOTAiIHZpZXdCb3g9IjAgMCAxMjAgOTAiIGZpbGw9Im5vbmUiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iOTAiIGZpbGw9IiMzMDMwMzAiLz48cGF0aCBkPSJNNDggNDBWMzZDNDggMzMuNzkwOSA0OS43OTA5IDMyIDUyIDMySDY4QzcwLjIwOTEgMzIgNzIgMzMuNzkwOSA3MiAzNlY0MEM3MiA0Mi4yMDkxIDcwLjIwOTEgNDQgNjggNDRINTJDNDkuNzkwOSA0NCA0OCA0Mi4yMDkxIDQ4IDQwWiIgZmlsbD0iIzY2NjY2NiIvPjwvc3ZnPg==';

        const relativeTime = Utils.formatRelativeTime ? Utils.formatRelativeTime(video.publishedAt) : formatRelativeTimeFallback(video.publishedAt);
        const durationLabel = Utils.formatDuration ? Utils.formatDuration(video.durationSeconds) : formatDurationFallback(video.durationSeconds);
        const durationMeta = durationLabel
            ? `<span class="video-separator">•</span><span class="video-duration">${durationLabel}</span>`
            : '';

        // Use shared escapeHtml or fallback
        const escapeHtml = Utils.escapeHtml || function(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        // Build tags HTML
        const tagsHtml = (tags || []).map(tag => `
            <span class="tag-chip video-tag-chip" data-tag="${escapeHtml(tag)}">
                ${escapeHtml(tag)}
                <button class="tag-remove" data-tag="${escapeHtml(tag)}" title="Remove tag">×</button>
            </span>
        `).join('');

        card.innerHTML = `
            <a href="https://youtube.com/watch?v=${video.videoId}" target="_blank" rel="noopener noreferrer" class="video-thumbnail" title="Open on YouTube">
                <img src="${thumbnailUrl}" alt="${escapeHtml(video.title)}" loading="lazy">
            </a>
            <div class="video-info">
                <a href="https://youtube.com/watch?v=${video.videoId}" target="_blank" rel="noopener noreferrer" class="video-title" title="${escapeHtml(video.title)}">
                    ${escapeHtml(video.title)}
                </a>
                <div class="video-meta">
                    <span class="video-channel">${escapeHtml(channelName || 'Unknown Channel')}</span>
                    ${durationMeta}
                    <span class="video-separator">•</span>
                    <span class="video-date">${relativeTime}</span>
                </div>
                <div class="video-actions">
                    <label class="watched-toggle">
                        <input type="checkbox" ${video.watched ? 'checked' : ''} data-video-id="${video.videoId}">
                        <span>Watched</span>
                    </label>
                    <div class="video-tags">
                        ${tagsHtml}
                        <button class="add-tag-btn" data-video-id="${video.videoId}">+ Add Tag</button>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        const watchedCheckbox = card.querySelector('.watched-toggle input');
        watchedCheckbox.addEventListener('change', (e) => handleWatchedToggle(video.videoId, e.target.checked, card));

        const watchedLinks = card.querySelectorAll('.video-thumbnail, .video-title');
        watchedLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (watchedCheckbox.checked) {
                    return;
                }
                watchedCheckbox.checked = true;
                handleWatchedToggle(video.videoId, true, card);
            });
        });

        const addTagBtn = card.querySelector('.add-tag-btn');
        addTagBtn.addEventListener('click', (e) => handleAddTagClick(video.videoId, e.target));

        // Tag remove buttons
        card.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tag = btn.dataset.tag;
                handleRemoveTag(video.videoId, tag, card);
            });
        });

        return card;
    }

    /**
     * Format date as relative time (fallback if Utils not available)
     * @param {string} dateString - ISO date string
     * @returns {string} - Relative time string
     */
    function formatRelativeTimeFallback(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) === 1 ? '' : 's'} ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /**
     * Format duration seconds into H:MM:SS or M:SS (fallback if Utils not available)
     * @param {number|null} seconds
     * @returns {string}
     */
    function formatDurationFallback(seconds) {
        if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
            return '';
        }

        const totalSeconds = Math.round(seconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const remainingSeconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
        }

        return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    // ========================================
    // Event Handlers
    // ========================================

    /**
     * Handle watched checkbox toggle
     * @param {string} videoId
     * @param {boolean} watched
     * @param {HTMLElement} card
     */
    async function handleWatchedToggle(videoId, watched, card) {
        try {
            const video = await globalThis.LatestTube.DB.videos.get(videoId);
            if (video) {
                video.watched = watched;
                await globalThis.LatestTube.DB.videos.update(video);
                card.classList.toggle('watched', watched);
                const checkbox = card.querySelector('.watched-toggle input');
                if (checkbox) {
                    checkbox.checked = watched;
                }
                console.log(`VideoFeed: Marked video ${videoId} as ${watched ? 'watched' : 'unwatched'}`);

                const filters = globalThis.LatestTube.Filters?.getCurrentFilters?.();
                if (filters?.unwatchedOnly && watched) {
                    card.classList.add('fade-out');
                    const cardHeight = card.getBoundingClientRect().height;
                    card.style.height = `${cardHeight}px`;
                    requestAnimationFrame(() => {
                        card.style.height = '0px';
                        card.style.margin = '0px';
                    });
                    setTimeout(async () => {
                        card.remove();
                        if (globalThis.LatestTube.Filters?.applyFilters) {
                            await globalThis.LatestTube.Filters.applyFilters();
                        } else {
                            await globalThis.LatestTube.VideoFeed.refresh();
                        }
                    }, 220);
                }
            }
        } catch (error) {
            console.error('VideoFeed: Error updating watched status', error);
            // Revert checkbox on error
            const checkbox = card.querySelector('.watched-toggle input');
            if (checkbox) {
                checkbox.checked = !watched;
            }
        }
    }

    /**
     * Handle add tag button click
     * @param {string} videoId
     * @param {HTMLElement} button
     */
    function handleAddTagClick(videoId, button) {
        const event = new CustomEvent('video:addTag', {
            detail: { videoId, button },
            bubbles: true
        });
        document.dispatchEvent(event);
    }

    /**
     * Handle remove tag button click
     * @param {string} videoId
     * @param {string} tag
     * @param {HTMLElement} card
     */
    async function handleRemoveTag(videoId, tag, card) {
        try {
            if (globalThis.LatestTube.Tags) {
                await globalThis.LatestTube.Tags.removeTag(videoId, tag);
            }
        } catch (error) {
            console.error('VideoFeed: Error removing tag', error);
        }
    }

    // ========================================
    // Feed Rendering
    // ========================================

    /**
     * Load videos from database with optional filters
     * @param {Object} filter - Filter options { tag: string|null, unwatchedOnly: boolean }
     * @returns {Promise<Array>} - Array of video objects
     */
    async function loadVideos(filter = {}) {
        console.log('VideoFeed: Loading videos with filter', filter);

        try {
            // Get all videos
            let videos = await globalThis.LatestTube.DB.videos.getAll();

            // Get all channels for channel name mapping and shorts filtering
            const channels = await globalThis.LatestTube.DB.channels.getAll();
            const channelMap = new Map(channels.map(c => [c.channelId, c.title]));
            // Build a set of channel IDs that don't include shorts
            const shortsExcludedChannelIds = new Set(
                channels.filter(c => c.includeShorts === false).map(c => c.channelId)
            );

            // Filter out shorts from channels where includeShorts is false
            videos = videos.filter(video => {
                if (shortsExcludedChannelIds.has(video.channelId)) {
                    const isShort = typeof video.durationSeconds === 'number' && video.durationSeconds <= 60;
                    if (isShort) {
                        return false;
                    }
                }
                return true;
            });

            // Attach channel names to videos
            videos = videos.map(video => ({
                ...video,
                channelName: channelMap.get(video.channelId) || 'Unknown Channel'
            }));

            // Apply unwatched filter first (more efficient)
            if (filter.unwatchedOnly) {
                videos = videos.filter(v => !v.watched);
            }

            // Apply tag filter
            if (filter.tag) {
                // Get all channel-tag mappings
                const allTags = await globalThis.LatestTube.DB.tags.getAll();
                const taggedChannelIds = new Set();

                for (const tagEntry of allTags) {
                    if (tagEntry.tag === filter.tag) {
                        taggedChannelIds.add(tagEntry.channelId);
                    }
                }

                videos = videos.filter(v => taggedChannelIds.has(v.channelId));
            }

            // Apply search filter (title or channel name)
            if (filter.searchQuery && filter.searchQuery.length >= 3) {
                const query = filter.searchQuery.toLowerCase();
                videos = videos.filter(v => {
                    const title = (v.title || '').toLowerCase();
                    const channelName = (v.channelName || '').toLowerCase();
                    return title.includes(query) || channelName.includes(query);
                });
            }

            // Sort by publishedAt descending (newest first)
            videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

            currentVideos = videos;
            currentFilter = filter;
            displayedCount = 0;

            return videos;
        } catch (error) {
            console.error('VideoFeed: Error loading videos', error);
            return [];
        }
    }

    /**
     * Render videos to the DOM
     * @param {Array} videos - Array of video objects
     */
    async function renderVideos(videos) {
        clearFeed();

        if (!videos || videos.length === 0) {
            renderEmptyState();
            return;
        }

        // Hide empty state
        emptyState.style.display = 'none';
        videoList.style.display = 'grid';

        // Create fragment for batch insert
        const fragment = document.createDocumentFragment();

        // Limit initial render
        const videosToRender = videos.slice(0, VIDEOS_PER_PAGE);
        displayedCount = videosToRender.length;

        // Get tags for all videos in parallel (channel-based)
        const tagsPromises = videosToRender.map(v => globalThis.LatestTube.DB.tags.getByChannel(v.channelId));
        const allTags = await Promise.all(tagsPromises);

        // Create video cards
        videosToRender.forEach((video, index) => {
            const card = createVideoCardElement(video, video.channelName, allTags[index]);
            fragment.appendChild(card);
        });

        videoList.appendChild(fragment);
        isLoadingMore = false;
        setupInfiniteScroll();

        console.log(`VideoFeed: Rendered ${videosToRender.length} videos`);
    }

    /**
     * Load more videos
     */
    async function loadMoreVideos() {
        if (isLoadingMore) return;
        if (displayedCount >= currentVideos.length) return;
        isLoadingMore = true;

        const nextBatch = currentVideos.slice(displayedCount, displayedCount + VIDEOS_PER_PAGE);
        const fragment = document.createDocumentFragment();

        // Get tags for new videos (channel-based)
        const tagsPromises = nextBatch.map(v => globalThis.LatestTube.DB.tags.getByChannel(v.channelId));
        const allTags = await Promise.all(tagsPromises);

        nextBatch.forEach((video, index) => {
            const card = createVideoCardElement(video, video.channelName, allTags[index]);
            fragment.appendChild(card);
        });

        videoList.appendChild(fragment);

        displayedCount += nextBatch.length;
        isLoadingMore = false;

        console.log(`VideoFeed: Loaded ${nextBatch.length} more videos (${displayedCount} total displayed)`);
    }

    /**
     * Setup infinite scroll observer
     */
    function setupInfiniteScroll() {
        if (isObserverInitialized || !infiniteSentinel) return;

        infiniteObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        loadMoreVideos();
                    }
                });
            },
            {
                root: null,
                rootMargin: '400px',
                threshold: 0
            }
        );

        infiniteObserver.observe(infiniteSentinel);
        isObserverInitialized = true;
    }

    /**
     * Render empty state
     * @param {string} message - Custom message for empty state
     * @param {string} title - Custom title for empty state
     */
    function renderEmptyState(message, title) {
        clearFeed();

        // Update empty state content if provided
        const emptyStateTitle = emptyState.querySelector('.empty-state-title');
        const emptyStateMessage = emptyState.querySelector('.empty-state-message');

        if (title && emptyStateTitle) {
            emptyStateTitle.textContent = title;
        }
        if (message && emptyStateMessage) {
            emptyStateMessage.textContent = message;
        }

        emptyState.style.display = 'block';
        videoList.style.display = 'none';
        console.log('VideoFeed: Rendering empty state');
    }

    /**
     * Clear the video feed container
     */
    function clearFeed() {
        videoList.innerHTML = '';
    }

    /**
     * Update a single video card
     * @param {string} videoId
     * @param {Object} updates
     */
    async function updateVideoCard(videoId, updates) {
        const card = videoList.querySelector(`.video-card[data-video-id="${videoId}"]`);
        if (!card) return;

        if (updates.watched !== undefined) {
            card.classList.toggle('watched', updates.watched);
            const checkbox = card.querySelector('.watched-toggle input');
            if (checkbox) {
                checkbox.checked = updates.watched;
            }
        }

        if (updates.tags !== undefined) {
            const tagsContainer = card.querySelector('.video-tags');
            const addBtn = tagsContainer.querySelector('.add-tag-btn');

            // Remove existing tag chips
            tagsContainer.querySelectorAll('.video-tag-chip').forEach(chip => chip.remove());

            // Add new tags
            updates.tags.forEach(tag => {
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
                    handleRemoveTag(videoId, tag, card);
                });
                tagChip.appendChild(removeBtn);

                addBtn.before(tagChip);
            });
        }
    }

    /**
     * Update tag chips for all video cards belonging to a channel
     * @param {string} channelId
     * @param {string[]} tags
     */
    async function updateChannelTags(channelId, tags) {
        const cards = videoList.querySelectorAll('.video-card');
        cards.forEach(card => {
            const videoId = card.dataset.videoId;
            if (!videoId) return;
            globalThis.LatestTube.DB.videos.get(videoId)?.then(video => {
                if (!video || video.channelId !== channelId) return;
                updateVideoCard(videoId, { tags });
            });
        });
    }

    /**
     * Refresh the video feed (reload from DB and render)
     */
    async function refresh() {
        const videos = await loadVideos(currentFilter);
        await renderVideos(videos);
    }

    // Expose VideoFeed API
    globalThis.LatestTube.VideoFeed = {
        loadVideos,
        renderVideos,
        renderEmptyState,
        clearFeed,
        updateVideoCard,
        updateChannelTags,
        refresh
    };
})();
