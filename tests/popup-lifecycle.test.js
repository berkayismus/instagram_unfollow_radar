const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

async function loadPopup(statusResponse) {
    let domReady;
    let runtimeListener;
    const calls = [];
    const ui = {
        el: { startBtn: { disabled: false } },
        cacheElements: () => calls.push(['cacheElements']),
        loadTheme: async () => calls.push(['loadTheme']),
        loadStats: async () => calls.push(['loadStats']),
        loadKeywords: async () => calls.push(['loadKeywords']),
        loadWhitelist: async () => calls.push(['loadWhitelist']),
        loadDryRunMode: async () => calls.push(['loadDryRunMode']),
        loadUndoQueue: async () => calls.push(['loadUndoQueue']),
        loadProcessedUsers: async () => calls.push(['loadProcessedUsers']),
        renderPremiumStatus: (...args) => calls.push(['renderPremiumStatus', ...args]),
        switchTab: tab => calls.push(['switchTab', tab]),
        handleStatusUpdate: data => calls.push(['handleStatusUpdate', data]),
        setRunning: running => calls.push(['setRunning', running]),
        updateStatus: (...args) => calls.push(['updateStatus', ...args]),
        handleRateLimitMessage: data => calls.push(['handleRateLimitMessage', data]),
        addUserToList: (...args) => calls.push(['addUserToList', ...args])
    };
    const constants = {
        ACTIONS: { GET_STATUS: 'GET_STATUS', UPDATE_LICENSE: 'UPDATE_LICENSE' },
        MESSAGE_TYPES: {
            STATUS_UPDATE: 'STATUS_UPDATE',
            RATE_LIMIT_HIT: 'RATE_LIMIT_HIT',
            USER_PROCESSED: 'USER_PROCESSED'
        },
        STATUS: { RATE_LIMIT: 'rate_limit' },
        STORAGE_KEYS: {
            IS_PREMIUM: 'isPremium',
            LICENSE_KEY: 'licenseKey',
            LICENSE_EMAIL: 'licenseEmail',
            POPUP_ACTIVE_TAB: 'popupActiveTab'
        },
        UI: { POPUP_TAB_IDS: ['main', 'filters', 'watch', 'stats', 'premium'] }
    };
    const context = vm.createContext({
        Constants: constants,
        IGRadarUI: ui,
        IGRadarEvents: {
            setCurrentTab: tab => calls.push(['setCurrentTab', tab.id]),
            setup: () => calls.push(['eventsSetup'])
        },
        IGRadarGumroadLicense: { revalidate: async () => ({}) },
        IGRadarAccountStorage: {
            setScope: userId => calls.push(['setScope', userId]),
            migrateLegacy: async () => calls.push(['migrateLegacy']),
            get: async keys => {
                if (keys.includes(constants.STORAGE_KEYS.POPUP_ACTIVE_TAB)) return {};
                return {
                    [constants.STORAGE_KEYS.IS_PREMIUM]: false,
                    [constants.STORAGE_KEYS.LICENSE_KEY]: null,
                    [constants.STORAGE_KEYS.LICENSE_EMAIL]: null
                };
            }
        },
        I18n: {
            init: async () => calls.push(['i18nInit']),
            t: key => key
        },
        chrome: {
            tabs: {
                query: async () => [{ id: 7, url: 'https://www.instagram.com/' }],
                sendMessage: async (_tabId, message) => {
                    calls.push(['tabMessage', message.action]);
                    if (message.action === constants.ACTIONS.GET_STATUS) return statusResponse;
                    return { success: true };
                }
            },
            runtime: {
                onMessage: {
                    addListener: listener => {
                        runtimeListener = listener;
                        calls.push(['runtimeListener']);
                    }
                }
            }
        },
        document: {
            addEventListener: (event, listener) => {
                if (event === 'DOMContentLoaded') domReady = listener;
            }
        },
        console
    });

    vm.runInContext(fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8'), context);
    await domReady();
    return { calls, runtimeListener };
}

test('reopened popup restores the live run snapshot instead of showing ready', async () => {
    const statusData = {
        status: 'scanning',
        sessionCount: 3,
        totalUnfollowed: 8,
        queueSize: 12,
        totalScanned: 50
    };
    const popup = await loadPopup({
        success: true,
        isRunning: true,
        userId: 'self',
        statusData
    });

    assert.ok(popup.calls.some(call =>
        call[0] === 'handleStatusUpdate' && call[1] === statusData
    ));
    assert.ok(popup.calls.some(call => call[0] === 'setRunning' && call[1] === true));
    assert.equal(popup.calls.some(call =>
        call[0] === 'updateStatus' && String(call[2]).includes('status.ready')
    ), false);
});

test('popup subscribes to live messages before restoring processed users', async () => {
    const popup = await loadPopup({
        success: true,
        isRunning: false,
        userId: 'self',
        statusData: { status: 'stopped' }
    });
    const listenerIndex = popup.calls.findIndex(call => call[0] === 'runtimeListener');
    const activityIndex = popup.calls.findIndex(call => call[0] === 'loadProcessedUsers');

    assert.ok(listenerIndex !== -1 && activityIndex !== -1);
    assert.ok(listenerIndex < activityIndex);
    assert.ok(popup.calls.some(call => call[0] === 'setRunning' && call[1] === false));
});

test('processed-user messages received after reopen are appended immediately', async () => {
    const popup = await loadPopup({
        success: true,
        isRunning: true,
        userId: 'self',
        statusData: { status: 'scanning' }
    });

    popup.runtimeListener({
        type: 'USER_PROCESSED',
        data: { username: 'live-user', action: 'unfollowed', timestamp: 123 }
    });

    assert.ok(popup.calls.some(call =>
        JSON.stringify(call) === JSON.stringify([
            'addUserToList', 'live-user', 'unfollowed', 123
        ])
    ));
    assert.ok(popup.calls.some(call => call[0] === 'loadUndoQueue'));
});

test('reopened popup keeps a rate-limited run paused', async () => {
    const popup = await loadPopup({
        success: true,
        isRunning: true,
        userId: 'self',
        statusData: { status: 'rate_limit', remainingMinutes: 9 }
    });

    assert.ok(popup.calls.some(call =>
        call[0] === 'handleStatusUpdate' && call[1].status === 'rate_limit'
    ));
    assert.equal(popup.calls.at(-1)[0], 'setRunning');
    assert.equal(popup.calls.at(-1)[1], false);
});
