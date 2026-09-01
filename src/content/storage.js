/**
 * @fileoverview Instagram Unfollow Radar - Storage Layer
 * @description Account-aware storage operations for automation and watchlist data.
 *   Functions either populate a state object or persist specific counters.
 *   No fetch calls, no DOM access.
 * @version 2.0.0
 */

const IGRadarStorage = (function() {
    'use strict';

    const SK = Constants.STORAGE_KEYS;
    let runCheckpointQueue = Promise.resolve();
    let runActivityQueue = Promise.resolve();

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
            SK.LAST_RUN,
            SK.KEYWORDS,      SK.WHITELIST,      SK.DRY_RUN_MODE,
            SK.UNDO_QUEUE,    SK.RATE_LIMIT_UNTIL,
            SK.UNFOLLOW_STATS, SK.UNFOLLOW_HISTORY,
            SK.IS_PREMIUM,    SK.LICENSE_KEY,    SK.LICENSE_EMAIL
        ];

        const data = await IGRadarAccountStorage.get(keys);
        const now  = Date.now();

        const sessionExpired =
            data[SK.SESSION_START] &&
            (now - data[SK.SESSION_START]) > Constants.TIMING.SESSION_DURATION;

        if (sessionExpired) {
            state.sessionCount = 0;
            await IGRadarAccountStorage.set({ [SK.SESSION_COUNT]: 0, [SK.SESSION_START]: now });
        } else {
            state.sessionCount = data[SK.SESSION_COUNT] || 0;
        }

        state.totalUnfollowed = data[SK.TOTAL_UNFOLLOWED] || 0;
        state.keywords        = data[SK.KEYWORDS]         || [];
        state.whitelist       = data[SK.WHITELIST]        || {};
        state.dryRunMode      = data[SK.DRY_RUN_MODE]     || false;
        state.undoQueue       = data[SK.UNDO_QUEUE]       || [];
        state.rateLimitUntil  = data[SK.RATE_LIMIT_UNTIL] || null;
        state.isPremium       = data[SK.IS_PREMIUM]       || false;
        state.licenseKey      = data[SK.LICENSE_KEY]      || null;
        state.licenseEmail    = data[SK.LICENSE_EMAIL]    || null;

        // Initialise missing records so downstream reads never see undefined
        if (!data[SK.SESSION_START]) {
            await IGRadarAccountStorage.set({ [SK.SESSION_START]: now });
        }
        if (!data[SK.UNFOLLOW_STATS]) {
            await IGRadarAccountStorage.set({ [SK.UNFOLLOW_STATS]: { daily: {} } });
        }
        if (!data[SK.UNFOLLOW_HISTORY]) {
            await IGRadarAccountStorage.set({ [SK.UNFOLLOW_HISTORY]: [] });
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
        await IGRadarAccountStorage.set({
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
        const data   = await IGRadarAccountStorage.get([SK.UNFOLLOW_STATS]);
        const stats  = data[SK.UNFOLLOW_STATS] || { daily: {} };
        if (!stats.daily[today]) {
            stats.daily[today] = { unfollowed: 0, timestamp: Date.now() };
        }
        stats.daily[today].unfollowed++;
        await IGRadarAccountStorage.set({ [SK.UNFOLLOW_STATS]: stats });
    }

    /**
     * Appends an entry to the unfollow history and prunes entries older than
     * the configured retention window.
     * @param {string} username
     * @param {string} reason
     */
    async function addToHistory(username, reason) {
        const data    = await IGRadarAccountStorage.get([SK.UNFOLLOW_HISTORY]);
        const history = data[SK.UNFOLLOW_HISTORY] || [];
        history.push({ username, date: new Date().toISOString(), reason });
        const cutoff  = Date.now() - Constants.LIMITS.HISTORY_RETENTION_DAYS * 86400000;
        const trimmed = history.filter(item => new Date(item.date).getTime() > cutoff);
        await IGRadarAccountStorage.set({ [SK.UNFOLLOW_HISTORY]: trimmed });
    }

    /**
     * Saves the epoch timestamp at which the rate limit expires.
     * @param {number} timestamp - ms since epoch
     */
    async function setRateLimitUntil(timestamp) {
        await IGRadarAccountStorage.set({ [SK.RATE_LIMIT_UNTIL]: timestamp });
    }

    /** Clears the stored rate-limit expiry (called on auto-resume). */
    async function clearRateLimit() {
        await IGRadarAccountStorage.set({ [SK.RATE_LIMIT_UNTIL]: null });
    }

    async function getRunCheckpoint() {
        const data = await IGRadarAccountStorage.get([SK.RUN_CHECKPOINT]);
        return data[SK.RUN_CHECKPOINT] || null;
    }

    function saveRunCheckpoint(checkpoint) {
        runCheckpointQueue = runCheckpointQueue.catch(err => {
            console.warn('[IGRadar] Previous checkpoint write failed:', err);
        }).then(() => IGRadarAccountStorage.set({
            [SK.RUN_CHECKPOINT]: { ...checkpoint, updatedAt: Date.now() }
        }));
        return runCheckpointQueue;
    }

    async function clearRunCheckpoint() {
        await runCheckpointQueue.catch(() => {});
        await IGRadarAccountStorage.remove(SK.RUN_CHECKPOINT);
    }

    async function getRunActivity() {
        const data = await IGRadarAccountStorage.get([SK.RUN_ACTIVITY]);
        return data[SK.RUN_ACTIVITY] || [];
    }

    function addRunActivity(entry) {
        runActivityQueue = runActivityQueue.catch(err => {
            console.warn('[IGRadar] Previous activity write failed:', err);
        }).then(async() => {
            const activity = await getRunActivity();
            activity.push(entry);
            await IGRadarAccountStorage.set({
                [SK.RUN_ACTIVITY]: activity.slice(-Constants.LIMITS.MAX_USER_LIST_DISPLAY)
            });
        });
        return runActivityQueue;
    }

    async function clearRunActivity() {
        await runActivityQueue.catch(() => {});
        await IGRadarAccountStorage.remove(SK.RUN_ACTIVITY);
    }

    async function saveApiDiagnostic(error) {
        const diagnostic = {
            code: String(error && error.code || 'api_error').slice(0, 64),
            endpoint: error && error.endpoint
                ? String(error.endpoint).slice(0, 64)
                : null,
            reason: error && error.reason ? String(error.reason).slice(0, 64) : null,
            status: Number.isInteger(error && error.status) ? error.status : null,
            timestamp: Date.now()
        };
        await IGRadarAccountStorage.set({ [SK.API_DIAGNOSTIC]: diagnostic });
        return diagnostic;
    }

    async function getApiDiagnostic() {
        const data = await IGRadarAccountStorage.get([SK.API_DIAGNOSTIC]);
        return data[SK.API_DIAGNOSTIC] || null;
    }

    /**
     * Persists Gumroad premium license information.
     * @param {boolean} isPremium
     * @param {string|null} licenseKey
     * @param {string|null} email - email from Gumroad purchase record
     */
    async function saveLicenseState(isPremium, licenseKey, email) {
        await IGRadarAccountStorage.set({
            [SK.IS_PREMIUM]:    isPremium,
            [SK.LICENSE_KEY]:   licenseKey,
            [SK.LICENSE_EMAIL]: email
        });
    }

    /**
     * @returns {Promise<Array>} watch-list entries (may be empty)
     */
    async function getWatchList() {
        const data = await IGRadarAccountStorage.get([SK.WATCH_LIST]);
        return data[SK.WATCH_LIST] || [];
    }

    /**
     * @param {Array} list - serialisable watch-list entry objects
     */
    async function saveWatchList(list) {
        await IGRadarAccountStorage.set({ [SK.WATCH_LIST]: list });
    }

    return {
        loadState,
        saveSessionProgress,
        updateDailyStats,
        addToHistory,
        setRateLimitUntil,
        clearRateLimit,
        getRunCheckpoint,
        saveRunCheckpoint,
        clearRunCheckpoint,
        getRunActivity,
        addRunActivity,
        clearRunActivity,
        saveApiDiagnostic,
        getApiDiagnostic,
        saveLicenseState,
        getWatchList,
        saveWatchList
    };
})();
