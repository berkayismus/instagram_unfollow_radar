/**
 * @fileoverview Instagram Unfollow Radar - Content Script Entry Point
 * @description Owns the mutable session state object and the chrome.runtime
 *   message listener. Delegates all API, storage, filter and automation work
 *   to the dedicated modules loaded before this file.
 * @version 2.0.0
 */

const IGUnfollowRadarContent = (function() {
    'use strict';

    // ─── SESSION STATE ────────────────────────────────────────────────────────

    /** Central mutable state for the current content-script session. */
    const state = {
        isRunning:       false,
        isPaused:        false,
        testMode:        true,
        testComplete:    false,
        unfollowQueue:   [],
        processedUsers:  new Set(),
        previewCount:    0,
        sessionCount:    0,
        totalUnfollowed: 0,
        keywords:        [],
        whitelist:       {},
        dryRunMode:      false,
        undoQueue:       [],
        undoInFlight:    false,
        runId:           null,
        runUserId:       null,
        runCheckpoint:   null,
        isStarting:      false,
        startPromise:    null,
        lockHeartbeatId: null,
        rateLimitUntil:  null,
        abortController: null,
        isPremium:       false,
        licenseKey:      null,
        licenseEmail:    null,
        dailyLimit:      Constants.LIMITS.FREE_DAILY_LIMIT
    };

    // ─── STATUS BROADCAST ─────────────────────────────────────────────────────

    /**
     * Sends a STATUS_UPDATE message that the popup relay picks up.
     * @param {string} status
     * @param {Object} [extra]
     */
    function sendStatus(status, extra = {}) {
        chrome.runtime.sendMessage({
            type:            Constants.MESSAGE_TYPES.STATUS_UPDATE,
            status,
            sessionCount:    state.sessionCount,
            totalUnfollowed: state.totalUnfollowed,
            ...extra
        });
    }

    function createRunId() {
        if (crypto.randomUUID) return crypto.randomUUID();
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function requestRunLock(action, runId) {
        return chrome.runtime.sendMessage({
            target: 'background',
            action,
            runId
        });
    }

    function stopLockHeartbeat() {
        if (state.lockHeartbeatId != null) {
            clearInterval(state.lockHeartbeatId);
            state.lockHeartbeatId = null;
        }
    }

    function startLockHeartbeat(runId) {
        stopLockHeartbeat();
        state.lockHeartbeatId = setInterval(async() => {
            if (!state.isRunning || state.runId !== runId) return;
            const currentUserId = IGRadarAPI.getCurrentUserId();
            if (!currentUserId || String(currentUserId) !== String(state.runUserId)) {
                if (state.abortController) state.abortController.abort();
                state.isRunning = false;
                state.isPaused  = false;
                sendStatus(Constants.STATUS.ERROR, { message: 'account_changed' });
                releaseRunLock(runId);
                return;
            }
            try {
                const result = await requestRunLock(Constants.ACTIONS.RENEW_RUN_LOCK, runId);
                if (result && result.success) return;
            } catch (err) {
                console.error('[IGRadar] Run lock heartbeat failed:', err);
            }

            if (state.abortController) state.abortController.abort();
            state.isRunning = false;
            state.isPaused  = false;
            stopLockHeartbeat();
            sendStatus(Constants.STATUS.ERROR, { message: 'run_lock_lost' });
        }, Constants.TIMING.RUN_LOCK_HEARTBEAT);
    }

    async function releaseRunLock(runId) {
        if (!runId) return;
        stopLockHeartbeat();
        try {
            await requestRunLock(Constants.ACTIONS.RELEASE_RUN_LOCK, runId);
        } catch (err) {
            console.error('[IGRadar] Run lock release failed:', err);
        } finally {
            if (state.runId === runId) {
                state.runId     = null;
                state.runUserId = null;
            }
        }
    }

    function runAutomation(runId) {
        IGRadarAutomation.mainLoop(state, sendStatus)
            .catch(err => {
                console.error('[IGRadar] mainLoop error:', err);
                state.isRunning = false;
                sendStatus(Constants.STATUS.ERROR);
            })
            .finally(() => {
                if (!state.isRunning && state.runId === runId) releaseRunLock(runId);
            });
    }

    async function beginRun() {
        if (state.isRunning) return { success: true, isRunning: true };
        if (state.startPromise) return state.startPromise;

        const runUserId = IGRadarAPI.getCurrentUserId();
        if (!runUserId) return { success: false, error: 'not_logged_in' };

        state.isStarting = true;
        const runId = createRunId();
        state.startPromise = (async() => {
            const result = await requestRunLock(Constants.ACTIONS.ACQUIRE_RUN_LOCK, runId);
            if (!result || !result.success) {
                return {
                    success: false,
                    error: result && result.error ? result.error : 'run_lock_error'
                };
            }

            state.runId           = runId;
            state.runUserId       = runUserId;
            state.isRunning       = true;
            state.isPaused        = false;
            state.unfollowQueue   = [];
            state.processedUsers  = new Set();
            state.previewCount    = 0;
            state.abortController = new AbortController();
            startLockHeartbeat(runId);
            runAutomation(runId);
            return { success: true, runId };
        })();

        try {
            return await state.startPromise;
        } catch (err) {
            console.error('[IGRadar] Failed to acquire run lock:', err);
            if (state.runId === runId) await releaseRunLock(runId);
            return { success: false, error: 'run_lock_error' };
        } finally {
            state.isStarting = false;
            state.startPromise = null;
        }
    }

    // ─── MESSAGE LISTENER ─────────────────────────────────────────────────────

    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            switch (message.action) {

                case Constants.ACTIONS.START: {
                    beginRun().then(sendResponse);
                    return true;
                }

                case Constants.ACTIONS.STOP: {
                    if (state.abortController) state.abortController.abort();
                    const runId    = state.runId;
                    state.isRunning = false;
                    state.isPaused  = false;
                    sendStatus(Constants.STATUS.STOPPED);
                    Promise.all([
                        releaseRunLock(runId),
                        IGRadarStorage.clearRunCheckpoint(),
                        IGRadarStorage.clearRateLimit()
                    ]).finally(() => sendResponse({ success: true }));
                    return true;
                }

                case Constants.ACTIONS.CONTINUE_TEST:
                    state.testComplete    = true;
                    state.isPaused        = false;
                    state.isRunning       = true;
                    state.abortController = new AbortController();
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.TEST_COMPLETE]: true });
                    runAutomation(state.runId);
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.GET_STATUS:
                    sendStatus(Constants.STATUS.IDLE);
                    sendResponse({ success: true, isRunning: state.isRunning });
                    break;

                case Constants.ACTIONS.UPDATE_KEYWORDS:
                    state.keywords = message.keywords || [];
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.KEYWORDS]: state.keywords });
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.UPDATE_WHITELIST:
                    state.whitelist = message.whitelist || {};
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: state.whitelist });
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.TOGGLE_DRY_RUN:
                    state.dryRunMode = message.enabled;
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.DRY_RUN_MODE]: state.dryRunMode });
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.UNDO_LAST: {
                    if (state.undoInFlight) {
                        sendResponse({ success: false, message: 'Undo already in progress' });
                        break;
                    }
                    const last = state.undoQueue[state.undoQueue.length - 1];
                    if (!last) {
                        sendResponse({ success: false, message: 'No users to undo' });
                        break;
                    }
                    state.undoInFlight = true;
                    IGRadarAPI.refollowUser(last.id)
                        .then(async ok => {
                            if (!ok) {
                                sendResponse({ success: false, message: 'Refollow request failed' });
                                return;
                            }
                            const idx = state.undoQueue.findIndex(u =>
                                u.id === last.id && u.timestamp === last.timestamp
                            );
                            if (idx !== -1) state.undoQueue.splice(idx, 1);
                            await chrome.storage.local.set({
                                [Constants.STORAGE_KEYS.UNDO_QUEUE]: state.undoQueue
                            });
                            sendResponse({ success: true, username: last.username });
                        })
                        .catch(err => {
                            console.error('[IGRadar] UNDO_LAST', err);
                            sendResponse({ success: false, message: 'Refollow request failed' });
                        })
                        .finally(() => { state.undoInFlight = false; });
                    return true;
                }

                case Constants.ACTIONS.UPDATE_LICENSE: {
                    state.isPremium    = message.isPremium;
                    state.licenseKey   = message.licenseKey   || null;
                    state.licenseEmail = message.licenseEmail || null;
                    state.dailyLimit   = state.isPremium
                        ? Constants.LIMITS.PREMIUM_DAILY_LIMIT
                        : Constants.LIMITS.FREE_DAILY_LIMIT;
                    IGRadarWatchlistLimits.enforceStorageLimit()
                        .then(() => sendResponse({ success: true }))
                        .catch(err => {
                            console.error('[IGRadar] enforceStorageLimit', err);
                            sendResponse({ success: true });
                        });
                    return true;
                }

                case Constants.ACTIONS.UNDO_SINGLE: {
                    if (state.undoInFlight) {
                        sendResponse({ success: false, message: 'Undo already in progress' });
                        break;
                    }
                    const { username } = message;
                    const idx  = state.undoQueue.findIndex(u => u.username === username);
                    const user = idx !== -1 ? state.undoQueue[idx] : null;
                    if (!user) {
                        console.warn('[IGRadar] Cannot refollow — user not in undo queue:', username);
                        sendResponse({ success: false, message: 'User not in undo queue' });
                        break;
                    }
                    state.undoInFlight = true;
                    IGRadarAPI.refollowUser(user.id)
                        .then(async ok => {
                            if (!ok) {
                                sendResponse({ success: false, message: 'Refollow request failed' });
                                return;
                            }
                            const currentIdx = state.undoQueue.findIndex(u =>
                                u.id === user.id && u.timestamp === user.timestamp
                            );
                            if (currentIdx !== -1) state.undoQueue.splice(currentIdx, 1);
                            await chrome.storage.local.set({
                                [Constants.STORAGE_KEYS.UNDO_QUEUE]: state.undoQueue
                            });
                            sendResponse({ success: true, username });
                        })
                        .catch(err => {
                            console.error('[IGRadar] UNDO_SINGLE', err);
                            sendResponse({ success: false, message: 'Refollow request failed' });
                        })
                        .finally(() => { state.undoInFlight = false; });
                    return true;
                }

                case Constants.ACTIONS.WATCH_LIST_GET:
                    IGRadarWatchlist.getList()
                        .then(list => sendResponse({ success: true, list }))
                        .catch(err => {
                            console.error('[IGRadar] WATCH_LIST_GET', err);
                            sendResponse({ success: false, error: 'unknown' });
                        });
                    return true;

                case Constants.ACTIONS.WATCH_LIST_ADD:
                    IGRadarWatchlist.addUser(message.username, state.isPremium)
                        .then(sendResponse)
                        .catch(err => {
                            console.error('[IGRadar] WATCH_LIST_ADD', err);
                            sendResponse({ success: false, error: 'unknown' });
                        });
                    return true;

                case Constants.ACTIONS.WATCH_LIST_REMOVE:
                    IGRadarWatchlist.removeUser(message.username)
                        .then(sendResponse)
                        .catch(err => {
                            console.error('[IGRadar] WATCH_LIST_REMOVE', err);
                            sendResponse({ success: false, error: 'unknown' });
                        });
                    return true;

                case Constants.ACTIONS.WATCH_LIST_REFRESH: {
                    const run = message.username
                        ? () => IGRadarWatchlist.refreshUser(message.username)
                        : () => IGRadarWatchlist.refreshAll();
                    run()
                        .then(sendResponse)
                        .catch(err => {
                            console.error('[IGRadar] WATCH_LIST_REFRESH', err);
                            sendResponse({ success: false, error: 'unknown' });
                        });
                    return true;
                }

                default:
                    sendResponse({
                        success: false,
                        error:   'unknown_action',
                        message: 'Unknown action'
                    });
            }
            return true; // keep the message channel open for async sendResponse
        });
    }

    // ─── INIT ─────────────────────────────────────────────────────────────────

    function init() {
        console.log('[IGRadar] Content script loaded');
        setupMessageListener();
        const userId = IGRadarAPI.getCurrentUserId();
        if (userId) {
            IGRadarStorage.loadState(state).then(async () => {
                state.dailyLimit = state.isPremium
                    ? Constants.LIMITS.PREMIUM_DAILY_LIMIT
                    : Constants.LIMITS.FREE_DAILY_LIMIT;
                try {
                    await IGRadarWatchlistLimits.enforceStorageLimit();
                } catch (err) {
                    console.error('[IGRadar] enforceStorageLimit on init', err);
                }
                const checkpoint = await IGRadarStorage.getRunCheckpoint();
                const canResume = checkpoint &&
                    checkpoint.version === 1 &&
                    String(checkpoint.userId) === String(userId) &&
                    checkpoint.dryRunMode === state.dryRunMode &&
                    Date.now() - checkpoint.updatedAt <= Constants.TIMING.CHECKPOINT_MAX_AGE;
                if (canResume) {
                    const result = await beginRun();
                    if (!result.success) sendStatus(Constants.STATUS.READY);
                } else {
                    if (checkpoint) await IGRadarStorage.clearRunCheckpoint();
                    sendStatus(Constants.STATUS.READY);
                }
            });
        } else {
            console.warn('[IGRadar] User not logged in');
        }
    }

    return { init };
})();

IGUnfollowRadarContent.init();
