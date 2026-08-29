const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadAutomation({ api, storage, runtimeMessages = [] }) {
    class RateLimitError extends Error {}

    const context = vm.createContext({
        AbortController,
        Constants: {
            LIMITS: { BATCH_SIZE: 50, MAX_UNDO_QUEUE: 10 },
            MESSAGE_TYPES: {
                RATE_LIMIT_HIT: 'RATE_LIMIT_HIT',
                TEST_COMPLETE: 'TEST_COMPLETE',
                USER_PROCESSED: 'USER_PROCESSED'
            },
            STATUS: {
                STARTED: 'started',
                SCANNING: 'scanning',
                UNFOLLOWED: 'unfollowed',
                ERROR: 'error',
                COMPLETED: 'completed',
                LIMIT_REACHED: 'limit_reached',
                RATE_LIMIT: 'rate_limit',
                RESUMED: 'resumed',
                TEST_COMPLETE: 'test_complete'
            },
            TIMING: {
                MIN_DELAY: 0,
                MAX_DELAY: 0,
                PAUSE_CHECK_INTERVAL: 0,
                HUMAN_PAUSE_MIN: 0,
                HUMAN_PAUSE_MAX: 0,
                RATE_LIMIT_WAIT: 0,
                RATE_LIMIT_MINUTES: 15
            },
            UI: { HUMAN_PAUSE_PROBABILITY: 0 },
            USER_ACTIONS: { DRY_RUN: 'dry-run', UNFOLLOWED: 'unfollowed' }
        },
        IGRadarAPI: api,
        IGRadarFilters: { shouldSkipUser: () => ({ skip: false }) },
        IGRadarStorage: storage,
        RateLimitError,
        chrome: { runtime: { sendMessage: message => runtimeMessages.push(message) } },
        console,
        setTimeout: callback => {
            callback();
            return 1;
        }
    });

    const source = fs.readFileSync(path.join(root, 'src/content/automation.js'), 'utf8');
    vm.runInContext(source, context);
    return vm.runInContext('IGRadarAutomation', context);
}

function baseState(overrides = {}) {
    return {
        abortController: new AbortController(),
        dailyLimit: 10,
        dryRunMode: false,
        isPaused: false,
        isPremium: false,
        isRunning: true,
        keywords: [],
        previewCount: 0,
        processedUsers: new Set(),
        sessionCount: 0,
        testComplete: false,
        testMode: false,
        totalUnfollowed: 0,
        undoQueue: [],
        unfollowQueue: [],
        whitelist: {},
        ...overrides
    };
}

test('incomplete follower scan fails closed before following users are processed', async () => {
    let followingCalls = 0;
    let unfollowCalls = 0;
    const statuses = [];
    const automation = loadAutomation({
        api: {
            getCurrentUserId: () => 'self',
            fetchFollowersPage: async () => null,
            fetchFollowingPage: async () => {
                followingCalls++;
                return { users: [{ id: '1', username: 'unsafe' }], nextCursor: null };
            },
            unfollowUser: async () => {
                unfollowCalls++;
                return true;
            }
        },
        storage: {
            loadState: async state => state,
            setRateLimitUntil: async () => {},
            clearRateLimit: async () => {}
        }
    });
    const state = baseState();

    await automation.mainLoop(state, (status, extra = {}) => statuses.push({ status, ...extra }));

    assert.equal(state.isRunning, false);
    assert.equal(followingCalls, 0);
    assert.equal(unfollowCalls, 0);
    assert.deepEqual(statuses.at(-1), {
        status: 'error',
        message: 'followers_scan_incomplete'
    });
});

test('dry-run previews do not consume the real action quota or unfollow statistics', async () => {
    let dailyStatsCalls = 0;
    let sessionSaveCalls = 0;
    const automation = loadAutomation({
        api: {
            getCurrentUserId: () => 'self',
            fetchFollowersPage: async () => ({ users: [], nextCursor: null }),
            fetchFollowingPage: async () => ({
                users: [{ id: '1', username: 'previewed_user' }],
                nextCursor: null
            }),
            unfollowUser: async () => {
                throw new Error('dry-run must not call unfollowUser');
            }
        },
        storage: {
            loadState: async state => state,
            updateDailyStats: async () => { dailyStatsCalls++; },
            saveSessionProgress: async () => { sessionSaveCalls++; },
            addToHistory: async () => {},
            setRateLimitUntil: async () => {},
            clearRateLimit: async () => {}
        }
    });
    const state = baseState({ dryRunMode: true, sessionCount: 10 });

    await automation.mainLoop(state, () => {});

    assert.equal(state.previewCount, 1);
    assert.equal(state.sessionCount, 10);
    assert.equal(dailyStatsCalls, 0);
    assert.equal(sessionSaveCalls, 0);
});

