// ========================================
// Theme Module
// ========================================
(function() {
    'use strict';

    // Initialize LatestTube namespace
    globalThis.LatestTube = globalThis.LatestTube || {};

    // Theme constants
    const THEME_KEY = 'theme';
    const THEMES = {
        DARK: 'dark',
        LIGHT: 'light'
    };

    // DOM Elements
    const themeBtn = document.getElementById('theme-btn');
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');

    /**
     * Get the current theme
     * @returns {string} Current theme ('dark' or 'light')
     */
    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || THEMES.DARK;
    }

    /**
     * Set the theme
     * @param {string} theme - Theme to set ('dark' or 'light')
     */
    function setTheme(theme) {
        if (theme === THEMES.LIGHT) {
            document.documentElement.setAttribute('data-theme', THEMES.LIGHT);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        updateThemeIcons(theme);
    }

    /**
     * Update the theme toggle icons based on current theme
     * @param {string} theme - Current theme
     */
    function updateThemeIcons(theme) {
        if (!sunIcon || !moonIcon) return;

        if (theme === THEMES.LIGHT) {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    }

    /**
     * Toggle between light and dark themes
     */
    function toggleTheme() {
        const currentTheme = getCurrentTheme();
        const newTheme = currentTheme === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT;

        setTheme(newTheme);
        saveThemePreference(newTheme);
    }

    /**
     * Save theme preference to IndexedDB
     * @param {string} theme - Theme to save
     */
    async function saveThemePreference(theme) {
        try {
            if (globalThis.LatestTube.DB?.settings?.set) {
                await globalThis.LatestTube.DB.settings.set(THEME_KEY, theme);
            }
        } catch (error) {
            console.error('Theme: Error saving theme preference', error);
        }
    }

    /**
     * Load theme preference from IndexedDB
     */
    async function loadThemePreference() {
        try {
            if (globalThis.LatestTube.DB?.settings?.get) {
                const savedTheme = await globalThis.LatestTube.DB.settings.get(THEME_KEY);
                if (savedTheme && (savedTheme === THEMES.LIGHT || savedTheme === THEMES.DARK)) {
                    setTheme(savedTheme);
                }
            }
        } catch (error) {
            console.error('Theme: Error loading theme preference', error);
        }
    }

    /**
     * Initialize the theme module
     */
    function init() {
        // Add event listener to theme button
        if (themeBtn) {
            themeBtn.addEventListener('click', toggleTheme);
        }

        // Load saved theme preference
        loadThemePreference();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose functions globally
    globalThis.LatestTube.Theme = {
        getCurrent: getCurrentTheme,
        set: setTheme,
        toggle: toggleTheme,
        THEMES
    };
})();
