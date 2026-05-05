// ========================================
// Fetch Service Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    const FETCH_CURSOR_OVERLAP_MS = 5 * 60 * 1000;

    // Track ongoing fetch operations
    let isRefreshing = false;
    let refreshAbortController = null;



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
     * Get configured channel refresh concurrency from settings.
     * @returns {Promise<number>}
     */
    async function getRefreshConcurrency() {
        try {
            const concurrency = await globalThis.LatestTube.DB.settings.get('refreshConcurrency');
            if (concurrency !== undefined && concurrency !== null && !Number.isNaN(concurrency)) {
                return Math.max(1, Math.min(Number(concurrency), 10));
            }
        } catch (error) {
            console.warn('FetchService: Could not load refresh concurrency, using default', error);
        }
        return 3;
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
        try {
            const existing = await globalThis.LatestTube.DB.channels.get(channelId);
            const previousLastCheckedAt = Number(existing?.lastCheckedAt) || 0;
            const previousRetainedOldestPublishedAt = Number(existing?.retainedOldestPublishedAt) || 0;
            const requestedLastCheckedAt = Number(options.lastCheckedAt) || 0;
            const requestedRetainedOldestPublishedAt = Number(options.retainedOldestPublishedAt) || 0;
            const nextLastCheckedAt = requestedLastCheckedAt > 0
                ? Math.max(previousLastCheckedAt, requestedLastCheckedAt)
                : previousLastCheckedAt;
            const channel = {
                ...existing,
                channelId: channelInfo.channelId,
                title: channelInfo.title,
                thumbnail: channelInfo.thumbnail,
                uploadsPlaylistId: channelInfo.uploadsPlaylistId,
                addedAt: existing?.addedAt || Date.now(),
                includeShorts: options.includeShorts === undefined
                    ? existing?.includeShorts ?? true
                    : options.includeShorts,
                lastCheckedAt: nextLastCheckedAt || undefined,
                retainedOldestPublishedAt: requestedRetainedOldestPublishedAt || previousRetainedOldestPublishedAt || undefined
            };

            if (!existing) {
                await globalThis.LatestTube.DB.channels.add(channel);
                return;
            }

            await globalThis.LatestTube.DB.channels.update(channel);
        } catch (error) {
            console.log(`FetchService: Channel ${channelId} already exists or error:`, error.message);
        }
    }

    /**
     * Get the oldest publication date from fetched videos.
     * Used for pruning without tying deletion to the moving fetch cursor.
     * @param {Array} videos
     * @returns {Date|null}
     */
    function getOldestVideoDate(videos) {
        if (!Array.isArray(videos) || videos.length === 0) {
            return null;
        }

        let oldestTimestamp = Number.POSITIVE_INFINITY;
        for (const video of videos) {
            const publishedTimestamp = new Date(video.publishedAt).getTime();
            if (Number.isFinite(publishedTimestamp) && publishedTimestamp < oldestTimestamp) {
                oldestTimestamp = publishedTimestamp;
            }
        }

        return Number.isFinite(oldestTimestamp)
            ? new Date(oldestTimestamp)
            : null;
    }

    /**
     * Return the earlier of two dates.
     * @param {Date|null} firstDate
     * @param {Date|null} secondDate
     * @returns {Date|null}
     */
    function getEarlierDate(firstDate, secondDate) {
        const firstTime = firstDate instanceof Date ? firstDate.getTime() : Number.NaN;
        const secondTime = secondDate instanceof Date ? secondDate.getTime() : Number.NaN;

        if (!Number.isFinite(firstTime)) {
            return Number.isFinite(secondTime) ? secondDate : null;
        }

        if (!Number.isFinite(secondTime)) {
            return firstDate;
        }

        return firstTime <= secondTime ? firstDate : secondDate;
    }

    /**
     * Return the later of two dates.
     * @param {Date|null} firstDate
     * @param {Date|null} secondDate
     * @returns {Date|null}
     */
    function getLaterDate(firstDate, secondDate) {
        const firstTime = firstDate instanceof Date ? firstDate.getTime() : Number.NaN;
        const secondTime = secondDate instanceof Date ? secondDate.getTime() : Number.NaN;

        if (!Number.isFinite(firstTime)) {
            return Number.isFinite(secondTime) ? secondDate : null;
        }

        if (!Number.isFinite(secondTime)) {
            return firstDate;
        }

        return firstTime >= secondTime ? firstDate : secondDate;
    }

    /**
     * Get the oldest locally retained video date for a channel.
     * This acts as a floor so previously pruned history does not get re-added.
     * @param {string} channelId
     * @param {Object|null} channelRecord
     * @returns {Promise<Date|null>}
     */
    async function getRetainedVideoHorizon(channelId, channelRecord = null) {
        const retainedOldestPublishedAt = Number(channelRecord?.retainedOldestPublishedAt);
        if (Number.isFinite(retainedOldestPublishedAt) && retainedOldestPublishedAt > 0) {
            return new Date(retainedOldestPublishedAt);
        }

        try {
            const existingVideos = await globalThis.LatestTube.DB.videos.getByChannel(channelId);
            return getOldestVideoDate(existingVideos);
        } catch (error) {
            console.warn(`FetchService: Failed to resolve retained horizon for ${channelId}`, error);
            return null;
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
     * @param {Date|null} pruneBeforeDate - Videos newer than this date are kept even if not fetched
     */
    async function pruneOldVideos(channelId, fetchedVideoIds, pruneBeforeDate) {
        try {
            const existingVideos = await globalThis.LatestTube.DB.videos.getByChannel(channelId);
            const retainedExistingVideos = [];
            const hasPruneBeforeDate = pruneBeforeDate instanceof Date && !Number.isNaN(pruneBeforeDate.getTime());

            for (const existing of existingVideos) {
                if (fetchedVideoIds.has(existing.videoId)) {
                    retainedExistingVideos.push(existing);
                    continue; // Video was fetched, keep it
                }

                if (!hasPruneBeforeDate) {
                    retainedExistingVideos.push(existing);
                    continue;
                }

                const videoDate = new Date(existing.publishedAt);
                if (videoDate >= pruneBeforeDate) {
                    // Video is newer than cutoff but wasn't fetched (likely due to maxVideosPerChannel limit)
                    // Keep it in the database to prevent cyclical delete/re-add
                    console.log(`FetchService: Keeping video ${existing.videoId} - newer than cutoff but not in fetch results`);
                    retainedExistingVideos.push(existing);
                    continue;
                }

                // Video is older than cutoff and wasn't fetched - safe to delete.
                // Keep the persisted watched marker so old videos do not reappear as unwatched
                // if YouTube returns them again in a later refresh.
                await globalThis.LatestTube.DB.videos.delete(existing.videoId);
            }

            return getOldestVideoDate(retainedExistingVideos);
        } catch (error) {
            console.error('FetchService: Error pruning old videos', error);
            return null;
        }
    }

    /**
     * Get the timestamp to use for fetching videos from a channel.
     * Uses a monotonic per-channel cursor so checks stay fast as history grows.
     * Falls back to 6 months ago for channels that have never been refreshed.
     * @param {string} channelId
     * @param {Object|null} channelRecord
     * @returns {Promise<Date>}
     */
    async function getFetchSinceDate(channelId, channelRecord = null) {
        const retainedVideoHorizon = await getRetainedVideoHorizon(channelId, channelRecord);
        const lastCheckedAt = Number(channelRecord?.lastCheckedAt);
        if (Number.isFinite(lastCheckedAt) && lastCheckedAt > 0) {
            const lastCheckedDate = new Date(lastCheckedAt);
            const sinceDate = getLaterDate(lastCheckedDate, retainedVideoHorizon);
            console.log(`FetchService: Using fetch cursor ${sinceDate.toISOString()} for channel ${channelId}`);
            return sinceDate;
        }

        // Default: 6 months ago
        const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
        const sinceDate = getLaterDate(sixMonthsAgo, retainedVideoHorizon) || sixMonthsAgo;
        console.log(`FetchService: No cursor found, using fallback cutoff ${sinceDate.toISOString()} for channel ${channelId}`);
        return sinceDate;
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
            const refreshStartedAt = Date.now();
            // OPTIMIZATION: Check if channel already exists in DB with uploadsPlaylistId.
            // If so, skip the channels.list API call (saves 1 quota unit per channel).
            // Per blog: "Batching reduces costs" — avoiding unnecessary calls is even better.
            const cachedChannelInfo = await getCachedChannelInfo(channelId);

            // Get shorts duration threshold from settings
            const shortsDurationThreshold = await getShortsDurationThreshold();

            // Use a monotonic per-channel cursor so refresh cost does not grow with local history.
            const sinceDate = await getFetchSinceDate(channelId, cachedChannelInfo);

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

            // Store videos (skip duplicates)
            const fetchedVideoIds = new Set(videos.map(video => video.videoId));
            const { addedCount, restoredCount, skippedCount } = await saveVideos(videos);

            // Prune videos older than the oldest item returned in this refresh.
            // This keeps the cursor independent from local watch history.
            const pruneBeforeDate = getOldestVideoDate(videos);
            const oldestRetainedExistingDate = await pruneOldVideos(channelId, fetchedVideoIds, pruneBeforeDate);
            const retainedOldestDate = getEarlierDate(pruneBeforeDate, oldestRetainedExistingDate);

            await saveChannel(channelId, channelInfo, {
                ...options,
                lastCheckedAt: refreshStartedAt - FETCH_CURSOR_OVERLAP_MS,
                retainedOldestPublishedAt: retainedOldestDate?.getTime()
            });

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

            const configuredConcurrency = options.concurrency || await getRefreshConcurrency();
            const concurrency = Math.max(1, Math.min(configuredConcurrency, channels.length));
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
