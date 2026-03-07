// ========================================
// Settings Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    // DOM Elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const modalClose = document.getElementById('modal-close');
    const channelsBtn = document.getElementById('channels-btn');
    const channelsModal = document.getElementById('channels-modal');
    const channelsClose = document.getElementById('channels-close');
    const channelsSearchInput = document.getElementById('channels-search-input');
    const refreshBtn = document.getElementById('refresh-btn');
    const databaseBtn = document.getElementById('database-btn');
    const databaseModal = document.getElementById('database-modal');
    const databaseClose = document.getElementById('database-close');
    const databaseImportInput = document.getElementById('database-import-input');
    const databaseImportStatus = document.getElementById('database-import-status');
    const databaseExportBtn = document.getElementById('database-export-btn');
    const databaseExportStatus = document.getElementById('database-export-status');
    const databaseDeleteBtn = document.getElementById('database-delete-btn');
    const databaseDeleteStatus = document.getElementById('database-delete-status');

    // Confirmation modal elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmClose = document.getElementById('confirm-close');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    let confirmResolve = null;

    // API Key elements
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    const apiKeyStatus = document.getElementById('api-key-status');

    // Shorts duration setting elements
    const shortsDurationInput = document.getElementById('shorts-duration-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const shortsDurationStatus = document.getElementById('shorts-duration-status');

    // Max videos per channel setting elements
    const maxVideosInput = document.getElementById('max-videos-input');
    const maxVideosStatus = document.getElementById('max-videos-status');

    // Info icon and tooltip elements
    const includeShortsInfo = document.getElementById('include-shorts-info');
    const shortsTooltip = document.getElementById('shorts-tooltip');
    const shortsTooltipClose = document.getElementById('shorts-tooltip-close');

    // Channel elements
    const channelList = document.getElementById('channel-list');
    const channelListEmpty = document.getElementById('channel-list-empty');
    const addChannelInput = document.getElementById('add-channel-input');
    const addChannelIncludeShorts = document.getElementById('add-channel-include-shorts');
    const addChannelBtn = document.getElementById('add-channel-btn');
    const addChannelStatus = document.getElementById('add-channel-status');

    // Placeholder thumbnail for channels
    const PLACEHOLDER_THUMBNAIL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIiBmaWxsPSJub25lIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iIzMwMzAzMCIvPjxwYXRoIGQ9Ik0yMCAxNkMyMS4xIDE2IDIyIDE2LjkgMjIgMThWMjJDMjIgMjMuMSAyMS4xIDI0IDIwIDI0QzE4LjkgMjQgMTggMjMuMSAxOCAyMlYxOEMxOCAxNi45IDE4LjkgMTYgMjAgMTZaTTIwIDEyQzE2LjY4NjMgMTIgMTQgMTQuNjg2MyAxNCAxOFYyMkMxNCAyNS4zMTM3IDE2LjY4NjMgMjggMjAgMjhDMjMuMzEzNyAyOCAyNiAyNS4zMTM3IDI2IDIyVjE4QzI2IDE0LjY4NjMgMjMuMzEzNyAxMiAyMCAxMloiIGZpbGw9IiM2NjY2NjYiLz48L3N2Zz4=';

    // Store the element that triggered the modal for focus restoration
    let lastFocusedElement = null;
    let currentModal = null;

    // Use shared debounce utility if available
    const debounce = globalThis.LatestTube.Utils?.debounce || function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    /**
     * Get all focusable elements within a container
     * @param {HTMLElement} container
     * @returns {HTMLElement[]}
     */
    function getFocusableElements(container) {
        const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        return Array.from(container.querySelectorAll(selector)).filter(el => {
            return !el.disabled && el.offsetParent !== null;
        });
    }

    /**
     * Trap focus within the modal
     * @param {KeyboardEvent} e
     */
    function trapFocus(e) {
        if (e.key !== 'Tab' || !currentModal) return;

        const focusableElements = getFocusableElements(currentModal);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements.at(-1);

        if (e.shiftKey) {
            // Shift + Tab: move backwards
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else if (document.activeElement === lastElement) {
            // Tab: move forwards
            e.preventDefault();
            firstElement.focus();
        }
    }

    /**
     * Mark main content as inert/aria-hidden when modal is open
     * @param {boolean} inert
     */
    function setMainContentInert(inert) {
        const mainContent = document.querySelector('main, header, .filter-bar');
        if (mainContent) {
            mainContent.setAttribute('aria-hidden', inert ? 'true' : 'false');
            mainContent.style.pointerEvents = inert ? 'none' : '';
        }
    }

    /**
     * Opens the settings modal and loads data
     */
    function openModal() {
        lastFocusedElement = document.activeElement;
        currentModal = settingsModal;

        // Use native dialog method if available, fallback to class
        if (settingsModal.showModal) {
            settingsModal.showModal();
        } else {
            settingsModal.classList.add('active');
        }
        document.body.style.overflow = 'hidden';
        setMainContentInert(true);

        // Load data when modal opens
        loadApiKey();
        loadShortsDuration();
        loadMaxVideos();

        // Focus first input
        const firstInput = settingsModal.querySelector('input');
        if (firstInput) {
            firstInput.focus();
        }
    }

    /**
     * Opens the channels modal and loads data
     */
    function openChannelsModal() {
        lastFocusedElement = document.activeElement;
        currentModal = channelsModal;

        // Use native dialog method if available, fallback to class
        if (channelsModal.showModal) {
            channelsModal.showModal();
        } else {
            channelsModal.classList.add('active');
        }
        document.body.style.overflow = 'hidden';
        setMainContentInert(true);

        if (channelsSearchInput) {
            channelsSearchInput.value = '';
        }
        loadChannels();

        // Focus search input
        if (channelsSearchInput) {
            channelsSearchInput.focus();
        }
    }

    /**
     * Closes the settings modal
     */
    function closeModal() {
        // Use native dialog method if available, fallback to class
        if (settingsModal.close) {
            settingsModal.close();
        } else {
            settingsModal.classList.remove('active');
        }
        document.body.style.overflow = '';
        setMainContentInert(false);
        clearAllStatusMessages();
        currentModal = null;

        // Restore focus to triggering element
        if (lastFocusedElement) {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    }

    /**
     * Closes the channels modal
     */
    function closeChannelsModal() {
        // Use native dialog method if available, fallback to class
        if (channelsModal.close) {
            channelsModal.close();
        } else {
            channelsModal.classList.remove('active');
        }
        document.body.style.overflow = '';
        setMainContentInert(false);
        currentModal = null;

        // Restore focus to triggering element
        if (lastFocusedElement) {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    }

    /**
     * Opens the database tools modal
     */
    function openDatabaseModal() {
        lastFocusedElement = document.activeElement;
        currentModal = databaseModal;

        // Use native dialog method if available, fallback to class
        if (databaseModal.showModal) {
            databaseModal.showModal();
        } else {
            databaseModal.classList.add('active');
        }
        document.body.style.overflow = 'hidden';
        setMainContentInert(true);
    }

    /**
     * Closes the database tools modal
     */
    function closeDatabaseModal() {
        // Use native dialog method if available, fallback to class
        if (databaseModal.close) {
            databaseModal.close();
        } else {
            databaseModal.classList.remove('active');
        }
        document.body.style.overflow = '';
        setMainContentInert(false);
        hideStatus(databaseImportInput);
        hideStatus(databaseExportStatus);
        hideStatus(databaseDeleteStatus);
        if (databaseImportInput) {
            databaseImportInput.value = '';
        }
        currentModal = null;

        // Restore focus to triggering element
        if (lastFocusedElement) {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    }

    /**
     * Opens the confirmation modal
     * @param {string} title - Modal title
     * @param {string} message - Confirmation message
     * @param {string} confirmText - Text for confirm button (default: 'Confirm')
     * @param {boolean} isDestructive - Whether this is a destructive action (uses danger button style)
     * @returns {Promise<boolean>} - True if confirmed, false if cancelled
     */
    function openConfirmModal(title, message, confirmText = 'Confirm', isDestructive = false) {
        return new Promise((resolve) => {
            confirmResolve = resolve;

            confirmTitle.textContent = title;
            confirmMessage.textContent = message;
            confirmOkBtn.textContent = confirmText;

            if (isDestructive) {
                confirmOkBtn.classList.add('btn-danger');
                confirmOkBtn.classList.remove('btn');
            } else {
                confirmOkBtn.classList.remove('btn-danger');
                confirmOkBtn.classList.add('btn');
            }

            // Use native dialog method if available, fallback to class
            if (confirmModal.showModal) {
                confirmModal.showModal();
            } else {
                confirmModal.classList.add('active');
            }
            document.body.style.overflow = 'hidden';

            // Focus the cancel button for safety
            confirmCancelBtn.focus();
        });
    }

    /**
     * Closes the confirmation modal
     * @param {boolean} result - Result to return to the promise
     */
    function closeConfirmModal(result = false) {
        // Use native dialog method if available, fallback to class
        if (confirmModal.close) {
            confirmModal.close();
        } else {
            confirmModal.classList.remove('active');
        }
        document.body.style.overflow = '';

        if (confirmResolve) {
            confirmResolve(result);
            confirmResolve = null;
        }
    }

    /**
     * Shows a status message
     * @param {HTMLElement} element - Status message element
     * @param {string} message - Message text
     * @param {string} type - 'success' or 'error'
     */
    function showStatus(element, message, type) {
        element.textContent = message;
        element.className = `status-message ${type} visible`;

        // Auto-hide after 3 seconds
        setTimeout(() => {
            hideStatus(element);
        }, 3000);
    }

    /**
     * Hides a status message
     * @param {HTMLElement} element - Status message element
     */
    function hideStatus(element) {
        element.classList.remove('visible');
    }

    /**
     * Clears all status messages
     */
    function clearAllStatusMessages() {
        hideStatus(apiKeyStatus);
        hideStatus(addChannelStatus);
        hideStatus(shortsDurationStatus);
    }

    /**
     * Download a JSON blob as a file
     * @param {Object} payload
     * @param {string} filename
     */
    function downloadJson(payload, filename) {
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    /**
     * Export the entire database to JSON
     */
    async function exportDatabase() {
        try {
            const [settings, channels, videos, channelTags] = await Promise.all([
                globalThis.LatestTube.DB.settings.getAll(),
                globalThis.LatestTube.DB.channels.getAll(),
                globalThis.LatestTube.DB.videos.getAll(),
                globalThis.LatestTube.DB.tags.getAll()
            ]);

            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                data: {
                    settings,
                    channels,
                    videos,
                    channelTags
                }
            };

            const filename = `latesttube-backup-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
            downloadJson(payload, filename);
            showStatus(databaseExportStatus, 'Database exported successfully.', 'success');
        } catch (error) {
            console.error('Database: Export failed', error);
            showStatus(databaseExportStatus, 'Failed to export database.', 'error');
        }
    }

    /**
     * Import settings into database
     * @param {Array} settings
     */
    async function importSettings(settings) {
        if (Array.isArray(settings)) {
            for (const item of settings) {
                if (item?.key !== undefined) {
                    await globalThis.LatestTube.DB.settings.set(item.key, item.value);
                }
            }
        }
    }

    /**
     * Import channels into database
     * @param {Array} channels
     */
    async function importChannels(channels) {
        if (Array.isArray(channels)) {
            for (const channel of channels) {
                await globalThis.LatestTube.DB.channels.add(channel);
            }
        }
    }

    /**
     * Import videos into database
     * @param {Array} videos
     */
    async function importVideos(videos) {
        if (Array.isArray(videos)) {
            for (const video of videos) {
                await globalThis.LatestTube.DB.videos.add(video);
            }
        }
    }

    /**
     * Import tags into database
     * @param {Array} channelTags
     */
    async function importTags(channelTags) {
        if (Array.isArray(channelTags)) {
            for (const tagEntry of channelTags) {
                if (tagEntry?.channelId && tagEntry?.tag) {
                    await globalThis.LatestTube.DB.tags.add(tagEntry.channelId, tagEntry.tag);
                }
            }
        }
    }

    /**
     * Refresh UI components after database import
     */
    async function refreshAfterImport() {
        await globalThis.LatestTube.VideoFeed?.refresh?.();
        await globalThis.LatestTube.Filters?.renderFilterChips?.();
    }

    /**
     * Import database from JSON file
     */
    async function importDatabase(file) {
        if (!file) return;
        try {
            const text = await file.text();
            const payload = JSON.parse(text);

            if (!payload?.data) {
                showStatus(databaseImportStatus, 'Invalid backup file format.', 'error');
                return;
            }

            const { settings, channels, videos, channelTags } = payload.data;

            const confirmed = await openConfirmModal(
                'Confirm Import',
                'Importing will replace the current database with the backup data. This action cannot be undone.',
                'Import',
                true
            );
            if (!confirmed) return;

            await globalThis.LatestTube.DB.resetDatabase();
            await importSettings(settings);
            await importChannels(channels);
            await importVideos(videos);
            await importTags(channelTags);
            await refreshAfterImport();

            showStatus(databaseImportStatus, 'Database imported successfully.', 'success');
        } catch (error) {
            console.error('Database: Import failed', error);
            showStatus(databaseImportStatus, 'Failed to import database.', 'error');
        } finally {
            if (databaseImportInput) {
                databaseImportInput.value = '';
            }
        }
    }

    /**
     * Delete the entire database with confirmation
     */
    async function deleteDatabase() {
        const confirmed = await openConfirmModal(
            'Delete Database',
            'Delete all database data? This will remove all channels, videos, and tags. This action cannot be undone.',
            'Delete',
            true
        );
        if (!confirmed) return;
        try {
            await globalThis.LatestTube.DB.resetDatabase();
            showStatus(databaseDeleteStatus, 'Database deleted successfully.', 'success');
            
            // Close modals
            closeConfirmModal(false);
            closeDatabaseModal();
            
            // Refresh the UI to show empty state
            await globalThis.LatestTube.VideoFeed?.refresh?.();
            await globalThis.LatestTube.Filters?.renderFilterChips?.();
            
            // Show first-run UI if needed
            const apiKey = await globalThis.LatestTube.DB.settings.get('apiKey');
            const channels = await globalThis.LatestTube.DB.channels.getAll();
            
            if (!apiKey && channels.length === 0) {
                globalThis.LatestTube.VideoFeed?.renderEmptyState?.(
                    'To get started, please add your YouTube Data API v3 key in settings.\nDon\'t have one? Get it free from Google Cloud Console.',
                    'Welcome to LatestTube!'
                );
                settingsBtn?.classList?.add('pulse');
                setTimeout(() => {
                    globalThis.LatestTube.Settings?.open?.();
                }, 500);
            } else if (!apiKey) {
                globalThis.LatestTube.VideoFeed?.renderEmptyState?.(
                    'To get started, please add your YouTube Data API v3 key in settings.\nDon\'t have one? Get it free from Google Cloud Console.',
                    'Welcome to LatestTube!'
                );
                settingsBtn?.classList?.add('pulse');
                setTimeout(() => {
                    globalThis.LatestTube.Settings?.open?.();
                }, 500);
            } else if (channels.length === 0) {
                globalThis.LatestTube.VideoFeed?.renderEmptyState?.(
                    'You have an API key configured. Now add your favorite YouTube channels to start tracking videos!',
                    'Add Your First Channel'
                );
                settingsBtn?.classList?.add('pulse');
            }
        } catch (error) {
            console.error('Database: Delete failed', error);
            showStatus(databaseDeleteStatus, 'Failed to delete database.', 'error');
        }
    }

    // ========================================
    // API Key Management
    // ========================================

    /**
     * Loads saved API key from IndexedDB
     */
    async function loadApiKey() {
        try {
            const apiKey = await globalThis.LatestTube.DB.settings.get('apiKey');
            if (apiKey) {
                apiKeyInput.value = apiKey;
            } else {
                apiKeyInput.value = '';
            }
        } catch (error) {
            console.error('Settings: Error loading API key', error);
        }
    }

    /**
     * Saves API key to IndexedDB
     */
    async function saveApiKey() {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showStatus(apiKeyStatus, 'Please enter an API key', 'error');
            return;
        }

        try {
            await globalThis.LatestTube.DB.settings.set('apiKey', apiKey);
            showStatus(apiKeyStatus, 'API key saved successfully!', 'success');
        } catch (error) {
            console.error('Settings: Error saving API key', error);
            showStatus(apiKeyStatus, 'Failed to save API key', 'error');
        }
    }

    /**
     * Loads shorts duration threshold from IndexedDB
     */
    async function loadShortsDuration() {
        try {
            const duration = await globalThis.LatestTube.DB.settings.get('shortsDuration');
            if (duration !== undefined && duration !== null) {
                shortsDurationInput.value = duration;
            } else {
                shortsDurationInput.value = '60'; // Default value
            }
        } catch (error) {
            console.error('Settings: Error loading shorts duration', error);
            shortsDurationInput.value = '60';
        }
    }

    /**
     * Loads max videos per channel setting from IndexedDB
     */
    async function loadMaxVideos() {
        try {
            const maxVideos = await globalThis.LatestTube.DB.settings.get('maxVideosPerChannel');
            if (maxVideos !== undefined && maxVideos !== null && !Number.isNaN(maxVideos)) {
                maxVideosInput.value = maxVideos;
            } else {
                maxVideosInput.value = '10'; // Default value
            }
        } catch (error) {
            console.error('Settings: Error loading max videos setting', error);
            maxVideosInput.value = '10';
        }
    }

    /**
     * Saves all settings (API key, shorts duration, and max videos per channel)
     */
    async function saveSettings() {
        try {
            // Save API key first (this also validates)
            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                showStatus(apiKeyStatus, 'Please enter an API key', 'error');
                return; // Don't close modal if API key is missing
            }

            const duration = Number.parseInt(shortsDurationInput.value, 10);
            if (Number.isNaN(duration) || duration < 1 || duration > 3600) {
                showStatus(shortsDurationStatus, 'Please enter a valid duration (1-3600 seconds)', 'error');
                return; // Don't close if duration is invalid
            }

            const maxVideos = Number.parseInt(maxVideosInput.value, 10);
            if (Number.isNaN(maxVideos) || maxVideos < 1 || maxVideos > 50) {
                showStatus(maxVideosStatus, 'Please enter a valid number (1-50)', 'error');
                return; // Don't close if maxVideos is invalid
            }

            // Save all settings
            await globalThis.LatestTube.DB.settings.set('apiKey', apiKey);
            await globalThis.LatestTube.DB.settings.set('shortsDuration', duration);
            await globalThis.LatestTube.DB.settings.set('maxVideosPerChannel', maxVideos);

            // Remove pulse notification from settings button after successful save
            const settingsBtn = document.getElementById('settings-btn');
            if (settingsBtn) {
                settingsBtn.classList.remove('pulse');
            }

            // Close the settings modal after successful save
            closeModal();
        } catch (error) {
            console.error('saveSettings: Error saving settings:', error);
            showStatus(apiKeyStatus, 'Failed to save settings', 'error');
        }
    }

    /**
     * Shows the shorts tooltip overlay
     */
    function showShortsTooltip() {
        if (shortsTooltip) {
            shortsTooltip.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Hides the shorts tooltip overlay
     */
    function hideShortsTooltip() {
        if (shortsTooltip) {
            shortsTooltip.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // ========================================
    // Channel Management
    // ========================================

    /**
     * Loads and displays all channels from IndexedDB
     */
    async function loadChannels() {
        try {
            const channels = await globalThis.LatestTube.DB.channels.getAll();
            renderChannelList(channels);
        } catch (error) {
            console.error('Settings: Error loading channels', error);
        }
    }

    /**
     * Renders the channel list
     * @param {Array} channels - Array of channel objects
     */
    function renderChannelList(channels) {
        // Clear existing items
        const existingItems = channelList.querySelectorAll('.channel-item');
        existingItems.forEach(item => item.remove());

        const query = channelsSearchInput ? channelsSearchInput.value.trim().toLowerCase() : '';
        const sortedChannels = [...channels].sort((a, b) => {
            const nameA = (a.title || a.channelId || '').toLowerCase();
            const nameB = (b.title || b.channelId || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        const filteredChannels = query
            ? sortedChannels.filter(channel => {
                const title = (channel.title || '').toLowerCase();
                const id = (channel.channelId || '').toLowerCase();
                return title.includes(query) || id.includes(query);
            })
            : sortedChannels;

        if (channels.length === 0) {
            channelListEmpty.style.display = 'block';
            return;
        }

        if (filteredChannels.length === 0) {
            channelListEmpty.textContent = 'No channels match your search.';
            channelListEmpty.style.display = 'block';
            return;
        }

        channelListEmpty.textContent = 'No channels added yet.';
        channelListEmpty.style.display = 'none';

        filteredChannels.forEach(channel => {
            const channelItem = createChannelItem(channel);
            channelList.appendChild(channelItem);
        });
    }

    /**
     * Creates a channel item element
     * @param {Object} channel - Channel object
     * @returns {HTMLElement}
     */
    function createChannelItem(channel) {
        const item = document.createElement('div');
        item.className = 'channel-item';
        item.dataset.channelId = channel.channelId;

        const thumbnail = document.createElement('img');
        thumbnail.className = 'channel-thumbnail';
        thumbnail.src = channel.thumbnail || PLACEHOLDER_THUMBNAIL;
        thumbnail.alt = '';
        thumbnail.onerror = () => {
            thumbnail.src = PLACEHOLDER_THUMBNAIL;
        };

        const info = document.createElement('div');
        info.className = 'channel-info';

        const title = document.createElement('div');
        title.className = 'channel-title';
        title.textContent = channel.title || 'Loading...';
        title.title = channel.title || channel.channelId;

        const id = document.createElement('div');
        id.className = 'channel-id';
        id.textContent = channel.channelId;

        info.appendChild(title);
        info.appendChild(id);

        const includeShortsLabel = document.createElement('label');
        includeShortsLabel.className = 'checkbox-wrapper compact channel-include-shorts';

        const includeShortsInput = document.createElement('input');
        includeShortsInput.type = 'checkbox';
        includeShortsInput.checked = channel.includeShorts !== false;
        includeShortsInput.setAttribute('aria-label', `Include shorts for ${channel.title || channel.channelId}`);
        includeShortsInput.addEventListener('change', async (event) => {
            try {
                const updated = {
                    ...channel,
                    includeShorts: event.target.checked
                };
                await globalThis.LatestTube.DB.channels.update(updated);
                channel.includeShorts = updated.includeShorts;
                await globalThis.LatestTube.VideoFeed?.refresh?.();
            } catch (error) {
                console.error('Settings: Error updating include shorts', error);
                event.target.checked = channel.includeShorts !== false;
                showStatus(addChannelStatus, 'Failed to update channel settings', 'error');
            }
        });

        const includeShortsText = document.createElement('span');
        includeShortsText.textContent = 'Include shorts';

        includeShortsLabel.appendChild(includeShortsInput);
        includeShortsLabel.appendChild(includeShortsText);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'channel-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete channel';
        deleteBtn.setAttribute('aria-label', `Delete channel ${channel.title || channel.channelId}`);
        deleteBtn.addEventListener('click', () => deleteChannel(channel.channelId));

        item.appendChild(thumbnail);
        item.appendChild(info);
        item.appendChild(includeShortsLabel);
        item.appendChild(deleteBtn);

        return item;
    }

    /**
     * Strict allowlist of valid YouTube hostnames
     */
    const YOUTUBE_HOST_ALLOWLIST = new Set([
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'youtu.be'
    ]);

    /**
     * Normalizes hostname by removing trailing dot and converting to lowercase
     * @param {string} hostname
     * @returns {string}
     */
    function normalizeHostname(hostname) {
        return hostname.toLowerCase().replace(/\.$/, '');
    }

    /**
     * Validates if a hostname is in the YouTube allowlist
     * @param {string} hostname
     * @returns {boolean}
     */
    function isValidYouTubeHost(hostname) {
        const normalized = normalizeHostname(hostname);
        return YOUTUBE_HOST_ALLOWLIST.has(normalized);
    }

    /**
     * Parses YouTube channel URL to extract channel ID or handle
     * @param {string} url - YouTube channel URL or bare ID
     * @returns {Object|null} - { type: 'id'|'handle', value: string } or null if invalid
     */
    function parseChannelUrl(url) {
        const trimmed = url.trim();

        if (!trimmed) return null;

        // Check if it's a bare channel ID (starts with UC)
        if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
            return { type: 'id', value: trimmed };
        }

        // Check if it's a bare handle (starts with @)
        if (/^@[a-zA-Z0-9_.-]+$/.test(trimmed)) {
            return { type: 'handle', value: trimmed };
        }

        try {
            const urlObj = new URL(trimmed);

            // Strict host validation against allowlist
            // This prevents lookalike domains like youtube.com.evil.com
            if (!isValidYouTubeHost(urlObj.hostname)) {
                console.warn('parseChannelUrl: Rejected invalid hostname:', urlObj.hostname);
                return null;
            }

            const path = urlObj.pathname;

            // Pattern: /channel/UCxxxx
            const channelRegex = /\/channel\/(UC[a-zA-Z0-9_-]{22})/;
            const channelMatch = channelRegex.exec(path);
            if (channelMatch) {
                return { type: 'id', value: channelMatch[1] };
            }

            // Pattern: /@Handle
            const handleRegex = /\/(@[a-zA-Z0-9_.-]+)/;
            const handleMatch = handleRegex.exec(path);
            if (handleMatch) {
                return { type: 'handle', value: handleMatch[1] };
            }

            // Pattern: /c/ChannelName or /user/Username (store as-is for now)
            const customRegex = /\/(c|user)\/([a-zA-Z0-9_.-]+)/;
            const customMatch = customRegex.exec(path);
            if (customMatch) {
                return { type: 'handle', value: `@${customMatch[2]}` };
            }

            return null;
        } catch (e) {
            // Invalid URL - log for debugging
            console.warn('parseChannelUrl: Invalid URL', e);
            return null;
        }
    }

    // Expose for testing
    globalThis.LatestTube.parseChannelUrl = parseChannelUrl;
    globalThis.LatestTube.isValidYouTubeHost = isValidYouTubeHost;

    /**
     * Adds a new channel from the input and fetches real channel data
     */
    async function addChannel() {
        const input = addChannelInput.value.trim();

        if (!input) {
            showStatus(addChannelStatus, 'Please enter a channel URL or ID', 'error');
            return;
        }

        const parsed = parseChannelUrl(input);

        if (!parsed) {
            showStatus(addChannelStatus, 'Invalid YouTube channel URL or ID', 'error');
            return;
        }

        // Check if API key is configured
        const apiKey = await globalThis.LatestTube.DB.settings.get('apiKey');
        if (!apiKey) {
            showStatus(addChannelStatus, 'Please configure your YouTube API key first', 'error');
            return;
        }

        const channelId = parsed.value;
        const includeShorts = addChannelIncludeShorts ? addChannelIncludeShorts.checked : true;

        // Check if channel already exists
        try {
            const existing = await globalThis.LatestTube.DB.channels.get(channelId);
            if (existing) {
                showStatus(addChannelStatus, 'Channel already added', 'error');
                return;
            }
        } catch (error) {
            console.error('Settings: Error checking existing channel', error);
        }

        // Disable button during fetch
        addChannelBtn.disabled = true;
        addChannelBtn.textContent = 'Adding...';

        try {
            // Fetch real channel info and videos from YouTube API
            console.log(`Settings: Fetching channel info for ${channelId}`);
            showStatus(addChannelStatus, 'Fetching channel info...', 'success');

            const result = await globalThis.LatestTube.FetchService.refreshChannel(channelId, { includeShorts });

            if (result.success) {
                // Clear input and refresh list
                addChannelInput.value = '';
                await loadChannels();

                // Refresh video feed to show new videos
                await globalThis.LatestTube.VideoFeed.refresh();

                showStatus(addChannelStatus, `Channel added! Fetched ${result.addedCount} videos.`, 'success');
                console.log(`Settings: Channel ${result.channelInfo.title} added with ${result.addedCount} videos`);
            } else {
                showStatus(addChannelStatus, 'Failed to fetch channel data', 'error');
            }
        } catch (error) {
            console.error('Settings: Error adding channel', error);

            // Provide user-friendly error messages
            let errorMessage = 'Failed to add channel';
            if (error.message.includes('quota exceeded')) {
                errorMessage = 'YouTube API quota exceeded. Please try again later.';
            } else if (error.message.includes('API key')) {
                errorMessage = 'Invalid API key. Please check your settings.';
            } else if (error.message.includes('not found')) {
                errorMessage = 'Channel not found. Please check the channel ID.';
            } else if (error.status === 404) {
                errorMessage = 'Channel not found. Please check the channel ID.';
            }

            showStatus(addChannelStatus, errorMessage, 'error');
        } finally {
            // Re-enable button
            addChannelBtn.disabled = false;
            addChannelBtn.textContent = 'Add';
        }
    }

    /**
     * Deletes a channel after confirmation
     * @param {string} channelId - Channel ID to delete
     */
    async function deleteChannel(channelId) {
        const confirmed = await openConfirmModal(
            'Remove Channel',
            `Are you sure you want to remove this channel?\n\nThis will also delete all associated videos and tags.`,
            'Remove',
            true
        );
        if (!confirmed) return;

        try {
            // Delete associated videos first
            const videos = await globalThis.LatestTube.DB.videos.getByChannel(channelId);
            for (const video of videos) {
                await globalThis.LatestTube.DB.videos.delete(video.videoId);
            }

            // Delete channel tags
            const tags = await globalThis.LatestTube.DB.tags.getByChannel(channelId);
            for (const tag of tags) {
                await globalThis.LatestTube.DB.tags.remove(channelId, tag);
            }

            // Delete the channel
            await globalThis.LatestTube.DB.channels.delete(channelId);

            // Refresh list
            await loadChannels();
        } catch (error) {
            console.error('Settings: Error deleting channel', error);
            showStatus(addChannelStatus, 'Failed to delete channel', 'error');
        }
    }

    // ========================================
    // Event Listeners
    // ========================================

    settingsBtn.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);
    channelsBtn.addEventListener('click', openChannelsModal);
    channelsClose.addEventListener('click', closeChannelsModal);
    databaseBtn.addEventListener('click', openDatabaseModal);
    databaseClose.addEventListener('click', closeDatabaseModal);

    // Confirmation modal event listeners
    confirmClose.addEventListener('click', () => closeConfirmModal(false));
    confirmCancelBtn.addEventListener('click', () => closeConfirmModal(false));
    confirmOkBtn.addEventListener('click', () => closeConfirmModal(true));
    // Note: Backdrop click removed - confirmation modal only closes via buttons

    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', saveApiKey);
    }
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }
    if (addChannelBtn) {
        addChannelBtn.addEventListener('click', addChannel);
    }

    // Tooltip event listeners
    if (includeShortsInfo && shortsTooltip) {
        includeShortsInfo.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showShortsTooltip();
        });
        // Keyboard support for accessibility
        includeShortsInfo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showShortsTooltip();
            }
        });
    }

    if (shortsTooltipClose) {
        shortsTooltipClose.addEventListener('click', hideShortsTooltip);
    }

    if (shortsTooltip) {
        shortsTooltip.addEventListener('click', (e) => {
            if (e.target === shortsTooltip) {
                hideShortsTooltip();
            }
        });
    }

    // Escape key to close tooltip
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && shortsTooltip?.classList.contains('active')) {
            hideShortsTooltip();
        }
    });
    if (databaseExportBtn) {
        databaseExportBtn.addEventListener('click', exportDatabase);
    }
    if (databaseDeleteBtn) {
        databaseDeleteBtn.addEventListener('click', deleteDatabase);
    }
    if (databaseImportInput) {
        databaseImportInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                importDatabase(file);
            }
        });
    }

    // Enter key on API key input saves
    if (apiKeyInput) {
        apiKeyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveApiKey();
            }
        });
    }

    // Enter key on channel input adds channel
    if (addChannelInput) {
        addChannelInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addChannel();
            }
        });
    }

    // Note: Backdrop click to close has been removed as per user preference
    // Modals now only close via the close button or Escape key

    if (channelsSearchInput) {
        channelsSearchInput.addEventListener('input', debounce(async () => {
            await loadChannels();
        }, 200));
    }

    // Close modal on Escape key and trap focus within modal
    document.addEventListener('keydown', function(event) {
        // Handle Escape key for closing modals (only for non-dialog fallback)
        if (event.key === 'Escape') {
            const isSettingsOpen = settingsModal.open || settingsModal.classList.contains('active');
            const isChannelsOpen = channelsModal.open || channelsModal.classList.contains('active');
            const isDatabaseOpen = databaseModal.open || databaseModal.classList.contains('active');

            if (isSettingsOpen && !settingsModal.open) {
                closeModal();
            }
            if (isChannelsOpen && !channelsModal.open) {
                closeChannelsModal();
            }
            if (isDatabaseOpen && !databaseModal.open) {
                closeDatabaseModal();
            }
        }

        // Handle Tab key for focus trap
        if (event.key === 'Tab') {
            trapFocus(event);
        }
    });

    /**
     * Validates prerequisites for refresh (API key and channels exist)
     * @returns {Promise<{valid: boolean, reason: string}>}
     */
    async function validateRefreshPrerequisites() {
        const apiKey = await globalThis.LatestTube.DB.settings.get('apiKey');
        if (!apiKey) {
            return { valid: false, reason: 'apiKey' };
        }

        const channels = await globalThis.LatestTube.DB.channels.getAll();
        if (channels.length === 0) {
            return { valid: false, reason: 'noChannels' };
        }

        return { valid: true, reason: '', channels };
    }

    /**
     * Sets refresh button to loading state
     */
    function setRefreshLoadingState() {
        refreshBtn.classList.add('refreshing');
        refreshBtn.style.animation = 'spin 1s linear infinite';
        refreshBtn.title = 'Refreshing...';
    }

    /**
     * Clears refresh button loading state
     */
    function clearRefreshLoadingState() {
        refreshBtn.classList.remove('refreshing');
        refreshBtn.style.animation = '';
        refreshBtn.title = 'Refresh videos';
    }

    /**
     * Shows toast notification
     * @param {string} message
     * @param {string} type
     */
    function showRefreshToast(message, type) {
        if (globalThis.LatestTube.App?.showToast) {
            globalThis.LatestTube.App.showToast(message, type, 5000);
        }
    }

    /**
     * Logs refresh results to console
     * @param {Object} result
     */
    function logRefreshResults(result) {
        console.log(`Refresh complete: ${result.totalAdded} videos added, ${result.totalSkipped} skipped`);

        if (result.totalAdded > 0) {
            console.log(`✓ Added ${result.totalAdded} new videos`);
        }
        if (result.totalSkipped > 0) {
            console.log(`✓ Skipped ${result.totalSkipped} existing videos`);
        }

        const errors = result.results.filter(r => !r.success);
        if (errors.length > 0) {
            console.warn(`⚠ ${errors.length} channel(s) had errors:`, errors.map(e => e.error));
        }
    }

    /**
     * Handles the refresh button click
     */
    async function handleRefreshClick() {
        if (globalThis.LatestTube.FetchService.isRefreshInProgress()) {
            console.log('Refresh already in progress');
            return;
        }

        const validation = await validateRefreshPrerequisites();
        if (!validation.valid) {
            console.error('Refresh: Prerequisites not met');
            if (validation.reason === 'apiKey') {
                showRefreshToast('Please configure your YouTube API key in settings first.', 'error');
                openModal();
            } else if (validation.reason === 'noChannels') {
                showRefreshToast('No channels added yet. Add channels to start tracking.', 'error');
                openChannelsModal();
            }
            return;
        }

        console.log(`Refresh: Starting refresh for ${validation.channels.length} channels...`);
        setRefreshLoadingState();

        try {
            const result = await globalThis.LatestTube.FetchService.refreshAllChannels();

            if (result.success) {
                logRefreshResults(result);
                await globalThis.LatestTube.VideoFeed.refresh();
            } else {
                console.error('Refresh failed:', result.error || result.message);
            }
        } catch (error) {
            console.error('Refresh: Error during refresh', error);
        } finally {
            clearRefreshLoadingState();
        }
    }

    // Refresh button - triggers video fetch for all channels
    refreshBtn.addEventListener('click', handleRefreshClick);

    // Expose functions globally
    globalThis.LatestTube.Settings = {
        open: openModal,
        close: closeModal,
        loadApiKey,
        loadChannels,
        addChannel,
        deleteChannel
    };
})();
