// ========================================
// YouTube API Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    const BASE_URL = 'https://www.googleapis.com/youtube/v3';
    const RATE_LIMIT_DELAY = 250; // minimum spacing between API call starts
    const MAX_CONCURRENT_REQUESTS = 3;

    let lastApiCall = 0;
    let inFlightRequests = 0;
    const requestQueue = [];

    // ========================================
    // Quota Tracking
    // ========================================
    // YouTube Data API v3 quota costs per endpoint:
    //   channels.list  = 1 unit
    //   playlistItems.list = 1 unit
    //   search.list = 100 units (NOT USED - too expensive)
    // Daily limit: 10,000 units. Failed requests still cost quota.
    const quotaTracker = {
        _sessionUnits: 0,
        _requestLog: [],

        /**
         * Record a quota-consuming API request
         * @param {string} endpoint - API endpoint name
         * @param {number} cost - Quota units consumed
         * @param {boolean} success - Whether the request succeeded
         */
        record(endpoint, cost, success) {
            this._sessionUnits += cost;
            this._requestLog.push({
                endpoint,
                cost,
                success,
                timestamp: Date.now()
            });
            console.log(`YouTube API Quota: +${cost} unit(s) [${endpoint}] (session total: ${this._sessionUnits})`);
        },

        /** Get total quota units used this session */
        getSessionUsage() {
            return this._sessionUnits;
        },

        /** Get the full request log */
        getLog() {
            return [...this._requestLog];
        },

        /** Reset session tracking */
        reset() {
            this._sessionUnits = 0;
            this._requestLog = [];
        }
    };

    /**
     * Sleep utility for rate limiting
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Apply rate limiting - wait at least 1 second between API calls
     */
    async function acquireRequestSlot() {
        if (inFlightRequests < MAX_CONCURRENT_REQUESTS) {
            inFlightRequests += 1;
            return;
        }

        await new Promise(resolve => requestQueue.push(resolve));
        inFlightRequests += 1;
    }

    function releaseRequestSlot() {
        inFlightRequests = Math.max(0, inFlightRequests - 1);
        if (requestQueue.length > 0) {
            const next = requestQueue.shift();
            next();
        }
    }

    async function applyRateLimit() {
        await acquireRequestSlot();

        const now = Date.now();
        const timeSinceLastCall = now - lastApiCall;
        const waitTime = Math.max(0, RATE_LIMIT_DELAY - timeSinceLastCall);

        if (waitTime > 0) {
            console.log(`YouTube API: Rate limiting - waiting ${waitTime}ms`);
            await sleep(waitTime);
        }

        lastApiCall = Date.now();
    }

    /**
     * Get API key from settings
     * @returns {Promise<string>}
     */
    async function getApiKey() {
        const apiKey = await globalThis.LatestTube.DB.settings.get('apiKey');
        if (!apiKey) {
            throw new Error('API key not configured. Please add your YouTube Data API key in settings.');
        }
        return apiKey;
    }

    /**
     * Handle API errors based on HTTP status codes
     * @param {Response} response - Fetch response object
     * @param {string} context - Context for error logging
     */
    async function handleApiError(response, context) {
        let message = '';
        let errorData = null;

        try {
            errorData = await response.json();
        } catch (e) {
            // Response body is not JSON
        }

        switch (response.status) {
            case 400:
                message = 'Bad request: Invalid parameters provided';
                break;
            case 403:
                if (errorData?.error?.errors?.[0]?.reason === 'quotaExceeded') {
                    message = 'YouTube API quota exceeded. Please wait and try again later.';
                } else {
                    message = 'API key invalid or access denied. Please check your API key in settings.';
                }
                break;
            case 404:
                message = 'Channel or playlist not found. Please check the channel ID.';
                break;
            case 429:
                message = 'Rate limited by YouTube API. Please wait a moment and try again.';
                break;
            default:
                message = `HTTP ${response.status}: ${errorData?.error?.message || response.statusText}`;
        }

        const error = new Error(message);
        error.status = response.status;
        error.context = context;
        error.data = errorData;
        throw error;
    }

    /**
     * Make an API request with retries and quota tracking
     * @param {string} url - Full API URL
     * @param {string} context - Context for error logging
     * @param {string} endpoint - Endpoint name for quota tracking
     * @param {number} quotaCost - Quota cost for this request type
     * @param {number} retries - Number of retries remaining
     * @returns {Promise<Object>}
     */
    async function apiRequest(url, context, endpoint = 'unknown', quotaCost = 1, retries = 3) {
        await applyRateLimit();

        try {
            const response = await fetch(url);

            if (!response.ok) {
                // Failed requests still consume quota
                quotaTracker.record(endpoint, quotaCost, false);
                await handleApiError(response, context);
            }

            // Successful request - track quota
            quotaTracker.record(endpoint, quotaCost, true);
            return await response.json();
        } catch (error) {
            // Network errors or other fetch failures
            if (error.name === 'TypeError' && retries > 0) {
                const delay = Math.pow(2, 3 - retries) * 1000; // Exponential backoff: 1s, 2s, 4s
                console.log(`YouTube API: Network error, retrying in ${delay}ms (${retries} retries left)`);
                await sleep(delay);
                return apiRequest(url, context, endpoint, quotaCost, retries - 1);
            }

            // Log and rethrow
            console.error(`YouTube API Error [${context}]:`, error.message);
            throw error;
        } finally {
            releaseRequestSlot();
        }
    }

    /**
     * Fetch channel information from YouTube API.
     * Supports batching: pass a single ID/handle or an array of IDs.
     * Batching multiple channel IDs into one request saves quota
     * (1 unit total vs 1 unit per channel).
     * @param {string|string[]} channelIds - YouTube channel ID(s) or handle
     * @returns {Promise<Object|Object[]>} - Channel details (single or array)
     */
    async function fetchChannelInfo(channelIds) {
        const apiKey = await getApiKey();
        const isBatch = Array.isArray(channelIds);
        const ids = isBatch ? channelIds : [channelIds];

        // Separate IDs from handles (handles must use forHandle, max 1 at a time)
        const regularIds = [];
        const handles = [];

        for (const id of ids) {
            if (id.startsWith('@')) {
                handles.push(id);
            } else {
                regularIds.push(id);
            }
        }

        const results = [];

        // Batch fetch regular channel IDs (up to 50 per request - saves quota!)
        // e.g., 5 channels in 1 request = 1 unit instead of 5 units
        if (regularIds.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < regularIds.length; i += batchSize) {
                const batch = regularIds.slice(i, i + batchSize);
                const idsParam = batch.join(',');
                const url = `${BASE_URL}/channels?part=snippet,contentDetails&id=${idsParam}&fields=items(id,snippet(title,description,thumbnails/default/url),contentDetails/relatedPlaylists/uploads)&key=${apiKey}`;

                console.log(`YouTube API: Batch fetching channel info for ${batch.length} channel(s)`);
                const data = await apiRequest(url, `fetchChannelInfo(batch:${batch.length})`, 'channels.list', 1);

                if (data.items) {
                    for (const item of data.items) {
                        results.push({
                            channelId: item.id,
                            title: item.snippet.title,
                            thumbnail: item.snippet.thumbnails?.default?.url,
                            uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
                            description: item.snippet.description
                        });
                    }
                }
            }
        }

        // Fetch handles individually (API doesn't support batching forHandle)
        for (const handle of handles) {
            const url = `${BASE_URL}/channels?part=snippet,contentDetails&forHandle=${handle.substring(1)}&fields=items(id,snippet(title,description,thumbnails/default/url),contentDetails/relatedPlaylists/uploads)&key=${apiKey}`;

            console.log(`YouTube API: Fetching channel info for handle ${handle}`);
            const data = await apiRequest(url, `fetchChannelInfo(${handle})`, 'channels.list', 1);

            if (data.items && data.items.length > 0) {
                const item = data.items[0];
                results.push({
                    channelId: item.id,
                    title: item.snippet.title,
                    thumbnail: item.snippet.thumbnails?.default?.url,
                    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
                    description: item.snippet.description
                });
            }
        }

        if (!isBatch) {
            // Single channel request - return single result or throw
            if (results.length === 0) {
                throw new Error(`Channel not found: ${channelIds}`);
            }
            return results[0];
        }

        return results;
    }

    /**
     * Fetch videos from a playlist.
     * Uses fields parameter to reduce response payload size.
     * Each page costs 1 quota unit - use maxResults=50 to minimize pages.
     * @param {string} playlistId - YouTube playlist ID
     * @param {string|null} pageToken - Pagination token
     * @returns {Promise<Object>} - Videos and next page token
     */
    async function fetchPlaylistVideos(playlistId, pageToken = null) {
        const apiKey = await getApiKey();
        // Use fields parameter to request only the data we actually need,
        // reducing response size and parse time
        let url = `${BASE_URL}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&fields=nextPageToken,pageInfo/totalResults,items(snippet(resourceId/videoId,title,publishedAt,description,thumbnails/medium/url,thumbnails/default/url))&key=${apiKey}`;

        if (pageToken) {
            url += `&pageToken=${pageToken}`;
        }

        console.log(`YouTube API: Fetching playlist videos for ${playlistId}${pageToken ? ' (page: ' + pageToken.substring(0, 10) + '...)' : ''}`);
        const data = await apiRequest(url, `fetchPlaylistVideos(${playlistId})`, 'playlistItems.list', 1);

        const videoIds = (data.items || [])
            .map(item => item.snippet?.resourceId?.videoId)
            .filter(Boolean);

        const durationMap = videoIds.length > 0
            ? await fetchVideoDurations(videoIds)
            : new Map();

        const videos = (data.items || []).map(item => {
            const videoId = item.snippet.resourceId.videoId;
            return {
                videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                publishedAt: item.snippet.publishedAt,
                description: item.snippet.description,
                durationSeconds: durationMap.get(videoId) ?? null
            };
        });

        return {
            videos,
            nextPageToken: data.nextPageToken || null,
            totalResults: data.pageInfo?.totalResults || 0
        };
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
            console.warn('YouTube API: Could not load shorts duration, using default', error);
        }
        return 60; // Default threshold: 60 seconds
    }

    /**
     * Fetch all videos from a channel since a specific date.
     * OPTIMIZATION: If cachedChannelInfo is provided (with uploadsPlaylistId),
     * skips the channel info API call entirely, saving 1 quota unit per channel.
     * @param {string} channelId - YouTube channel ID
     * @param {Date|null} sinceDate - Only fetch videos published after this date
     * @param {Object|null} cachedChannelInfo - Pre-cached channel info from IndexedDB
     * @returns {Promise<Object>} - { channelInfo, videos }
     */
    async function fetchAllChannelVideos(channelId, sinceDate = null, cachedChannelInfo = null, options = {}) {
        const MAX_VIDEOS_PER_CHANNEL = 10;
        const includeShorts = options.includeShorts !== false;
        const shortsDurationThreshold = options.shortsDurationThreshold || await getShortsDurationThreshold();
        let channelInfo;

        // Use cached channel info if available (saves 1 quota unit)
        if (cachedChannelInfo && cachedChannelInfo.uploadsPlaylistId) {
            channelInfo = cachedChannelInfo;
            console.log(`YouTube API: Using cached channel info for ${channelId} (saved 1 quota unit)`);
        } else {
            // First fetch - need to get channel info from API
            channelInfo = await fetchChannelInfo(channelId);
        }

        if (!channelInfo.uploadsPlaylistId) {
            throw new Error(`No uploads playlist found for channel ${channelId}`);
        }

        const allVideos = [];
        let pageToken = null;
        let stopPagination = false;
        const sixMonthsAgo = sinceDate || new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
        const resolvedChannelId = channelInfo.channelId || channelId;

        console.log(`YouTube API: Fetching all videos since ${sixMonthsAgo.toISOString()}`);

        do {
            const result = await fetchPlaylistVideos(channelInfo.uploadsPlaylistId, pageToken);

            for (const video of result.videos) {
                const videoDate = new Date(video.publishedAt);

                // Stop if video is older than sinceDate
                if (videoDate < sixMonthsAgo) {
                    console.log(`YouTube API: Stopping pagination - video ${video.videoId} is too old (${video.publishedAt})`);
                    stopPagination = true;
                    break;
                }

                const isShort = typeof video.durationSeconds === 'number'
                    ? video.durationSeconds <= shortsDurationThreshold
                    : false;

                if (!includeShorts && isShort) {
                    console.log(`YouTube API: Skipping short video ${video.videoId} (${video.durationSeconds}s <= ${shortsDurationThreshold}s threshold)`);
                    continue;
                }

                allVideos.push({
                    ...video,
                    channelId: resolvedChannelId
                });

                if (allVideos.length >= MAX_VIDEOS_PER_CHANNEL) {
                    console.log(`YouTube API: Reached per-channel limit (${MAX_VIDEOS_PER_CHANNEL})`);
                    stopPagination = true;
                    break;
                }
            }

            pageToken = result.nextPageToken;

            if (stopPagination) {
                break;
            }

            // Safety check - don't fetch more than 500 videos
            if (allVideos.length >= 500) {
                console.log('YouTube API: Reached maximum video limit (500)');
                break;
            }

        } while (pageToken);

        console.log(`YouTube API: Fetched ${allVideos.length} videos for channel ${channelId}`);
        return {
            channelInfo,
            videos: allVideos
        };
    }

    /**
     * Fetch durations for a list of video IDs.
     * @param {string[]} videoIds
     * @returns {Promise<Map<string, number|null>>}
     */
    async function fetchVideoDurations(videoIds) {
        const apiKey = await getApiKey();
        const ids = Array.from(new Set(videoIds)).filter(Boolean);
        const durationMap = new Map();

        if (ids.length === 0) {
            return durationMap;
        }

        const batchSize = 50;
        for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize);
            const idsParam = batch.join(',');
            const url = `${BASE_URL}/videos?part=contentDetails&id=${idsParam}&fields=items(id,contentDetails/duration)&key=${apiKey}`;
            const data = await apiRequest(url, `fetchVideoDurations(batch:${batch.length})`, 'videos.list', 1);

            (data.items || []).forEach(item => {
                const seconds = parseIsoDurationToSeconds(item.contentDetails?.duration);
                durationMap.set(item.id, seconds);
            });
        }

        return durationMap;
    }

    /**
     * Parse ISO 8601 duration (e.g. PT1H2M10S) into seconds.
     * @param {string} isoDuration
     * @returns {number|null}
     */
    function parseIsoDurationToSeconds(isoDuration) {
        if (!isoDuration) return null;
        const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return null;
        const hours = Number.parseInt(match[1] || '0', 10);
        const minutes = Number.parseInt(match[2] || '0', 10);
        const seconds = Number.parseInt(match[3] || '0', 10);
        return (hours * 3600) + (minutes * 60) + seconds;
    }

    // Expose YouTube API
    globalThis.LatestTube.YouTube = {
        fetchChannelInfo,
        fetchPlaylistVideos,
        fetchAllChannelVideos,
        fetchVideoDurations,
        quota: quotaTracker
    };
})();
