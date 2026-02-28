// ========================================
// Fetch Service Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    // Track ongoing fetch operations
    let isRefreshing = false;
    let refreshAbortController = null;

    /**
     * Check if a video already exists in the database
     * @param {string} videoId
     * @returns {Promise<boolean>}
     */
    async function videoExists(videoId) {
        try {
            const existing = await globalThis.LatestTube.DB.videos.get(videoId);
            return !!existing;
        } catch (error) {
            console.error('FetchService: Error checking video existence', error);
            return false;
        }
    }

    /**
     * Get shorts duration threshold from settings
     * @returns {Promise<number>}
     */
    async function getShortsDurationThreshold() {
        try {
            const duration = await globalThis.LatestTube.DB.settings.get('shortsDuration');
            if (duration !== undefined && duration !== null && !isNaN(duration)) {
                return duration;
            }
        } catch (error) {
            console.warn('FetchService: Could not load shorts duration, using default', error);
        }
        return 60; // Default threshold: 60 seconds
    }

    /**
     * Refresh a single channel - fetch info and videos.
     * OPTIMIZATION: Reuses cached channel info (uploadsPlaylistId) from IndexedDB
     * when available, saving 1 API quota unit per existing channel refresh.
     * @param {string} channelId - YouTube channel ID
     * @returns {Promise<Object>} - Result with success flag and stats
     */
    async function refreshChannel(channelId, options = {}) {
        console.log(`FetchService: Refreshing channel ${channelId}`);

        try {
            // OPTIMIZATION: Check if channel already exists in DB with uploadsPlaylistId.
            // If so, skip the channels.list API call (saves 1 quota unit per channel).
            // Per blog: "Batching reduces costs" — avoiding unnecessary calls is even better.
            let cachedChannelInfo = null;
            try {
                const existing = await globalThis.LatestTube.DB.channels.get(channelId);
                if (existing?.uploadsPlaylistId) {
                    cachedChannelInfo = existing;
                    console.log(`FetchService: Using cached channel info for ${channelId} (saving 1 quota unit)`);
                }
            } catch (error) {
                // If we can't read cache, we'll just fetch from API
                console.log(`FetchService: Cache miss for ${channelId}, will fetch from API`);
            }

            // Get shorts duration threshold from settings
            const shortsDurationThreshold = await getShortsDurationThreshold();

            // Fetch videos (with cached channel info if available)
            const { channelInfo, videos } = await globalThis.LatestTube.YouTube.fetchAllChannelVideos(
                channelId,
                null,
                cachedChannelInfo,
                {
                    includeShorts: options.includeShorts !== false,
                    shortsDurationThreshold
                }
            );

            // Update channel in database
            const channel = {
                channelId: channelInfo.channelId,
                title: channelInfo.title,
                thumbnail: channelInfo.thumbnail,
                uploadsPlaylistId: channelInfo.uploadsPlaylistId,
                addedAt: Date.now(),
                includeShorts: options.includeShorts !== false
            };

            // Check if channel exists, if so update it, otherwise add it
            try {
                const existing = await globalThis.LatestTube.DB.channels.get(channelId);
                if (!existing) {
                    await globalThis.LatestTube.DB.channels.add(channel);
                } else if (options.includeShorts !== undefined) {
                    await globalThis.LatestTube.DB.channels.update({
                        ...existing,
                        includeShorts: options.includeShorts !== false
                    });
                }
                // Note: We don't update existing channels here to preserve addedAt
            } catch (error) {
                // Channel might already exist
                console.log(`FetchService: Channel ${channelId} already exists or error:`, error.message);
            }

            // Store videos (skip duplicates)
            let addedCount = 0;
            let skippedCount = 0;
            const fetchedVideoIds = new Set(videos.map(video => video.videoId));

            for (const video of videos) {
                const exists = await videoExists(video.videoId);

                if (exists) {
                    skippedCount++;
                    continue;
                }

                const videoRecord = {
                    videoId: video.videoId,
                    channelId: video.channelId,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    publishedAt: video.publishedAt,
                    description: video.description,
                    durationSeconds: video.durationSeconds ?? null,
                    watched: false
                };

                try {
                    await globalThis.LatestTube.DB.videos.add(videoRecord);
                    addedCount++;
                    console.log(`FetchService: Added video ${video.videoId} - ${video.title.substring(0, 50)}...`);
                } catch (error) {
                    console.error(`FetchService: Failed to add video ${video.videoId}`, error);
                }
            }

            // Prune older videos beyond the newest set
            try {
                const existingVideos = await globalThis.LatestTube.DB.videos.getByChannel(channelId);
                for (const existing of existingVideos) {
                    if (!fetchedVideoIds.has(existing.videoId)) {
                        await globalThis.LatestTube.DB.videos.delete(existing.videoId);
                    }
                }
            } catch (error) {
                console.error('FetchService: Error pruning old videos', error);
            }

            console.log(`FetchService: Channel ${channelId} refreshed - ${addedCount} added, ${skippedCount} skipped`);

            if (options.onChannelComplete) {
                try {
                    await options.onChannelComplete({
                        channelId,
                        channelInfo,
                        addedCount,
                        skippedCount,
                        totalVideos: videos.length
                    });
                } catch (error) {
                    console.warn('FetchService: onChannelComplete handler failed', error);
                }
            }

            return {
                success: true,
                channelId,
                channelInfo,
                addedCount,
                skippedCount,
                totalVideos: videos.length
            };

        } catch (error) {
            console.error(`FetchService: Failed to refresh channel ${channelId}`, error);
            throw error;
        }
    }

    /**
     * Fetch videos for a specific channel
     * @param {string} channelId - YouTube channel ID
     * @returns {Promise<Object>} - Result with videos
     */
    async function fetchChannelVideos(channelId) {
        return refreshChannel(channelId);
    }

    /**
     * Refresh all channels
     * @returns {Promise<Object>} - Result with stats for all channels
     */
    async function refreshAllChannels(options = {}) {
        if (isRefreshing) {
            console.log('FetchService: Refresh already in progress');
            return { success: false, message: 'Refresh already in progress' };
        }

        isRefreshing = true;
        refreshAbortController = new AbortController();

        try {
            const channels = await globalThis.LatestTube.DB.channels.getAll();

            if (channels.length === 0) {
                console.log('FetchService: No channels to refresh');
                return { success: true, message: 'No channels to refresh', results: [] };
            }

            console.log(`FetchService: Refreshing ${channels.length} channels`);

            const results = [];
            let totalAdded = 0;
            let totalSkipped = 0;

            const concurrency = Math.max(1, Math.min(options.concurrency || 3, channels.length));
            const channelById = new Map(channels.map(channel => [channel.channelId, channel]));
            const queue = channels.map(channel => channel.channelId);

            const worker = async () => {
                while (queue.length > 0) {
                    if (refreshAbortController.signal.aborted) {
                        console.log('FetchService: Refresh aborted');
                        return;
                    }

                    const channelId = queue.shift();
                    if (!channelId) return;
                    const channel = channelById.get(channelId);

                    if (options.onChannelStart) {
                        try {
                            await options.onChannelStart(channelId);
                        } catch (error) {
                            console.warn('FetchService: onChannelStart handler failed', error);
                        }
                    }

                    try {
                        // Get shorts duration threshold from settings for each channel refresh
                        const shortsDurationThreshold = await getShortsDurationThreshold();
                        const result = await refreshChannel(channelId, {
                            onChannelComplete: options.onChannelComplete,
                            includeShorts: channel ? channel.includeShorts !== false : true,
                            shortsDurationThreshold
                        });
                        results.push(result);
                        totalAdded += result.addedCount;
                        totalSkipped += result.skippedCount;
                    } catch (error) {
                        console.error(`FetchService: Error refreshing channel ${channelId}`, error);
                        results.push({
                            success: false,
                            channelId,
                            error: error.message
                        });
                    }
                }
            };

            const workers = Array.from({ length: concurrency }, () => worker());
            await Promise.all(workers);

            // Update last refresh timestamp
            await globalThis.LatestTube.DB.settings.set('lastRefresh', Date.now());

            // Log quota usage summary
            const quotaUsed = globalThis.LatestTube.YouTube.quota.getSessionUsage();
            console.log(`FetchService: Refresh complete - ${totalAdded} videos added, ${totalSkipped} skipped, ${quotaUsed} quota units used this session`);

            return {
                success: true,
                totalAdded,
                totalSkipped,
                quotaUsed,
                results
            };

        } catch (error) {
            console.error('FetchService: Error during refresh all', error);
            return {
                success: false,
                error: error.message
            };
        } finally {
            isRefreshing = false;
            refreshAbortController = null;
        }
    }

    /**
     * Check if a refresh is currently in progress
     * @returns {boolean}
     */
    function isRefreshInProgress() {
        return isRefreshing;
    }

    /**
     * Abort any ongoing refresh operation
     */
    function abortRefresh() {
        if (refreshAbortController) {
            refreshAbortController.abort();
            console.log('FetchService: Refresh aborted by user');
        }
    }

    // Expose FetchService
    globalThis.LatestTube.FetchService = {
        refreshChannel,
        fetchChannelVideos,
        refreshAllChannels,
        isRefreshInProgress,
        abortRefresh
    };
})();
