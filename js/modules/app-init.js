// ========================================
// App Initialization Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    // DOM Elements
    const refreshStatusEl = document.getElementById('refresh-status');
    const refreshBtn = document.getElementById('refresh-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const toastEl = document.getElementById('toast');

    // State
    let initialized = false;
    let refreshInProgress = false;

    // ========================================
    // Main Initialization
    // ========================================

    /**
     * Main entry point - called on DOMContentLoaded
     */
    async function init() {
        if (initialized) {
            console.log('App: Already initialized, skipping');
            return;
        }

        console.log('App: Starting initialization...');

        try {
            // 1. Initialize Database
            await globalThis.LatestTube.DB.init();
            console.log('App: Database initialized');

            // 2. Check first run state
            const apiKey = await globalThis.LatestTube.DB.settings.get('apiKey');
            const channels = await globalThis.LatestTube.DB.channels.getAll();
            const hasApiKey = !!apiKey;
            const hasChannels = channels.length > 0;

            console.log('App: First run check - API Key:', hasApiKey, 'Channels:', channels.length);

            // 3. Load initial data if we have channels
            if (hasChannels) {
                // Restore saved filter state before first render
                if (globalThis.LatestTube.Filters?.loadSavedFilters) {
                    await globalThis.LatestTube.Filters.loadSavedFilters();
                }
                console.log('App: Loading videos from database...');
                const savedFilters = globalThis.LatestTube.Filters?.getCurrentFilters?.() || {};
                const videos = await globalThis.LatestTube.VideoFeed.loadVideos(savedFilters);
                await globalThis.LatestTube.VideoFeed.renderVideos(videos);

                // Update video count
                const videoCountElement = document.getElementById('video-count');
                const videoCountValue = document.getElementById('video-count-value');
                if (videoCountValue && videoCountElement) {
                    videoCountValue.textContent = videos.length;
                    videoCountElement.style.display = videos.length > 0 ? 'block' : 'none';
                }

                // Render filter chips
                await globalThis.LatestTube.Filters.renderFilterChips();
                // Ensure filter UI matches restored state
                await globalThis.LatestTube.Filters.applyFilters();
            }

            // 4. Handle first run UI
            if (!hasApiKey && !hasChannels) {
                showFirstRunUI('welcome');
            } else if (!hasApiKey) {
                showFirstRunUI('apiKey');
            } else if (!hasChannels) {
                showFirstRunUI('channels');
            }

            // 5. Start background refresh (if conditions met)
            if (hasApiKey && hasChannels) {
                startBackgroundRefresh();
            }

            initialized = true;
            console.log('App: Initialization complete');

        } catch (error) {
            console.error('App: Initialization failed:', error);
            showToast('Failed to initialize app. Please refresh the page.', 'error');
        }
    }

    // ========================================
    // First Run Experience
    // ========================================

    /**
     * Show first run UI based on type
     * @param {string} type - 'apiKey' or 'channels' or 'welcome'
     */
    function showFirstRunUI(type) {
        if (type === 'welcome') {
            showWelcomeMessage();
        } else if (type === 'apiKey') {
            globalThis.LatestTube.VideoFeed.renderEmptyState(
                'To get started, please add your YouTube Data API v3 key in settings.\nDon\'t have one? Get it free from Google Cloud Console.',
                'Welcome to LatestTube!'
            );

            settingsBtn.classList.add('pulse');

            setTimeout(() => {
                globalThis.LatestTube.Settings.open();
            }, 500);
        } else if (type === 'channels') {
            globalThis.LatestTube.VideoFeed.renderEmptyState(
                'You have an API key configured. Now add your favorite YouTube channels to start tracking videos!',
                'Add Your First Channel'
            );

            settingsBtn.classList.add('pulse');
        }
    }

    /**
     * Show the welcome message for first-time users
     */
    function showWelcomeMessage() {
        const welcomeMessageEl = document.getElementById('welcome-message');
        const emptyStateEl = document.getElementById('empty-state');
        const videoListEl = document.getElementById('video-list');

        if (!welcomeMessageEl) return;

        // Hide empty state and video list
        if (emptyStateEl) emptyStateEl.style.display = 'none';
        if (videoListEl) videoListEl.style.display = 'none';

        // Show welcome message
        welcomeMessageEl.style.display = 'block';

        // Add click handler for Get Started button
        const getStartedBtn = document.getElementById('welcome-get-started-btn');
        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', handleWelcomeGetStarted);
        }

        console.log('App: Showing welcome message');
    }

    /**
     * Handle Get Started button click from welcome screen
     */
    function handleWelcomeGetStarted() {
        const welcomeMessageEl = document.getElementById('welcome-message');

        // Hide welcome message
        if (welcomeMessageEl) welcomeMessageEl.style.display = 'none';

        // Open settings to let user add API key
        settingsBtn.classList.add('pulse');
        setTimeout(() => {
            globalThis.LatestTube.Settings.open();
        }, 300);
    }

    /**
     * Check if this is the first run (no API key configured)
     * @returns {Promise<boolean>}
     */
    async function checkFirstRun() {
        const apiKey = await globalThis.LatestTube.DB.settings.get('apiKey');
        return !apiKey;
    }

    // ========================================
    // Background Refresh
    // ========================================

    /**
     * Start background refresh if conditions are met
     */
    async function startBackgroundRefresh() {
        const lastRefresh = await globalThis.LatestTube.DB.settings.get('lastRefresh');
        const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);

        if (!lastRefresh || lastRefresh < thirtyMinutesAgo) {
            console.log('App: Starting background refresh...');
            showRefreshStatus('Checking for new videos...', true);

            try {
                const result = await globalThis.LatestTube.FetchService.refreshAllChannels({
                    concurrency: 3,
                    onChannelStart: async (channelId) => {
                        const label = await resolveChannelLabel(channelId);
                        showRefreshStatus(`Fetching new videos from ${label}...`, true);
                    },
                    onChannelComplete: async (info) => {
                        const label = info.channelInfo?.title || await resolveChannelLabel(info.channelId);
                        if (info.addedCount > 0) {
                            showRefreshStatus(`Added ${info.addedCount} new video${info.addedCount === 1 ? '' : 's'} from ${label}`, true);
                            await globalThis.LatestTube.VideoFeed.refresh();
                            await globalThis.LatestTube.Filters.renderFilterChips();
                        } else {
                            showRefreshStatus(`No new videos from ${label}`, true);
                        }
                    }
                });

                if (result.success) {
                    console.log(`App: Background refresh complete - ${result.totalAdded} videos added`);

                    if (result.totalAdded > 0) {
                        showRefreshStatus(`${result.totalAdded} new videos found!`, false, 'success');
                        // Refresh the video feed to show new videos
                        await globalThis.LatestTube.VideoFeed.refresh();
                        // Re-render filter chips in case new tags were added
                        await globalThis.LatestTube.Filters.renderFilterChips();
                    } else {
                        showRefreshStatus('No new videos', false, 'success');
                    }

                    // Hide status after a few seconds
                    setTimeout(() => {
                        hideRefreshStatus();
                    }, 3000);
                } else {
                    console.error('App: Background refresh failed:', result.error);
                    showRefreshStatus('Update failed', false, 'error');
                    setTimeout(() => hideRefreshStatus(), 5000);
                }
            } catch (error) {
                console.error('App: Background refresh error:', error);
                showRefreshStatus('Update failed - check settings', false, 'error');
                setTimeout(() => hideRefreshStatus(), 5000);
            }
        } else {
            // Show when last checked
            const minutesAgo = Math.floor((Date.now() - lastRefresh) / 60000);
            console.log(`App: Last refresh was ${minutesAgo} minutes ago, skipping`);
            showRefreshStatus(`Last checked: ${minutesAgo} min ago`, false, 'success');
            setTimeout(() => hideRefreshStatus(), 3000);
        }
    }

    /**
     * Manual refresh handler with enhanced feedback
     */
    async function handleManualRefresh() {
        if (refreshInProgress || globalThis.LatestTube.FetchService.isRefreshInProgress()) {
            console.log('App: Refresh already in progress');
            return;
        }

        // Check if API key is configured
        const apiKey = await globalThis.LatestTube.DB.settings.get('apiKey');
        if (!apiKey) {
            showToast('Please configure your YouTube API key in settings first.', 'error');
            globalThis.LatestTube.Settings.open();
            return;
        }

        // Check if there are channels to refresh
        const channels = await globalThis.LatestTube.DB.channels.getAll();
        if (channels.length === 0) {
            showToast('No channels added yet. Add channels first.', 'error');
            if (globalThis.LatestTube.Settings?.open) {
                globalThis.LatestTube.Settings.open();
            }
            return;
        }

        refreshInProgress = true;
        refreshBtn.disabled = true;
        refreshBtn.classList.add('refreshing');
        showRefreshStatus('Refreshing videos...', true);

        try {
            const result = await globalThis.LatestTube.FetchService.refreshAllChannels({
                concurrency: 3,
                onChannelStart: async (channelId) => {
                    const label = await resolveChannelLabel(channelId);
                    showRefreshStatus(`Fetching new videos from ${label}...`, true);
                },
                onChannelComplete: async (info) => {
                    const label = info.channelInfo?.title || await resolveChannelLabel(info.channelId);
                    if (info.addedCount > 0) {
                        showRefreshStatus(`Added ${info.addedCount} new video${info.addedCount === 1 ? '' : 's'} from ${label}`, true);
                        await globalThis.LatestTube.VideoFeed.refresh();
                        await globalThis.LatestTube.Filters.renderFilterChips();
                    } else {
                        showRefreshStatus(`No new videos from ${label}`, true);
                    }
                }
            });

            if (result.success) {
                console.log(`App: Manual refresh complete - ${result.totalAdded} videos added (${result.quotaUsed || 0} quota units used this session)`);

                if (result.totalAdded > 0) {
                    showRefreshStatus(`${result.totalAdded} new videos!`, false, 'success');
                    showToast(`${result.totalAdded} new videos added`, 'success');
                    // Refresh the video feed
                    await globalThis.LatestTube.VideoFeed.refresh();
                    // Re-render filter chips
                    await globalThis.LatestTube.Filters.renderFilterChips();
                } else {
                    showRefreshStatus('No new videos', false, 'success');
                    showToast('All videos are up to date', 'success');
                }

                // Log any errors
                const errors = result.results.filter(r => !r.success);
                if (errors.length > 0) {
                    console.warn(`App: ${errors.length} channel(s) had errors:`, errors.map(e => e.error));
                    showToast(`${errors.length} channel(s) failed to refresh`, 'error');
                }

                setTimeout(() => hideRefreshStatus(), 3000);
            } else {
                console.error('App: Refresh failed:', result.error);
                showRefreshStatus('Refresh failed', false, 'error');
                showToast(result.error || 'Refresh failed', 'error');
                setTimeout(() => hideRefreshStatus(), 5000);
            }
        } catch (error) {
            console.error('App: Error during manual refresh:', error);
            showRefreshStatus('Refresh failed', false, 'error');
            showToast(error.message || 'An error occurred during refresh', 'error');
            setTimeout(() => hideRefreshStatus(), 5000);
        } finally {
            refreshInProgress = false;
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('refreshing');
        }
    }

    // ========================================
    // UI Helpers
    // ========================================

    /**
     * Resolve a channel label for status text
     * @param {string} channelId
     * @returns {Promise<string>}
     */
    async function resolveChannelLabel(channelId) {
        try {
            const channel = await globalThis.LatestTube.DB.channels.get(channelId);
            if (channel?.title) {
                return channel.title;
            }
        } catch (error) {
            console.warn('App: Failed to resolve channel label', error);
        }
        return channelId;
    }

    /**
     * Show refresh status in header
     * @param {string} message - Status message
     * @param {boolean} showSpinner - Whether to show spinner
     * @param {string} type - 'normal', 'success', or 'error'
     */
    function showRefreshStatus(message, showSpinner = false, type = 'normal') {
        if (!refreshStatusEl) return;

        // Clear existing content
        refreshStatusEl.textContent = '';

        // Add spinner if needed
        if (showSpinner) {
            const spinner = document.createElement('span');
            spinner.className = 'spinner';
            refreshStatusEl.appendChild(spinner);
        }

        // Add message text
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        refreshStatusEl.appendChild(messageSpan);

        refreshStatusEl.style.display = 'inline-flex';

        // Update class for styling
        refreshStatusEl.classList.remove('success', 'error');
        if (type === 'success') {
            refreshStatusEl.classList.add('success');
        } else if (type === 'error') {
            refreshStatusEl.classList.add('error');
        }
    }

    /**
     * Hide refresh status
     */
    function hideRefreshStatus() {
        if (!refreshStatusEl) return;
        refreshStatusEl.style.display = 'none';
        refreshStatusEl.classList.remove('success', 'error');
    }

    /**
     * Announce status to screen readers
     * @param {string} message - Message to announce
     * @param {string} type - 'polite' or 'assertive'
     */
    function announceStatus(message, type = 'polite') {
        const announcer = document.getElementById('status-announcer');
        if (!announcer) return;

        // Use assertive for errors to interrupt
        if (type === 'assertive') {
            announcer.setAttribute('aria-live', 'assertive');
        } else {
            announcer.setAttribute('aria-live', 'polite');
        }

        announcer.textContent = message;

        // Clear after announcement
        setTimeout(() => {
            announcer.textContent = '';
        }, 1000);
    }

    /**
     * Show toast notification
     * @param {string} message - Message to display
     * @param {string} type - 'normal', 'success', or 'error'
     * @param {number} duration - Duration in milliseconds
     */
    function showToast(message, type = 'normal', duration = 3000) {
        if (!toastEl) return;

        toastEl.textContent = message;
        toastEl.className = 'toast';

        if (type === 'success') {
            toastEl.classList.add('success');
            toastEl.setAttribute('role', 'status');
        } else if (type === 'error') {
            toastEl.classList.add('error');
            toastEl.setAttribute('role', 'alert');
        } else {
            toastEl.setAttribute('role', 'status');
        }

        toastEl.classList.add('visible');

        // Also announce to screen readers
        announceStatus(message, type === 'error' ? 'assertive' : 'polite');

        setTimeout(() => {
            toastEl.classList.remove('visible');
        }, duration);
    }

    // ========================================
    // Event Listeners
    // ========================================

    // Replace refresh button click handler
    if (refreshBtn) {
        // Remove existing listeners by cloning
        const newRefreshBtn = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
        newRefreshBtn.addEventListener('click', handleManualRefresh);
    }

    // ========================================
    // Expose App API
    // ========================================
    globalThis.LatestTube.App = {
        init,
        checkFirstRun,
        showFirstRunUI,
        showWelcomeMessage,
        startBackgroundRefresh,
        showRefreshStatus,
        hideRefreshStatus,
        showToast,
        get initialized() { return initialized; },
        get refreshInProgress() { return refreshInProgress; }
    };
})();
