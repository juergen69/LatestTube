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
            if (duration !== undefined && duration !== null && !Number.isNaN(duration)) {
                return duration;
            }
        } catch (error) {
            console.warn('FetchService: Could not load shorts duration, using default', error);
        }
        return 60; // Default threshold: 60 seconds
    }

    /**
     * Get cached channel info from database
     * @param {string} channelId
     * @returns {Promise<Object|null>}
     */
    async function getCachedChannelInfo(channelId) {
        try {
            const existing = await globalThis.LatestTube.DB.channels.get(channelId);
            if (existing?.uploadsPlaylistId) {
                console.log(`FetchService: Using cached channel info for ${channelId} (saving 1 quota unit)`);
                return existing;
            }
        } catch (error) {
            console.log(`FetchService: Cache miss for ${channelId}, will fetch from API`);
        }
        return null;
    }

    /**
     * Save channel to database
     * @param {string} channelId
     * @param {Object} channelInfo
     * @param {Object} options
     */
    async function saveChannel(channelId, channelInfo, options) {
        const channel = {
            channelId: channelInfo.channelId,
            title: channelInfo.title,
            thumbnail: channelInfo.thumbnail,
            uploadsPlaylistId: channelInfo.uploadsPlaylistId,
            addedAt: Date.now(),
            includeShorts: options.includeShorts !== false
        };

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
        } catch (error) {
            console.log(`FetchService: Channel ${channelId} already exists or error:`, error.message);
        }
    }

    /**
     * Save videos to database
     * @param {Array} videos
     * @returns {Promise<{addedCount: number, restoredCount: number, skippedCount: number}>} Counts of added, restored and skipped videos
     */
    async function saveVideos(videos) {
        let addedCount = 0;
        let restoredCount = 0;
        let skippedCount = 0;

        for (const video of videos) {
            const existing = await globalThis.LatestTube.DB.videos.get(video.videoId);

            if (existing) {
                skippedCount++;
                continue;
            }

            // Check if this video was previously watched (by checking if a watched timestamp exists in settings)
            // This prevents watched videos from reappearing as unwatched after being pruned
            const wasWatched = await globalThis.LatestTube.DB.settings.get(`watched_${video.videoId}`);

            const videoRecord = {
                videoId: video.videoId,
                channelId: video.channelId,
                title: video.title,
                thumbnail: video.thumbnail,
                publishedAt: video.publishedAt,
                description: video.description,
                durationSeconds: video.durationSeconds ?? null,
                watched: wasWatched === true
            };

            try {
                await globalThis.LatestTube.DB.videos.add(videoRecord);
                if (wasWatched) {
                    restoredCount++;
                    console.log(`FetchService: Restored watched video ${video.videoId} - ${video.title.substring(0, 50)}...`);
                } else {
                    addedCount++;
                    console.log(`FetchService: Added video ${video.videoId} - ${video.title.substring(0, 50)}...`);
                }
            } catch (error) {
                console.error(`FetchService: Failed to add video ${video.videoId}`, error);
            }
        }

        return { addedCount, restoredCount, skippedCount };
    }

    /**
     * Prune old videos that are no longer in the channel
     * Only deletes videos that are older than the cutoff date, not videos that
     * weren't fetched due to the maxVideosPerChannel limit.
     * @param {string} channelId
     * @param {Set} fetchedVideoIds
     * @param {Date} sinceDate - Videos newer than this date are kept even if not fetched
     */
    async function pruneOldVideos(channelId, fetchedVideoIds, sinceDate) {
        try {
            const existingVideos = await globalThis.LatestTube.DB.videos.getByChannel(channelId);
            for (const existing of existingVideos) {
                if (fetchedVideoIds.has(existing.videoId)) {
                    continue; // Video was fetched, keep it
                }

                const videoDate = new Date(existing.publishedAt);
                if (videoDate >= sinceDate) {
                    // Video is newer than cutoff but wasn't fetched (likely due to maxVideosPerChannel limit)
                    // Keep it in the database to prevent cyclical delete/re-add
                    console.log(`FetchService: Keeping video ${existing.videoId} - newer than cutoff but not in fetch results`);
                    continue;
                }

                // Video is older than cutoff and wasn't fetched - safe to delete
                await globalThis.LatestTube.DB.videos.delete(existing.videoId);
                // Clean up watched setting to prevent storage bloat
                // Only delete if video was watched (setting exists), leave unwatched videos' settings
                const wasWatched = await globalThis.LatestTube.DB.settings.get(`watched_${existing.videoId}`);
                if (wasWatched === true) {
                    await globalThis.LatestTube.DB.settings.delete(`watched_${existing.videoId}`);
                }
            }
        } catch (error) {
            console.error('FetchService: Error pruning old videos', error);
        }
    }

    /**
     * Get the timestamp to use for fetching videos from a channel.
     * Uses the most recent unwatched video's timestamp to avoid losing newer unwatched content.
     * Falls back to most recent watched video, then 6 months ago if no videos exist.
     * @param {string} channelId
     * @returns {Promise<Date>}
     */
    async function getFetchSinceDate(channelId) {
        try {
            // First, try to use the most recent unwatched video's timestamp
            // This ensures watching old videos doesn't cause newer unwatched videos to be pruned
            const mostRecentUnwatched = await globalThis.LatestTube.DB.videos.getMostRecentUnwatchedTimestamp(channelId);
            if (mostRecentUnwatched) {
                console.log(`FetchService: Using most recent unwatched timestamp ${mostRecentUnwatched.toISOString()} for channel ${channelId}`);
                return mostRecentUnwatched;
            }

            // If no unwatched videos, fall back to the most recent watched timestamp
            const lastWatched = await globalThis.LatestTube.DB.videos.getLastWatchedTimestamp(channelId);
            if (lastWatched) {
                console.log(`FetchService: No unwatched videos, using last watched timestamp ${lastWatched.toISOString()} for channel ${channelId}`);
                return lastWatched;
            }
        } catch (error) {
            console.warn(`FetchService: Error getting timestamp for ${channelId}`, error);
        }

        // Default: 6 months ago
        const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
        console.log(`FetchService: No videos found, using default 6-month cutoff ${sixMonthsAgo.toISOString()}`);
        return sixMonthsAgo;
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
            const cachedChannelInfo = await getCachedChannelInfo(channelId);

            // Get shorts duration threshold from settings
            const shortsDurationThreshold = await getShortsDurationThreshold();

            // Get the timestamp of the most recent watched video to use as fetch starting point
            // This prevents old watched videos from reappearing after being pruned
            const sinceDate = await getFetchSinceDate(channelId);

            // Fetch videos (with cached channel info if available)
            const { channelInfo, videos } = await globalThis.LatestTube.YouTube.fetchAllChannelVideos(
                channelId,
                sinceDate,
                cachedChannelInfo,
                {
                    includeShorts: options.includeShorts !== false,
                    shortsDurationThreshold
                }
            );

            // Save channel to database
            await saveChannel(channelId, channelInfo, options);

            // Store videos (skip duplicates)
            const fetchedVideoIds = new Set(videos.map(video => video.videoId));
            const { addedCount, restoredCount, skippedCount } = await saveVideos(videos);

            // Prune older videos beyond the newest set
            await pruneOldVideos(channelId, fetchedVideoIds, sinceDate);

            console.log(`FetchService: Channel ${channelId} refreshed - ${addedCount} added, ${restoredCount} restored, ${skippedCount} skipped`);

            if (options.onChannelComplete) {
                try {
                    await options.onChannelComplete({
                        channelId,
                        channelInfo,
                        addedCount,
                        restoredCount,
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
                restoredCount,
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
