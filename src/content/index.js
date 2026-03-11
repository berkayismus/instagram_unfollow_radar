/**
 * @fileoverview Instagram Unfollow Radar - Content Script
 * @description Uses Instagram's internal API to detect and unfollow non-followers
 * @version 1.0.0
 */

const IGUnfollowRadarContent = (function () {
    'use strict';

    // ─── STATE ────────────────────────────────────────────────────────────────

    let isRunning = false;
    let isPaused = false;
    let testMode = true;
    let testComplete = false;

    /** @type {Array<{id: string, username: string}>} */
    let unfollowQueue = [];

    /** @type {Set<string>} Already processed usernames */
    let processedUsers = new Set();

    let sessionCount = 0;
    let totalUnfollowed = 0;
    let keywords = [];
    let whitelist = {};
    let dryRunMode = false;

    /** @type {Array<{id: string, username: string, timestamp: number}>} */
    let undoQueue = [];

    let rateLimitUntil = null;

    // ─── UTILITIES ────────────────────────────────────────────────────────────

    function randomDelay(min, max) {
        return new Promise(resolve =>
            setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
        );
    }

    function sendStatus(status, data = {}) {
        chrome.runtime.sendMessage({
            type: Constants.MESSAGE_TYPES.STATUS_UPDATE,
            status,
            sessionCount,
            totalUnfollowed,
            testMode,
            testComplete,
            ...data
        });
    }

    // ─── INSTAGRAM AUTH HELPERS ───────────────────────────────────────────────

    /**
     * Reads the current Instagram user ID from the ds_user_id cookie.
     * @returns {string|null}
     */
    function getCurrentUserId() {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'ds_user_id') return value;
        }
        return null;
    }

    /**
     * Reads the CSRF token from the csrftoken cookie.
     * @returns {string|null}
     */
    function getCsrfToken() {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrftoken') return value;
        }
        return null;
    }

    /**
     * Returns common headers required by Instagram's internal API.
     * @returns {Object}
     */
    function getApiHeaders() {
        return {
            'X-IG-App-ID': Constants.API.APP_ID,
            'X-CSRFToken': getCsrfToken() || '',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': '*/*'
        };
    }

    // ─── FILTER HELPERS ───────────────────────────────────────────────────────

    /**
     * Decides whether a user should be skipped based on whitelist and keywords.
     * @param {string} username
     * @param {string} displayText - full_name + username combined for keyword matching
     * @returns {{skip: boolean, reason: string|null}}
     */
    function shouldSkipUser(username, displayText) {
        const normalizedUsername = username.toLowerCase().replace('@', '');
        if (whitelist[normalizedUsername]) {
            return { skip: true, reason: 'whitelist' };
        }
        const text = displayText.toLowerCase();
        for (const keyword of keywords) {
            if (text.includes(keyword.toLowerCase())) {
                return { skip: true, reason: `keyword:${keyword}` };
            }
        }
        return { skip: false, reason: null };
    }

    // ─── STORAGE ──────────────────────────────────────────────────────────────

    async function updateDailyStats() {
        const today = new Date().toISOString().split('T')[0];
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNFOLLOW_STATS]);
        const stats = data[Constants.STORAGE_KEYS.UNFOLLOW_STATS] || { daily: {} };
        if (!stats.daily[today]) stats.daily[today] = { unfollowed: 0, timestamp: Date.now() };
        stats.daily[today].unfollowed++;
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.UNFOLLOW_STATS]: stats });
    }

    async function addToHistory(username, reason) {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNFOLLOW_HISTORY]);
        const history = data[Constants.STORAGE_KEYS.UNFOLLOW_HISTORY] || [];
        history.push({ username, date: new Date().toISOString(), reason });
        const retentionMs = Constants.LIMITS.HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const filtered = history.filter(item => new Date(item.date).getTime() > Date.now() - retentionMs);
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.UNFOLLOW_HISTORY]: filtered });
    }

    // ─── RATE LIMIT ───────────────────────────────────────────────────────────

    async function handleRateLimit() {
        const now = Date.now();
        rateLimitUntil = now + Constants.TIMING.RATE_LIMIT_WAIT;
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.RATE_LIMIT_UNTIL]: rateLimitUntil });
        isPaused = true;
        chrome.runtime.sendMessage({
            type: Constants.MESSAGE_TYPES.RATE_LIMIT_HIT,
            data: { until: rateLimitUntil, remainingMinutes: Constants.TIMING.RATE_LIMIT_MINUTES }
        });
        sendStatus(Constants.STATUS.RATE_LIMIT, { remainingMinutes: Constants.TIMING.RATE_LIMIT_MINUTES });
        setTimeout(() => {
            if (rateLimitUntil && Date.now() >= rateLimitUntil) {
                rateLimitUntil = null;
                isPaused = false;
                chrome.storage.local.set({ [Constants.STORAGE_KEYS.RATE_LIMIT_UNTIL]: null });
                if (isRunning) sendStatus(Constants.STATUS.RESUMED);
            }
        }, Constants.TIMING.RATE_LIMIT_WAIT);
    }

    // ─── INSTAGRAM API CALLS ──────────────────────────────────────────────────

    /**
     * Fetches one page of the following list.
     * @param {string} userId
     * @param {string|null} cursor - max_id for pagination
     * @returns {Promise<{users: Array, nextCursor: string|null}|null>}
     */
    async function fetchFollowingPage(userId, cursor) {
        try {
            const params = new URLSearchParams({ count: Constants.LIMITS.SCAN_PAGE_SIZE });
            if (cursor) params.append('max_id', cursor);

            const response = await fetch(
                `${Constants.API.FOLLOWING(userId)}?${params}`,
                { headers: getApiHeaders() }
            );

            if (response.status === 429) {
                await handleRateLimit();
                return null;
            }

            if (!response.ok) {
                console.error('fetchFollowingPage error:', response.status);
                return null;
            }

            const data = await response.json();
            return {
                users: data.users || [],
                nextCursor: data.next_max_id || null
            };
        } catch (error) {
            console.error('fetchFollowingPage exception:', error);
            return null;
        }
    }

    /**
     * Batch-checks friendship status for up to 50 users via show_many.
     * @param {Array<{id: string, username: string, full_name: string}>} users
     * @returns {Promise<Object>} friendship_statuses map {userId: {followed_by_viewer, following}}
     */
    async function batchCheckFriendship(users) {
        try {
            const userIds = users.map(u => u.id).join(',');
            const response = await fetch(Constants.API.FRIENDSHIP_MANY, {
                method: 'POST',
                headers: {
                    ...getApiHeaders(),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `user_ids=${encodeURIComponent(userIds)}`
            });

            if (response.status === 429) {
                await handleRateLimit();
                return {};
            }

            if (!response.ok) return {};
            const data = await response.json();
            return data.friendship_statuses || {};
        } catch (error) {
            console.error('batchCheckFriendship exception:', error);
            return {};
        }
    }

    /**
     * Unfollows a user via the destroy API endpoint.
     * @param {{id: string, username: string}} user
     * @returns {Promise<boolean>}
     */
    async function unfollowUser(user) {
        if (dryRunMode) {
            console.log(`[DRY RUN] Would unfollow @${user.username}`);
            await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
            sessionCount++;
            sendStatus(Constants.STATUS.UNFOLLOWED, { username: user.username, dryRun: true });
            chrome.runtime.sendMessage({
                type: Constants.MESSAGE_TYPES.USER_PROCESSED,
                data: { username: user.username, action: Constants.USER_ACTIONS.DRY_RUN, timestamp: Date.now() }
            });
            await updateDailyStats();
            return true;
        }

        try {
            const response = await fetch(Constants.API.DESTROY(user.id), {
                method: 'POST',
                headers: {
                    ...getApiHeaders(),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (response.status === 429) {
                await handleRateLimit();
                return false;
            }

            if (!response.ok) {
                console.error(`Unfollow failed for @${user.username}:`, response.status);
                return false;
            }

            sessionCount++;
            totalUnfollowed++;

            undoQueue.push({ id: user.id, username: user.username, timestamp: Date.now() });
            if (undoQueue.length > Constants.LIMITS.MAX_UNDO_QUEUE) undoQueue.shift();

            await chrome.storage.local.set({
                [Constants.STORAGE_KEYS.SESSION_COUNT]: sessionCount,
                [Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED]: totalUnfollowed,
                [Constants.STORAGE_KEYS.LAST_RUN]: new Date().toISOString(),
                [Constants.STORAGE_KEYS.UNDO_QUEUE]: undoQueue
            });

            await updateDailyStats();
            await addToHistory(user.username, Constants.USER_ACTIONS.UNFOLLOWED);

            sendStatus(Constants.STATUS.UNFOLLOWED, { username: user.username });
            chrome.runtime.sendMessage({
                type: Constants.MESSAGE_TYPES.USER_PROCESSED,
                data: { username: user.username, action: Constants.USER_ACTIONS.UNFOLLOWED, timestamp: Date.now() }
            });

            return true;
        } catch (error) {
            console.error('unfollowUser exception:', error);
            return false;
        }
    }

    /**
     * Re-follows a user (undo operation).
     * @param {{id: string, username: string}} user
     * @returns {Promise<boolean>}
     */
    async function refollowUser(user) {
        try {
            const response = await fetch(Constants.API.CREATE(user.id), {
                method: 'POST',
                headers: {
                    ...getApiHeaders(),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('refollowUser exception:', error);
            return false;
        }
    }

    // ─── SCAN ─────────────────────────────────────────────────────────────────

    /**
     * Fetches one page, checks friendship status, and pushes non-followers to unfollowQueue.
     * @param {string} userId
     * @param {string|null} cursor
     * @returns {Promise<{nextCursor: string|null, fetched: number}|null>}
     */
    async function scanPage(userId, cursor) {
        const result = await fetchFollowingPage(userId, cursor);
        if (!result) return null;

        const { users, nextCursor } = result;
        if (users.length === 0) return { nextCursor: null, fetched: 0 };

        sendStatus(Constants.STATUS.SCANNING, { queueSize: unfollowQueue.length });

        // Batch friendship check
        const statuses = await batchCheckFriendship(users);

        for (const user of users) {
            if (processedUsers.has(user.username)) continue;
            processedUsers.add(user.username);

            const status = statuses[user.id];
            // followed_by_viewer === false means they do NOT follow us back
            if (status && status.followed_by_viewer === false) {
                const displayText = `${user.username} ${user.full_name || ''}`;
                const skipCheck = shouldSkipUser(user.username, displayText);

                if (skipCheck.skip) {
                    chrome.runtime.sendMessage({
                        type: Constants.MESSAGE_TYPES.USER_PROCESSED,
                        data: {
                            username: user.username,
                            action: `skipped:${skipCheck.reason}`,
                            timestamp: Date.now()
                        }
                    });
                    continue;
                }

                unfollowQueue.push({ id: user.id, username: user.username });
            }
        }

        sendStatus(Constants.STATUS.SCANNING, { queueSize: unfollowQueue.length });
        return { nextCursor, fetched: users.length };
    }

    // ─── MAIN LOOP ────────────────────────────────────────────────────────────

    async function mainLoop() {
        await initStorage();
        sendStatus(Constants.STATUS.STARTED);

        const userId = getCurrentUserId();
        if (!userId) {
            console.error('Not logged in — ds_user_id cookie not found');
            sendStatus(Constants.STATUS.ERROR, { message: 'Not logged in' });
            isRunning = false;
            return;
        }

        let cursor = null;
        let hasMore = true;

        while (isRunning) {
            // ── Pause check ──────────────────────────────────────────────────
            if (isPaused) {
                await randomDelay(
                    Constants.TIMING.PAUSE_CHECK_INTERVAL,
                    Constants.TIMING.PAUSE_CHECK_INTERVAL
                );
                continue;
            }

            // ── Session limit ────────────────────────────────────────────────
            if (sessionCount >= Constants.LIMITS.MAX_SESSION) {
                isRunning = false;
                sendStatus(Constants.STATUS.LIMIT_REACHED);
                break;
            }

            // ── Batch milestone ──────────────────────────────────────────────
            if (testMode && !testComplete && sessionCount >= Constants.LIMITS.BATCH_SIZE) {
                isPaused = true;
                chrome.runtime.sendMessage({ type: Constants.MESSAGE_TYPES.TEST_COMPLETE });
                sendStatus(Constants.STATUS.TEST_COMPLETE);
                return;
            }

            // ── Fetch next page if queue is empty and pages remain ────────────
            if (unfollowQueue.length === 0 && hasMore) {
                const scanResult = await scanPage(userId, cursor);
                if (scanResult) {
                    cursor = scanResult.nextCursor;
                    hasMore = !!scanResult.nextCursor;
                } else {
                    // API error / rate limit — wait and retry
                    await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
                    continue;
                }
                // Small delay between API pages
                await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
            }

            // ── Process current queue ────────────────────────────────────────
            while (unfollowQueue.length > 0 && isRunning && !isPaused) {
                if (sessionCount >= Constants.LIMITS.MAX_SESSION) break;

                if (testMode && !testComplete && sessionCount >= Constants.LIMITS.BATCH_SIZE) {
                    isPaused = true;
                    chrome.runtime.sendMessage({ type: Constants.MESSAGE_TYPES.TEST_COMPLETE });
                    sendStatus(Constants.STATUS.TEST_COMPLETE);
                    return;
                }

                const user = unfollowQueue.shift();
                await unfollowUser(user);
                await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);

                // Occasional human-like pause
                if (Math.random() < Constants.UI.HUMAN_PAUSE_PROBABILITY) {
                    await randomDelay(
                        Constants.TIMING.HUMAN_PAUSE_MIN,
                        Constants.TIMING.HUMAN_PAUSE_MAX
                    );
                }
            }

            // ── All done ─────────────────────────────────────────────────────
            if (!hasMore && unfollowQueue.length === 0) {
                isRunning = false;
                sendStatus(Constants.STATUS.COMPLETED);
                break;
            }
        }
    }

    // ─── STORAGE INIT ─────────────────────────────────────────────────────────

    async function initStorage() {
        const storageKeys = [
            Constants.STORAGE_KEYS.SESSION_COUNT,
            Constants.STORAGE_KEYS.SESSION_START,
            Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED,
            Constants.STORAGE_KEYS.LAST_RUN,
            Constants.STORAGE_KEYS.TEST_MODE,
            Constants.STORAGE_KEYS.TEST_COMPLETE,
            Constants.STORAGE_KEYS.KEYWORDS,
            Constants.STORAGE_KEYS.WHITELIST,
            Constants.STORAGE_KEYS.DRY_RUN_MODE,
            Constants.STORAGE_KEYS.UNDO_QUEUE,
            Constants.STORAGE_KEYS.RATE_LIMIT_UNTIL,
            Constants.STORAGE_KEYS.UNFOLLOW_STATS,
            Constants.STORAGE_KEYS.UNFOLLOW_HISTORY
        ];

        const data = await chrome.storage.local.get(storageKeys);
        const now = Date.now();

        // Reset session if 24 hours have passed
        if (data[Constants.STORAGE_KEYS.SESSION_START] &&
            (now - data[Constants.STORAGE_KEYS.SESSION_START]) > Constants.TIMING.SESSION_DURATION) {
            sessionCount = 0;
            await chrome.storage.local.set({
                [Constants.STORAGE_KEYS.SESSION_COUNT]: 0,
                [Constants.STORAGE_KEYS.SESSION_START]: now
            });
        } else {
            sessionCount = data[Constants.STORAGE_KEYS.SESSION_COUNT] || 0;
        }

        totalUnfollowed = data[Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED] || 0;
        testMode       = data[Constants.STORAGE_KEYS.TEST_MODE] !== undefined
            ? data[Constants.STORAGE_KEYS.TEST_MODE] : true;
        testComplete   = data[Constants.STORAGE_KEYS.TEST_COMPLETE] || false;
        keywords       = data[Constants.STORAGE_KEYS.KEYWORDS] || [];
        whitelist      = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        dryRunMode     = data[Constants.STORAGE_KEYS.DRY_RUN_MODE] || false;
        undoQueue      = data[Constants.STORAGE_KEYS.UNDO_QUEUE] || [];
        rateLimitUntil = data[Constants.STORAGE_KEYS.RATE_LIMIT_UNTIL] || null;

        if (!data[Constants.STORAGE_KEYS.SESSION_START]) {
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.SESSION_START]: now });
        }
        if (!data[Constants.STORAGE_KEYS.UNFOLLOW_STATS]) {
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.UNFOLLOW_STATS]: { daily: {} } });
        }
        if (!data[Constants.STORAGE_KEYS.UNFOLLOW_HISTORY]) {
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.UNFOLLOW_HISTORY]: [] });
        }

        if (rateLimitUntil && now < rateLimitUntil) {
            const waitTime = Math.ceil((rateLimitUntil - now) / 1000 / 60);
            sendStatus(Constants.STATUS.RATE_LIMIT, { remainingMinutes: waitTime });
        }
    }

    // ─── MESSAGE LISTENER ─────────────────────────────────────────────────────

    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case Constants.ACTIONS.START:
                    if (!isRunning) {
                        isRunning = true;
                        isPaused = false;
                        unfollowQueue = [];
                        processedUsers = new Set();
                        mainLoop().catch(err => {
                            console.error('mainLoop error:', err);
                            isRunning = false;
                            sendStatus(Constants.STATUS.ERROR);
                        });
                    }
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.STOP:
                    isRunning = false;
                    isPaused = false;
                    sendStatus(Constants.STATUS.STOPPED);
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.CONTINUE_TEST:
                    testComplete = true;
                    isPaused = false;
                    isRunning = true;
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.TEST_COMPLETE]: true });
                    mainLoop();
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.GET_STATUS:
                    sendStatus(Constants.STATUS.IDLE);
                    sendResponse({ success: true, isRunning });
                    break;

                case Constants.ACTIONS.UPDATE_KEYWORDS:
                    keywords = message.keywords || [];
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.KEYWORDS]: keywords });
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.UPDATE_WHITELIST:
                    whitelist = message.whitelist || {};
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.TOGGLE_DRY_RUN:
                    dryRunMode = message.enabled;
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.DRY_RUN_MODE]: dryRunMode });
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.UNDO_LAST:
                    if (undoQueue.length > 0) {
                        const lastUser = undoQueue.pop();
                        refollowUser(lastUser);
                        chrome.storage.local.set({ [Constants.STORAGE_KEYS.UNDO_QUEUE]: undoQueue });
                        sendResponse({ success: true, username: lastUser.username });
                    } else {
                        sendResponse({ success: false, message: 'No users to undo' });
                    }
                    break;

                case Constants.ACTIONS.UNDO_SINGLE: {
                    const username = message.username;
                    const idx = undoQueue.findIndex(u => u.username === username);
                    const userToRefollow = idx !== -1 ? undoQueue.splice(idx, 1)[0] : { id: null, username };
                    if (userToRefollow.id) {
                        refollowUser(userToRefollow);
                    } else {
                        console.warn('Cannot refollow — user ID not in undo queue:', username);
                    }
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.UNDO_QUEUE]: undoQueue });
                    sendResponse({ success: true, username });
                    break;
                }

                default:
                    sendResponse({ success: false, message: 'Unknown action' });
            }
            return true;
        });
    }

    // ─── INIT ─────────────────────────────────────────────────────────────────

    function init() {
        console.log('🟣 Instagram Unfollow Radar - content script loaded');
        setupMessageListener();
        // Verify login state
        const userId = getCurrentUserId();
        if (userId) {
            initStorage().then(() => sendStatus(Constants.STATUS.READY));
        } else {
            console.warn('Instagram Unfollow Radar: user not logged in');
        }
    }

    return { init, initStorage, sendStatus };
})();

IGUnfollowRadarContent.init();
