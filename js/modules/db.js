// ========================================
// IndexedDB Database Layer
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    const DB_NAME = 'LatestTubeDB';
    const DB_VERSION = 3;

    // Store names
    const STORES = {
        SETTINGS: 'settings',
        CHANNELS: 'channels',
        VIDEOS: 'videos',
        CHANNEL_TAGS: 'channelTags'
    };

    // Database instance
    let dbInstance = null;

    // ========================================
    // Database Initialization
    // ========================================

    /**
     * Handle database version change event
     */
    function handleVersionChange() {
        console.warn('IndexedDB: Version change detected, closing database');
        dbInstance.close();
    }

    /**
     * Check if all required stores exist in the database
     * @param {IDBDatabase} db
     * @returns {boolean}
     */
    function hasAllRequiredStores(db) {
        const requiredStores = [
            STORES.SETTINGS,
            STORES.CHANNELS,
            STORES.VIDEOS,
            STORES.CHANNEL_TAGS
        ];
        return requiredStores.every(store => db.objectStoreNames.contains(store));
    }

    /**
     * Repair database by bumping version to recreate missing stores
     * @param {number} currentVersion
     * @param {Function} resolve
     * @param {Function} reject
     */
    function repairDatabase(currentVersion, resolve, reject) {
        dbInstance.close();
        dbInstance = null;

        const repairRequest = indexedDB.open(DB_NAME, currentVersion + 1);

        repairRequest.onupgradeneeded = (event) => {
            const db = event.target.result;
            const transaction = event.target.transaction;
            console.log('IndexedDB: Repair upgrade to version', db.version);
            createSchema(db, transaction);
        };

        repairRequest.onsuccess = () => {
            dbInstance = repairRequest.result;
            console.log('IndexedDB: Repair complete');
            resolve(dbInstance);
        };

        repairRequest.onerror = () => {
            console.error('IndexedDB: Repair failed', repairRequest.error);
            reject(repairRequest.error);
        };

        repairRequest.onblocked = () => {
            console.warn('IndexedDB: Repair blocked; close other tabs and reload');
            reject(new Error('Database repair blocked'));
        };
    }

    /**
     * Initialize the IndexedDB database
     * @returns {Promise<IDBDatabase>}
     */
    function init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB: Failed to open database');
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn('IndexedDB: Open blocked - close other tabs using this app');
                reject(new Error('Database open blocked'));
            };

            request.onsuccess = () => {
                dbInstance = request.result;
                dbInstance.onversionchange = handleVersionChange;

                if (!hasAllRequiredStores(dbInstance)) {
                    console.warn('IndexedDB: Missing stores detected; repairing database via version bump');
                    const currentVersion = dbInstance.version || DB_VERSION;
                    repairDatabase(currentVersion, resolve, reject);
                    return;
                }

                console.log('IndexedDB: Database opened successfully');
                resolve(dbInstance);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const transaction = event.target.transaction;
                console.log('IndexedDB: Upgrading database to version', DB_VERSION);
                createSchema(db, transaction);
            };
        });
    }

    /**
     * Ensure database is initialized before operations
     * @returns {Promise<IDBDatabase>}
     */
    function ensureDb() {
        if (dbInstance) {
            return Promise.resolve(dbInstance);
        }
        return init();
    }

    /**
     * Process migrated entries and add to channelTags store
     * @param {Array} entries
     * @param {Map} videoIdToChannelId
     * @param {IDBObjectStore} channelTagsStore
     */
    function processMigratedEntries(entries, videoIdToChannelId, channelTagsStore) {
        const seen = new Set();
        for (const entry of entries) {
            const channelId = videoIdToChannelId.get(entry.videoId);
            if (!channelId) continue;
            const key = `${channelId}::${entry.tag}`;
            if (seen.has(key)) continue;
            seen.add(key);
            channelTagsStore.add({ channelId, tag: entry.tag });
        }
        console.log('IndexedDB: Migrated videoTags to channelTags');
    }

    /**
     * Handle video lookup result during migration
     * @param {Object} video
     * @param {string} videoId
     * @param {Map} videoIdToChannelId
     * @param {Object} pendingLookups
     * @param {Array} entries
     * @param {IDBObjectStore} channelTagsStore
     */
    function handleVideoLookupResult(video, videoId, videoIdToChannelId, pendingLookups, entries, channelTagsStore) {
        if (video?.channelId) {
            videoIdToChannelId.set(videoId, video.channelId);
        }
        pendingLookups.count -= 1;
        if (pendingLookups.count === 0) {
            processMigratedEntries(entries, videoIdToChannelId, channelTagsStore);
        }
    }

    /**
     * Extract unique video IDs from entries
     * @param {Array} entries
     * @returns {string[]}
     */
    function extractVideoIds(entries) {
        const ids = new Set();
        for (const entry of entries) {
            ids.add(entry.videoId);
        }
        return [...ids];
    }

    /**
     * Migrate videoTags to channelTags
     * @param {IDBTransaction} transaction
     * @param {IDBDatabase} db
     */
    function migrateVideoTags(transaction, db) {
        if (!transaction || !db.objectStoreNames.contains('videoTags') || !db.objectStoreNames.contains(STORES.CHANNEL_TAGS)) {
            return;
        }

        try {
            const videoTagsStore = transaction.objectStore('videoTags');
            const videosStore = transaction.objectStore(STORES.VIDEOS);
            const channelTagsStore = transaction.objectStore(STORES.CHANNEL_TAGS);

            videoTagsStore.getAll().onsuccess = (event) => {
                const entries = event.target.result || [];
                const videoIds = extractVideoIds(entries);
                const videoIdToChannelId = new Map();

                if (videoIds.length === 0) {
                    return;
                }

                const pendingLookups = { count: videoIds.length };
                for (const videoId of videoIds) {
                    videosStore.get(videoId).onsuccess = (videoEvent) => {
                        const video = videoEvent.target.result;
                        handleVideoLookupResult(video, videoId, videoIdToChannelId, pendingLookups, entries, channelTagsStore);
                    };
                }
            };
        } catch (error) {
            console.warn('IndexedDB: Failed to migrate videoTags to channelTags', error);
        }
    }

    /**
     * Create the database schema (object stores and indexes)
     * @param {IDBDatabase} db
     */
    function createSchema(db, transaction) {
        // Settings store - key/value pairs
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
            db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
            console.log('IndexedDB: Created settings store');
        }

        // Channels store
        if (!db.objectStoreNames.contains(STORES.CHANNELS)) {
            db.createObjectStore(STORES.CHANNELS, { keyPath: 'channelId' });
            console.log('IndexedDB: Created channels store');
        }

        // Videos store
        if (!db.objectStoreNames.contains(STORES.VIDEOS)) {
            const videosStore = db.createObjectStore(STORES.VIDEOS, { keyPath: 'videoId' });
            videosStore.createIndex('channelId', 'channelId', { unique: false });
            console.log('IndexedDB: Created videos store with channelId index');
        }

        // ChannelTags store
        if (!db.objectStoreNames.contains(STORES.CHANNEL_TAGS)) {
            const tagsStore = db.createObjectStore(STORES.CHANNEL_TAGS, {
                keyPath: 'id',
                autoIncrement: true
            });
            tagsStore.createIndex('channelId', 'channelId', { unique: false });
            tagsStore.createIndex('tag', 'tag', { unique: false });
            console.log('IndexedDB: Created channelTags store with indexes');
        }

        migrateVideoTags(transaction, db);
    }

    /**
     * Close the database connection
     */
    function close() {
        if (dbInstance) {
            dbInstance.close();
            dbInstance = null;
            console.log('IndexedDB: Database connection closed');
        }
    }

    /**
     * Reinitialize database after deletion
     * @param {Function} resolve
     * @param {Function} reject
     */
    function reinitializeAfterDelete(resolve, reject) {
        dbInstance = null;
        init().then(() => resolve()).catch(reject);
    }

    /**
     * Reset database by deleting and re-initializing schema
     * @returns {Promise<void>}
     */
    function resetDatabase() {
        return new Promise((resolve, reject) => {
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);

            deleteRequest.onerror = () => {
                console.error('IndexedDB: Failed to delete database', deleteRequest.error);
                reject(deleteRequest.error);
            };

            deleteRequest.onblocked = () => {
                console.warn('IndexedDB: Delete blocked - close other tabs using this app');
                reject(new Error('Database delete blocked'));
            };

            deleteRequest.onsuccess = () => reinitializeAfterDelete(resolve, reject);
        });
    }

    // ========================================
    // Settings Operations
    // ========================================

    const settings = {
        /**
         * Get a setting value by key
         * @param {string} key
         * @returns {Promise<any>}
         */
        get(key) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => settings.get(key)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.SETTINGS], 'readonly');
                const store = transaction.objectStore(STORES.SETTINGS);
                const request = store.get(key);

                request.onerror = () => {
                    console.error('IndexedDB: Error getting setting', key, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve(request.result ? request.result.value : undefined);
                };
            });
        },

        /**
         * Set a setting value
         * @param {string} key
         * @param {any} value
         * @returns {Promise<void>}
         */
        set(key, value) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => settings.set(key, value)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.SETTINGS], 'readwrite');
                const store = transaction.objectStore(STORES.SETTINGS);
                const request = store.put({ key, value });

                request.onerror = () => {
                    console.error('IndexedDB: Error setting setting', key, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        },

        /**
         * Delete a setting by key
         * @param {string} key
         * @returns {Promise<void>}
         */
        delete(key) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => settings.delete(key)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.SETTINGS], 'readwrite');
                const store = transaction.objectStore(STORES.SETTINGS);
                const request = store.delete(key);

                request.onerror = () => {
                    console.error('IndexedDB: Error deleting setting', key, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        },

        /**
         * Get all settings
         * @returns {Promise<Array>}
         */
        getAll() {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => settings.getAll()).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.SETTINGS], 'readonly');
                const store = transaction.objectStore(STORES.SETTINGS);
                const request = store.getAll();

                request.onerror = () => {
                    console.error('IndexedDB: Error getting all settings', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve(request.result || []);
                };
            });
        }
    };

    // ========================================
    // Channels Operations
    // ========================================

    const channels = {
        /**
         * Get all channels
         * @returns {Promise<Array>}
         */
        getAll() {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => channels.getAll()).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNELS], 'readonly');
                const store = transaction.objectStore(STORES.CHANNELS);
                const request = store.getAll();

                request.onerror = () => {
                    console.error('IndexedDB: Error getting all channels', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve(request.result);
                };
            });
        },

        /**
         * Get a channel by ID
         * @param {string} channelId
         * @returns {Promise<Object>}
         */
        get(channelId) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => channels.get(channelId)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNELS], 'readonly');
                const store = transaction.objectStore(STORES.CHANNELS);
                const request = store.get(channelId);

                request.onerror = () => {
                    console.error('IndexedDB: Error getting channel', channelId, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve(request.result);
                };
            });
        },

        /**
         * Add a new channel
         * @param {Object} channel - { channelId, title, thumbnail, uploadsPlaylistId, addedAt }
         * @returns {Promise<void>}
         */
        add(channel) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => channels.add(channel)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNELS], 'readwrite');
                const store = transaction.objectStore(STORES.CHANNELS);
                const request = store.add(channel);

                request.onerror = () => {
                    console.error('IndexedDB: Error adding channel', channel, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        },

        /**
         * Update an existing channel
         * @param {Object} channel
         * @returns {Promise<void>}
         */
        update(channel) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => channels.update(channel)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNELS], 'readwrite');
                const store = transaction.objectStore(STORES.CHANNELS);
                const request = store.put(channel);

                request.onerror = () => {
                    console.error('IndexedDB: Error updating channel', channel, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        },

        /**
         * Delete a channel by ID
         * @param {string} channelId
         * @returns {Promise<void>}
         */
        delete(channelId) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => channels.delete(channelId)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNELS], 'readwrite');
                const store = transaction.objectStore(STORES.CHANNELS);
                const request = store.delete(channelId);

                request.onerror = () => {
                    console.error('IndexedDB: Error deleting channel', channelId, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        }
    };

    // ========================================
    // Videos Operations
    // ========================================

    const videos = {
        /**
         * Get all videos
         * @returns {Promise<Array>}
         */
        getAll() {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => videos.getAll()).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.VIDEOS], 'readonly');
                const store = transaction.objectStore(STORES.VIDEOS);
                const request = store.getAll();

                request.onerror = () => {
                    console.error('IndexedDB: Error getting all videos', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve(request.result);
                };
            });
        },

        /**
         * Get videos by channel ID
         * @param {string} channelId
         * @returns {Promise<Array>}
         */
        getByChannel(channelId) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => videos.getByChannel(channelId)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.VIDEOS], 'readonly');
                const store = transaction.objectStore(STORES.VIDEOS);
                const index = store.index('channelId');
                const request = index.getAll(channelId);

                request.onerror = () => {
                    console.error('IndexedDB: Error getting videos by channel', channelId, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve(request.result);
                };
            });
        },

        /**
         * Get the timestamp of the most recent watched video for a channel
         * @param {string} channelId
         * @returns {Promise<Date|null>} - Date of most recent watched video, or null if none
         */
        getLastWatchedTimestamp(channelId) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => videos.getLastWatchedTimestamp(channelId)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.VIDEOS], 'readonly');
                const store = transaction.objectStore(STORES.VIDEOS);
                const index = store.index('channelId');
                const request = index.getAll(channelId);

                request.onerror = () => {
                    console.error('IndexedDB: Error getting videos for last watched timestamp', channelId, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    const channelVideos = request.result || [];
                    const watchedVideos = channelVideos.filter(video => video.watched);

                    if (watchedVideos.length === 0) {
                        resolve(null);
                        return;
                    }

                    // Find the most recent watched video by publishedAt
                    const mostRecent = watchedVideos.reduce((latest, video) => {
                        const videoDate = new Date(video.publishedAt);
                        return videoDate > latest ? videoDate : latest;
                    }, new Date(0));

                    resolve(mostRecent);
                };
            });
        },

        /**
         * Get a video by ID
         * @param {string} videoId
         * @returns {Promise<Object>}
         */
        get(videoId) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => videos.get(videoId)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.VIDEOS], 'readonly');
                const store = transaction.objectStore(STORES.VIDEOS);
                const request = store.get(videoId);

                request.onerror = () => {
                    console.error('IndexedDB: Error getting video', videoId, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve(request.result);
                };
            });
        },

        /**
         * Add a new video
         * @param {Object} video - { videoId, channelId, title, thumbnail, publishedAt, description, watched }
         * @returns {Promise<void>}
         */
        add(video) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => videos.add(video)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.VIDEOS], 'readwrite');
                const store = transaction.objectStore(STORES.VIDEOS);
                const request = store.add(video);

                request.onerror = () => {
                    console.error('IndexedDB: Error adding video', video, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        },

        /**
         * Update an existing video
         * @param {Object} video
         * @returns {Promise<void>}
         */
        update(video) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => videos.update(video)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.VIDEOS], 'readwrite');
                const store = transaction.objectStore(STORES.VIDEOS);
                const request = store.put(video);

                request.onerror = () => {
                    console.error('IndexedDB: Error updating video', video, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        },

        /**
         * Delete a video by ID
         * @param {string} videoId
         * @returns {Promise<void>}
         */
        delete(videoId) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => videos.delete(videoId)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.VIDEOS], 'readwrite');
                const store = transaction.objectStore(STORES.VIDEOS);
                const request = store.delete(videoId);

                request.onerror = () => {
                    console.error('IndexedDB: Error deleting video', videoId, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        }
    };

    // ========================================
    // Tags Helper Functions
    // ========================================

    /**
     * Extract tag strings from tag items
     * @param {Array} items - Array of {id, channelId, tag} objects
     * @returns {string[]}
     */
    function extractTagsFromItems(items) {
        return items.map(item => item.tag);
    }

    /**
     * Extract unique tag strings from tag items
     * @param {Array} items - Array of {id, channelId, tag} objects
     * @returns {string[]}
     */
    function extractUniqueTags(items) {
        const tags = items.map(item => item.tag);
        return [...new Set(tags)];
    }

    // ========================================
    // Tags Operations
    // ========================================

    const tags = {
        /**
         * Get all tag entries from the database
         * @returns {Promise<Array>} - Array of {id, channelId, tag} objects
         */
        getAll() {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => tags.getAll()).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNEL_TAGS], 'readonly');
                const store = transaction.objectStore(STORES.CHANNEL_TAGS);
                const request = store.getAll();

                request.onerror = () => {
                    console.error('IndexedDB: Error getting all tags', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve(request.result);
                };
            });
        },

        /**
         * Get all tags for a specific channel
         * @param {string} channelId
         * @returns {Promise<string[]>}
         */
        getByChannel(channelId) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => tags.getByChannel(channelId)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNEL_TAGS], 'readonly');
                const store = transaction.objectStore(STORES.CHANNEL_TAGS);
                const index = store.index('channelId');
                const request = index.getAll(channelId);

                request.onerror = () => {
                    console.error('IndexedDB: Error getting tags for channel', channelId, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => resolve(extractTagsFromItems(request.result));
            });
        },

        /**
         * Add a tag to a channel
         * @param {string} channelId
         * @param {string} tag
         * @returns {Promise<void>}
         */
        add(channelId, tag) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => tags.add(channelId, tag)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNEL_TAGS], 'readwrite');
                const store = transaction.objectStore(STORES.CHANNEL_TAGS);
                const request = store.add({ channelId, tag });

                request.onerror = () => {
                    console.error('IndexedDB: Error adding tag', { channelId, tag }, request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    resolve();
                };
            });
        },

        /**
         * Remove a tag from a channel
         * @param {string} channelId
         * @param {string} tag
         * @returns {Promise<void>}
         */
        remove(channelId, tag) {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => tags.remove(channelId, tag)).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNEL_TAGS], 'readwrite');
                const store = transaction.objectStore(STORES.CHANNEL_TAGS);
                const index = store.index('channelId');
                const request = index.openCursor();

                request.onerror = () => {
                    console.error('IndexedDB: Error removing tag', { channelId, tag }, request.error);
                    reject(request.error);
                };

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (cursor.value.channelId === channelId && cursor.value.tag === tag) {
                            cursor.delete();
                            resolve();
                            return;
                        }
                        cursor.continue();
                    } else {
                        // Tag not found, resolve anyway
                        resolve();
                    }
                };
            });
        },

        /**
         * Get all unique tags across all videos
         * @returns {Promise<string[]>}
         */
        getAllUnique() {
            return new Promise((resolve, reject) => {
                if (!dbInstance) {
                    ensureDb().then(() => tags.getAllUnique()).then(resolve).catch(reject);
                    return;
                }

                const transaction = dbInstance.transaction([STORES.CHANNEL_TAGS], 'readonly');
                const store = transaction.objectStore(STORES.CHANNEL_TAGS);
                const request = store.getAll();

                request.onerror = () => {
                    console.error('IndexedDB: Error getting all tags', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => resolve(extractUniqueTags(request.result));
            });
        }
    };

    // ========================================
    // Expose DB API
    // ========================================

    globalThis.LatestTube.DB = {
        init,
        close,
        resetDatabase,
        settings,
        channels,
        videos,
        tags
    };
})();
