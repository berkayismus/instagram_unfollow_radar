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
        sessionCount:    0,
        totalUnfollowed: 0,
        keywords:        [],
        whitelist:       {},
        dryRunMode:      false,
        undoQueue:       [],
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

    // ─── MESSAGE LISTENER ─────────────────────────────────────────────────────

    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            switch (message.action) {

                case Constants.ACTIONS.START:
                    if (!state.isRunning) {
                        state.isRunning       = true;
                        state.isPaused        = false;
                        state.unfollowQueue   = [];
                        state.processedUsers  = new Set();
                        state.abortController = new AbortController();
                        IGRadarAutomation.mainLoop(state, sendStatus).catch(err => {
                            console.error('[IGRadar] mainLoop error:', err);
                            state.isRunning = false;
                            sendStatus(Constants.STATUS.ERROR);
                        });
                    }
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.STOP:
                    if (state.abortController) state.abortController.abort();
                    state.isRunning = false;
                    state.isPaused  = false;
                    sendStatus(Constants.STATUS.STOPPED);
                    sendResponse({ success: true });
                    break;

                case Constants.ACTIONS.CONTINUE_TEST:
                    state.testComplete    = true;
                    state.isPaused        = false;
                    state.isRunning       = true;
                    state.abortController = new AbortController();
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.TEST_COMPLETE]: true });
                    IGRadarAutomation.mainLoop(state, sendStatus);
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

                case Constants.ACTIONS.UNDO_LAST:
                    if (state.undoQueue.length > 0) {
                        const last = state.undoQueue.pop();
                        IGRadarAPI.refollowUser(last.id);
                        chrome.storage.local.set({ [Constants.STORAGE_KEYS.UNDO_QUEUE]: state.undoQueue });
                        sendResponse({ success: true, username: last.username });
                    } else {
                        sendResponse({ success: false, message: 'No users to undo' });
                    }
                    break;

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
                    const { username } = message;
                    const idx  = state.undoQueue.findIndex(u => u.username === username);
                    const user = idx !== -1 ? state.undoQueue.splice(idx, 1)[0] : null;
                    if (user) {
                        IGRadarAPI.refollowUser(user.id);
                    } else {
                        console.warn('[IGRadar] Cannot refollow — user not in undo queue:', username);
                    }
                    chrome.storage.local.set({ [Constants.STORAGE_KEYS.UNDO_QUEUE]: state.undoQueue });
                    sendResponse({ success: true, username });
                    break;
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
                sendStatus(Constants.STATUS.READY);
            });
        } else {
            console.warn('[IGRadar] User not logged in');
        }
    }

    return { init };
})();

IGUnfollowRadarContent.init();
