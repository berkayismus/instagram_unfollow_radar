/**
 * @fileoverview Instagram Unfollow Radar - Shared Constants
 * @description Centralized, immutable configuration for the extension.
 *   All nested objects are recursively frozen so accidental mutation fails fast.
 * @version 2.0.0
 */

const Constants = (function () {
    'use strict';

    /**
     * Recursively freezes an object and all its enumerable nested objects.
     * Function-valued properties are left callable but their containing object
     * is still frozen (no new properties can be added/removed).
     * @template T
     * @param {T} obj
     * @returns {T}
     */
    function deepFreeze(obj) {
        for (const key of Object.getOwnPropertyNames(obj)) {
            const val = obj[key];
            if (val && typeof val === 'object') deepFreeze(val);
        }
        return Object.freeze(obj);
    }

    return deepFreeze({

        // ─── TIMING ──────────────────────────────────────────────────────────
        TIMING: {
            MIN_DELAY:            5000,
            MAX_DELAY:            10000,
            PAUSE_CHECK_INTERVAL: 1000,
            HUMAN_PAUSE_MIN:      5000,
            HUMAN_PAUSE_MAX:      15000,
            SESSION_DURATION:     24 * 60 * 60 * 1000,
            RATE_LIMIT_WAIT:      15 * 60 * 1000,
            RATE_LIMIT_MINUTES:   15
        },

        // ─── LIMITS ──────────────────────────────────────────────────────────
        LIMITS: {
            MAX_SESSION:             100,
            BATCH_SIZE:              50,
            MAX_UNDO_QUEUE:          10,
            HISTORY_RETENTION_DAYS:  30,
            MAX_USER_LIST_DISPLAY:   50,
            SCAN_PAGE_SIZE:          50,
            CHART_DAYS:              30,
            FREE_DAILY_LIMIT:        50,
            PREMIUM_DAILY_LIMIT:     500
        },

        // ─── WATCH LIST (follow activity) ────────────────────────────────────
        WATCH_LIST: {
            MAX_ENTRIES:               20,
            MAX_PAGES_PER_REFRESH:     10,
            NEW_FOLLOW_RETENTION_MS:   24 * 60 * 60 * 1000
        },

        // ─── GUMROAD ─────────────────────────────────────────────────────────
        GUMROAD: {
            PRODUCT_PERMALINK: 'vnzrgn',
            VERIFY_URL:        'https://api.gumroad.com/v2/licenses/verify',
            MANAGE_URL:        'https://app.gumroad.com/library'
        },

        // ─── INSTAGRAM API ────────────────────────────────────────────────────
        API: {
            APP_ID:    '936619743392459',
            FOLLOWING: (userId) => `https://www.instagram.com/api/v1/friendships/${userId}/following/`,
            FOLLOWERS: (userId) => `https://www.instagram.com/api/v1/friendships/${userId}/followers/`,
            DESTROY:   (userId) => `https://www.instagram.com/api/v1/friendships/destroy/${userId}/`,
            CREATE:    (userId) => `https://www.instagram.com/api/v1/friendships/create/${userId}/`,
            WEB_PROFILE_INFO: (username) =>
                `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
        },

        // ─── UI ──────────────────────────────────────────────────────────────
        UI: {
            HUMAN_PAUSE_PROBABILITY: 0.1
        },

        // ─── STORAGE KEYS ────────────────────────────────────────────────────
        STORAGE_KEYS: {
            SESSION_COUNT:    'igSessionCount',
            SESSION_START:    'igSessionStart',
            TOTAL_UNFOLLOWED: 'igTotalUnfollowed',
            LAST_RUN:         'igLastRun',
            TEST_MODE:        'igTestMode',
            TEST_COMPLETE:    'igTestComplete',
            KEYWORDS:         'igKeywords',
            WHITELIST:        'igWhitelist',
            DRY_RUN_MODE:     'igDryRunMode',
            UNDO_QUEUE:       'igUndoQueue',
            RATE_LIMIT_UNTIL: 'igRateLimitUntil',
            UNFOLLOW_STATS:   'igUnfollowStats',
            UNFOLLOW_HISTORY: 'igUnfollowHistory',
            THEME:            'igTheme',
            LANGUAGE:         'igLanguage',
            IS_PREMIUM:       'igIsPremium',
            LICENSE_KEY:      'igLicenseKey',
            LICENSE_EMAIL:    'igLicenseEmail',
            WATCH_LIST:       'igWatchList'
        },

        // ─── MESSAGE TYPES ────────────────────────────────────────────────────
        MESSAGE_TYPES: {
            STATUS_UPDATE:  'STATUS_UPDATE',
            TEST_COMPLETE:  'TEST_COMPLETE',
            RATE_LIMIT_HIT: 'RATE_LIMIT_HIT',
            USER_PROCESSED: 'USER_PROCESSED'
        },

        // ─── ACTIONS ─────────────────────────────────────────────────────────
        ACTIONS: {
            START:            'START',
            STOP:             'STOP',
            CONTINUE_TEST:    'CONTINUE_TEST',
            GET_STATUS:       'GET_STATUS',
            UPDATE_KEYWORDS:  'UPDATE_KEYWORDS',
            UPDATE_WHITELIST: 'UPDATE_WHITELIST',
            TOGGLE_DRY_RUN:   'TOGGLE_DRY_RUN',
            UNDO_LAST:        'UNDO_LAST',
            UNDO_SINGLE:      'UNDO_SINGLE',
            UPDATE_LICENSE:   'UPDATE_LICENSE',
            WATCH_LIST_GET:     'WATCH_LIST_GET',
            WATCH_LIST_ADD:     'WATCH_LIST_ADD',
            WATCH_LIST_REMOVE:  'WATCH_LIST_REMOVE',
            WATCH_LIST_REFRESH: 'WATCH_LIST_REFRESH'
        },

        // ─── STATUS ──────────────────────────────────────────────────────────
        STATUS: {
            READY:         'ready',
            IDLE:          'idle',
            STARTED:       'started',
            SCANNING:      'scanning',
            UNFOLLOWED:    'unfollowed',
            STOPPED:       'stopped',
            COMPLETED:     'completed',
            LIMIT_REACHED: 'limit_reached',
            TEST_COMPLETE: 'test_complete',
            RATE_LIMIT:    'rate_limit',
            RESUMED:       'resumed',
            ERROR:         'error'
        },

        // ─── USER ACTIONS ─────────────────────────────────────────────────────
        USER_ACTIONS: {
            UNFOLLOWED: 'unfollowed',
            DRY_RUN:    'dry-run',
            MANUAL:     'manual'
        },

        // ─── THEMES ──────────────────────────────────────────────────────────
        THEMES: {
            LIGHT: 'light',
            DARK:  'dark'
        },

        // ─── LOCALES ─────────────────────────────────────────────────────────
        LOCALES: {
            TR:      'tr',
            EN:      'en',
            DEFAULT: 'tr'
        }
    });
})();

if (typeof window !== 'undefined') window.Constants = Constants;
