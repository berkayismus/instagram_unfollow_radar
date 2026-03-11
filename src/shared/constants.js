/**
 * @fileoverview Instagram Unfollow Radar - Shared Constants
 * @description Centralized configuration and constants for the extension
 * @version 1.0.0
 */

const Constants = (function () {
    'use strict';

    return {

        // ─── TIMING ──────────────────────────────────────────────────────────
        TIMING: {
            MIN_DELAY: 5000,
            MAX_DELAY: 10000,
            BUTTON_CLICK_MIN: 500,
            BUTTON_CLICK_MAX: 1500,
            SCROLL_DELAY: 2000,
            SCROLL_DELAY_EXTRA: 1000,
            PAUSE_CHECK_INTERVAL: 1000,
            HUMAN_PAUSE_MIN: 5000,
            HUMAN_PAUSE_MAX: 15000,
            SESSION_DURATION: 24 * 60 * 60 * 1000,
            RATE_LIMIT_WAIT: 15 * 60 * 1000,
            RATE_LIMIT_MINUTES: 15
        },

        // ─── LIMITS ──────────────────────────────────────────────────────────
        LIMITS: {
            MAX_SESSION: 100,
            BATCH_SIZE: 50,
            MAX_UNDO_QUEUE: 10,
            HISTORY_RETENTION_DAYS: 30,
            MAX_USER_LIST_DISPLAY: 50,
            SCAN_PAGE_SIZE: 50,
            MAX_FRIENDSHIP_BATCH: 50,
            MAX_EMPTY_SCANS: 3,
            MAX_SAME_COUNT_STREAK: 3,
            CHART_DAYS: 30
        },

        // ─── INSTAGRAM API ────────────────────────────────────────────────────
        API: {
            APP_ID: '936619743392459',
            FOLLOWING: (userId) =>
                `https://www.instagram.com/api/v1/friendships/${userId}/following/`,
            FOLLOWERS: (userId) =>
                `https://www.instagram.com/api/v1/friendships/${userId}/followers/`,
            DESTROY: (userId) =>
                `https://www.instagram.com/api/v1/friendships/destroy/${userId}/`,
            CREATE: (userId) =>
                `https://www.instagram.com/api/v1/friendships/create/${userId}/`
        },

        // ─── UI ──────────────────────────────────────────────────────────────
        UI: {
            HUMAN_PAUSE_PROBABILITY: 0.1,
            SCROLL_AMOUNT: 400
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
            LANGUAGE:         'igLanguage'
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
            UNDO_SINGLE:      'UNDO_SINGLE'
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
    };
})();

if (typeof window !== 'undefined') {
    window.Constants = Constants;
}