test('an Instagram account change stops automation before the unfollow request', async () => {
    let identityChecks = 0;
    let unfollowCalls = 0;
    const statuses = [];
    const automation = loadAutomation({
        api: {
            getCurrentUserId: () => {
                identityChecks++;
                return identityChecks >= 4 ? 'other-account' : 'original-account';
            },
            fetchFollowersPage: async () => ({ users: [], nextCursor: null }),
            fetchFollowingPage: async () => ({
                users: [{ id: '1', username: 'must_not_be_touched' }],
                nextCursor: null
            }),
            unfollowUser: async () => {
                unfollowCalls++;
                return true;
            }
        },
        storage: {
            loadState: async state => state,
            updateDailyStats: async () => {},
            saveSessionProgress: async () => {},
            addToHistory: async () => {},
            setRateLimitUntil: async () => {},
            clearRateLimit: async () => {}
        }
    });
    const state = baseState({ runUserId: 'original-account' });

    await automation.mainLoop(state, (status, extra = {}) => statuses.push({ status, ...extra }));

    assert.equal(state.isRunning, false);
    assert.equal(unfollowCalls, 0);
    assert.deepEqual(statuses.at(-1), { status: 'error', message: 'account_changed' });
});

function loadContent({ initialUndoQueue, refollowResult }) {
    let listener;
    const storageWrites = [];
    const context = vm.createContext({
        AbortController,
        Constants: {
            ACTIONS: {
                START: 'START',
                STOP: 'STOP',
                CONTINUE_TEST: 'CONTINUE_TEST',
                GET_STATUS: 'GET_STATUS',
                UPDATE_KEYWORDS: 'UPDATE_KEYWORDS',
                UPDATE_WHITELIST: 'UPDATE_WHITELIST',
                TOGGLE_DRY_RUN: 'TOGGLE_DRY_RUN',
                UNDO_LAST: 'UNDO_LAST',
                UNDO_SINGLE: 'UNDO_SINGLE',
                UPDATE_LICENSE: 'UPDATE_LICENSE',
                WATCH_LIST_GET: 'WATCH_LIST_GET',
                WATCH_LIST_ADD: 'WATCH_LIST_ADD',
                WATCH_LIST_REFRESH: 'WATCH_LIST_REFRESH'
            },
            LIMITS: { FREE_DAILY_LIMIT: 10, PREMIUM_DAILY_LIMIT: 500 },
            MESSAGE_TYPES: { STATUS_UPDATE: 'STATUS_UPDATE' },
            STATUS: { READY: 'ready', STOPPED: 'stopped', IDLE: 'idle', ERROR: 'error' },
            STORAGE_KEYS: {
                UNDO_QUEUE: 'undoQueue',
                TEST_COMPLETE: 'testComplete',
                KEYWORDS: 'keywords',
                WHITELIST: 'whitelist',
                DRY_RUN_MODE: 'dryRun'
            }
        },
        IGRadarAPI: {
            getCurrentUserId: () => 'self',
            refollowUser: async () => refollowResult
        },
        IGRadarAutomation: { mainLoop: async () => {} },
        IGRadarStorage: {
            loadState: async state => {
                state.undoQueue = initialUndoQueue.map(item => ({ ...item }));
                return state;
            }
        },
        IGRadarWatchlist: {
            addUser: async () => ({}),
            getList: async () => [],
            refreshAll: async () => ({}),
            refreshUser: async () => ({})
        },
        IGRadarWatchlistLimits: { enforceStorageLimit: async () => {} },
        chrome: {
            runtime: {
                onMessage: { addListener: callback => { listener = callback; } },
                sendMessage: () => {}
            },
            storage: {
                local: {
                    set: async value => { storageWrites.push(value); }
                }
            }
        },
        console
    });

    const source = fs.readFileSync(path.join(root, 'src/content/index.js'), 'utf8');
    vm.runInContext(source, context);

    return {
        async send(action, extra = {}) {
            await new Promise(resolve => setImmediate(resolve));
            return new Promise(resolve => listener({ action, ...extra }, {}, resolve));
        },
        storageWrites
    };
}

test('failed undo keeps the user in the persisted undo queue', async () => {
    const undoItem = { id: '7', username: 'keep_me', timestamp: 123 };
    const content = loadContent({ initialUndoQueue: [undoItem], refollowResult: false });

    const response = await content.send('UNDO_LAST');

    assert.equal(response.success, false);
    assert.equal(content.storageWrites.length, 0);
});

test('successful undo removes the user only after the refollow succeeds', async () => {
    const undoItem = { id: '7', username: 'restore_me', timestamp: 123 };
    const content = loadContent({ initialUndoQueue: [undoItem], refollowResult: true });

    const response = await content.send('UNDO_LAST');

    assert.equal(response.success, true);
    assert.equal(response.username, 'restore_me');
    assert.equal(JSON.stringify(content.storageWrites), JSON.stringify([{ undoQueue: [] }]));
});

test('statistics reset does not reset the protected daily quota window', () => {
    const source = fs.readFileSync(path.join(root, 'src/popup/events.js'), 'utf8');
    const resetBody = source.match(/async function handleReset\(\) \{([\s\S]*?)\n    \}/)[1];

    assert.doesNotMatch(resetBody, /STORAGE_KEYS\.SESSION_COUNT/);
    assert.doesNotMatch(resetBody, /STORAGE_KEYS\.SESSION_START/);
});
