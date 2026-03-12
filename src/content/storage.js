/**
 * @fileoverview Instagram Unfollow Radar - Storage Layer
 * @description All chrome.storage.local interactions in one place.
 *   Functions either populate a state object or persist specific counters.
 *   No fetch calls, no DOM access.
 * @version 2.0.0
 */

const IGRadarStorage = (function() {
    'use strict';

    const SK = Constants.STORAGE_KEYS;

    /**
     * Reads all persisted values into the provided mutable state object.
     * Resets the session counter when the 24-hour window has elapsed.
     *
     * @param {Object} state - the content script's central state object
     * @returns {Promise<Object>} the same state object, now populated
     */
    async function loadState(state) {
        const keys = [
            SK.SESSION_COUNT, SK.SESSION_START, SK.TOTAL_UNFOLLOWED,
            SK.LAST_RUN,      SK.TEST_MODE,      SK.TEST_COMPLETE,
            SK.KEYWORDS,      SK.WHITELIST,      SK.DRY_RUN_MODE,
            SK.UNDO_QUEUE,    SK.RATE_LIMIT_UNTIL,
            SK.UNFOLLOW_STATS, SK.UNFOLLOW_HISTORY
        ];

        const data = await chrome.storage.local.get(keys);
        const now  = Date.now();

        const sessionExpired =
            data[SK.SESSION_START] &&
            (now - data[SK.SESSION_START]) > Constants.TIMING.SESSION_DURATION;

        if (sessionExpired) {
            state.sessionCount = 0;
            await chrome.storage.local.set({ [SK.SESSION_COUNT]: 0, [SK.SESSION_START]: now });
        } else {
            state.sessionCount = data[SK.SESSION_COUNT] || 0;
        }

        state.totalUnfollowed = data[SK.TOTAL_UNFOLLOWED] || 0;
        state.testMode        = data[SK.TEST_MODE] !== undefined ? data[SK.TEST_MODE] : true;
        state.testComplete    = data[SK.TEST_COMPLETE]    || false;
        state.keywords        = data[SK.KEYWORDS]         || [];
        state.whitelist       = data[SK.WHITELIST]        || {};
        state.dryRunMode      = data[SK.DRY_RUN_MODE]     || false;
        state.undoQueue       = data[SK.UNDO_QUEUE]       || [];
        state.rateLimitUntil  = data[SK.RATE_LIMIT_UNTIL] || null;

        // Initialise missing records so downstream reads never see undefined
        if (!data[SK.SESSION_START]) {
            await chrome.storage.local.set({ [SK.SESSION_START]: now });
        }
        if (!data[SK.UNFOLLOW_STATS]) {
            await chrome.storage.local.set({ [SK.UNFOLLOW_STATS]: { daily: {} } });
        }
        if (!data[SK.UNFOLLOW_HISTORY]) {
            await chrome.storage.local.set({ [SK.UNFOLLOW_HISTORY]: [] });
        }

        return state;
    }

    /**
     * Persists session counters, last-run timestamp, and the undo queue.
     * @param {Object} params
     * @param {number} params.sessionCount
     * @param {number} params.totalUnfollowed
     * @param {Array}  params.undoQueue
     */
    async function saveSessionProgress({ sessionCount, totalUnfollowed, undoQueue }) {
        await chrome.storage.local.set({
            [SK.SESSION_COUNT]:    sessionCount,
            [SK.TOTAL_UNFOLLOWED]: totalUnfollowed,
            [SK.LAST_RUN]:         new Date().toISOString(),
            [SK.UNDO_QUEUE]:       undoQueue
        });
    }

    /**
     * Increments the unfollowed-today counter inside the daily stats record.
     */
    async function updateDailyStats() {
        const today  = new Date().toISOString().split('T')[0];
        const data   = await chrome.storage.local.get([SK.UNFOLLOW_STATS]);
        const stats  = data[SK.UNFOLLOW_STATS] || { daily: {} };
        if (!stats.daily[today]) {
            stats.daily[today] = { unfollowed: 0, timestamp: Date.now() };
        }
        stats.daily[today].unfollowed++;
        await chrome.storage.local.set({ [SK.UNFOLLOW_STATS]: stats });
    }

    /**
     * Appends an entry to the unfollow history and prunes entries older than
     * the configured retention window.
     * @param {string} username
     * @param {string} reason
     */
    async function addToHistory(username, reason) {
        const data    = await chrome.storage.local.get([SK.UNFOLLOW_HISTORY]);
        const history = data[SK.UNFOLLOW_HISTORY] || [];
        history.push({ username, date: new Date().toISOString(), reason });
        const cutoff  = Date.now() - Constants.LIMITS.HISTORY_RETENTION_DAYS * 86400000;
        const trimmed = history.filter(item => new Date(item.date).getTime() > cutoff);
        await chrome.storage.local.set({ [SK.UNFOLLOW_HISTORY]: trimmed });
    }

    /**
     * Saves the epoch timestamp at which the rate limit expires.
     * @param {number} timestamp - ms since epoch
     */
    async function setRateLimitUntil(timestamp) {
        await chrome.storage.local.set({ [SK.RATE_LIMIT_UNTIL]: timestamp });
    }

    /** Clears the stored rate-limit expiry (called on auto-resume). */
    async function clearRateLimit() {
        await chrome.storage.local.set({ [SK.RATE_LIMIT_UNTIL]: null });
    }

    return {
        loadState,
        saveSessionProgress,
        updateDailyStats,
        addToHistory,
        setRateLimitUntil,
        clearRateLimit
    };
})();
