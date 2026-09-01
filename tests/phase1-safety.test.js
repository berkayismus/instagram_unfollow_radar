const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadAutomation({ api, storage, runtimeMessages = [] }) {
    class RateLimitError extends Error {}
    const resolvedApi = typeof api === 'function' ? api(RateLimitError) : api;

    const context = vm.createContext({
        AbortController,
        Constants: {
            LIMITS: { MAX_UNDO_QUEUE: 10 },
            MESSAGE_TYPES: {
                RATE_LIMIT_HIT: 'RATE_LIMIT_HIT',
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
            },
            TIMING: {
                MIN_DELAY: 0,
                MAX_DELAY: 0,
                PAUSE_CHECK_INTERVAL: 0,
                HUMAN_PAUSE_MIN: 0,
                HUMAN_PAUSE_MAX: 0,
                RATE_LIMIT_WAIT: 0,
                RATE_LIMIT_MINUTES: 15,
                CHECKPOINT_MAX_AGE: 86400000
            },
            UI: { HUMAN_PAUSE_PROBABILITY: 0 },
            USER_ACTIONS: { DRY_RUN: 'dry-run', UNFOLLOWED: 'unfollowed' }
        },
        IGRadarAPI: resolvedApi,
        IGRadarFilters: { shouldSkipUser: () => ({ skip: false }) },
        IGRadarStorage: {
            getRunCheckpoint: async () => null,
            saveRunCheckpoint: async () => {},
            clearRunCheckpoint: async () => {},
            setRateLimitUntil: async () => {},
            clearRateLimit: async () => {},
            addRunActivity: async () => {},
            saveApiDiagnostic: async () => {},
            ...storage
        },
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
    const activity = [];
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
            addRunActivity: async entry => { activity.push(entry); },
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
    assert.equal(activity.length, 1);
    assert.equal(activity[0].username, 'previewed_user');
    assert.equal(activity[0].action, 'dry-run');
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

test('a rate-limited unfollow remains queued and is retried after cooldown', async () => {
    let unfollowCalls = 0;
    const savedCheckpoints = [];
    const automation = loadAutomation({
        api: RateLimitError => ({
            getCurrentUserId: () => 'self',
            fetchFollowersPage: async () => ({ users: [], nextCursor: null }),
            fetchFollowingPage: async () => ({
                users: [{ id: '1', username: 'retry_me' }],
                nextCursor: null
            }),
            unfollowUser: async () => {
                unfollowCalls++;
                if (unfollowCalls === 1) throw new RateLimitError();
                return true;
            }
        }),
        storage: {
            loadState: async state => state,
            saveRunCheckpoint: async checkpoint => {
                savedCheckpoints.push(structuredClone(checkpoint));
            },
            saveSessionProgress: async () => {},
            updateDailyStats: async () => {},
            addToHistory: async () => {}
        }
    });
    const state = baseState();

    await automation.mainLoop(state, () => {});

    assert.equal(unfollowCalls, 2);
    assert.equal(state.sessionCount, 1);
    assert.ok(savedCheckpoints.some(checkpoint =>
        checkpoint.unfollowQueue?.[0]?.username === 'retry_me'
    ));
});

test('a saved following checkpoint resumes its queue and next cursor', async () => {
    let followerCalls = 0;
    const followingCursors = [];
    const unfollowed = [];
    let checkpointCleared = false;
    const checkpoint = {
        version: 1,
        userId: 'self',
        dryRunMode: false,
        updatedAt: Date.now(),
        phase: 'following',
        followerIds: ['friend'],
        followingCursor: 'page-2',
        hasMore: true,
        unfollowQueue: [{ id: '1', username: 'pending_user' }],
        processedUsernames: ['pending_user'],
        totalScanned: 25,
        previewCount: 0
    };
    const automation = loadAutomation({
        api: {
            getCurrentUserId: () => 'self',
            fetchFollowersPage: async () => {
                followerCalls++;
                return { users: [], nextCursor: null };
            },
            fetchFollowingPage: async (_userId, cursor) => {
                followingCursors.push(cursor);
                return { users: [], nextCursor: null };
            },
            unfollowUser: async id => {
                unfollowed.push(id);
                return true;
            }
        },
        storage: {
            loadState: async state => state,
            getRunCheckpoint: async () => checkpoint,
            saveRunCheckpoint: async () => {},
            clearRunCheckpoint: async () => { checkpointCleared = true; },
            saveSessionProgress: async () => {},
            updateDailyStats: async () => {},
            addToHistory: async () => {}
        }
    });
    const state = baseState({ runUserId: 'self' });

    await automation.mainLoop(state, () => {});

    assert.equal(followerCalls, 0);
    assert.deepEqual(followingCursors, ['page-2']);
    assert.deepEqual(unfollowed, ['1']);
    assert.equal(checkpointCleared, true);
});

test('classified API failures preserve the pending unfollow before stopping', async () => {
    const savedCheckpoints = [];
    const diagnostics = [];
    const statuses = [];
    const automation = loadAutomation({
        api: {
            getCurrentUserId: () => 'self',
            fetchFollowersPage: async () => ({ users: [], nextCursor: null }),
            fetchFollowingPage: async () => ({
                users: [{ id: '1', username: 'preserve_me' }],
                nextCursor: null
            }),
            unfollowUser: async () => {
                const error = new Error('offline');
                error.code = 'network_error';
                error.retriable = true;
                throw error;
            }
        },
        storage: {
            loadState: async state => state,
            saveRunCheckpoint: async checkpoint => {
                savedCheckpoints.push(structuredClone(checkpoint));
            },
            saveApiDiagnostic: async error => { diagnostics.push(error); }
        }
    });
    const state = baseState();

    await automation.mainLoop(state, (status, extra = {}) => statuses.push({ status, ...extra }));

    assert.equal(state.isRunning, false);
    assert.ok(savedCheckpoints.some(checkpoint =>
        checkpoint.unfollowQueue?.[0]?.username === 'preserve_me'
    ));
    assert.deepEqual(statuses.at(-1), { status: 'error', message: 'network_error' });
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].code, 'network_error');
});

function loadContent({ initialUndoQueue, refollowResult, checkpoint = null, keepRunning = false }) {
    let listener;
    let automationCalls = 0;
    let emitLateStatus = null;
    let checkpointClearCalls = 0;
    let activityClearCalls = 0;
    let rateLimitClearCalls = 0;
    const storageWrites = [];
    const runtimeMessages = [];
    const context = vm.createContext({
        AbortController,
        Constants: {
            ACTIONS: {
                START: 'START',
                STOP: 'STOP',
                GET_STATUS: 'GET_STATUS',
                UPDATE_KEYWORDS: 'UPDATE_KEYWORDS',
                UPDATE_WHITELIST: 'UPDATE_WHITELIST',
                TOGGLE_DRY_RUN: 'TOGGLE_DRY_RUN',
                UNDO_LAST: 'UNDO_LAST',
                UNDO_SINGLE: 'UNDO_SINGLE',
                UPDATE_LICENSE: 'UPDATE_LICENSE',
                WATCH_LIST_GET: 'WATCH_LIST_GET',
                WATCH_LIST_ADD: 'WATCH_LIST_ADD',
                WATCH_LIST_REFRESH: 'WATCH_LIST_REFRESH',
                ACQUIRE_RUN_LOCK: 'ACQUIRE_RUN_LOCK',
                RENEW_RUN_LOCK: 'RENEW_RUN_LOCK',
                RELEASE_RUN_LOCK: 'RELEASE_RUN_LOCK'
            },
            LIMITS: { FREE_DAILY_LIMIT: 10, PREMIUM_DAILY_LIMIT: 500 },
            TIMING: { CHECKPOINT_MAX_AGE: 86400000, RUN_LOCK_HEARTBEAT: 30000 },
            MESSAGE_TYPES: { STATUS_UPDATE: 'STATUS_UPDATE' },
            STATUS: {
                READY: 'ready', STOPPED: 'stopped', IDLE: 'idle', ERROR: 'error',
                SCANNING: 'scanning'
            },
            STORAGE_KEYS: {
                UNDO_QUEUE: 'undoQueue',
                KEYWORDS: 'keywords',
                WHITELIST: 'whitelist',
                DRY_RUN_MODE: 'dryRun'
            }
        },
        IGRadarAPI: {
            getCurrentUserId: () => 'self',
            refollowUser: async () => refollowResult
        },
        IGRadarAutomation: {
            mainLoop: async (state, sendStatus) => {
                automationCalls++;
                emitLateStatus = () => sendStatus('scanning', {
                    queueSize: 99,
                    totalScanned: 999
                });
                if (keepRunning) {
                    sendStatus('scanning', { queueSize: 2, totalScanned: 17 });
                } else {
                    state.isRunning = false;
                }
            }
        },
        IGRadarAccountStorage: {
            setScope: () => {},
            migrateLegacy: async () => false,
            set: async value => { storageWrites.push(value); }
        },
        IGRadarStorage: {
            getRunCheckpoint: async () => checkpoint,
            clearRunCheckpoint: async () => { checkpointClearCalls++; },
            clearRunActivity: async () => { activityClearCalls++; },
            clearRateLimit: async () => { rateLimitClearCalls++; },
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
                sendMessage: message => message.target === 'background'
                    ? Promise.resolve({ success: true })
                    : runtimeMessages.push(message)
            },
            storage: {
                local: {
                    set: async value => { storageWrites.push(value); }
                }
            }
        },
        console,
        crypto: { randomUUID: () => 'run-id' },
        setInterval: () => 1,
        clearInterval: () => {}
    });

    const source = fs.readFileSync(path.join(root, 'src/content/index.js'), 'utf8');
    vm.runInContext(source, context);

    return {
        async send(action, extra = {}) {
            await new Promise(resolve => setImmediate(resolve));
            return new Promise(resolve => listener({ action, ...extra }, {}, resolve));
        },
        storageWrites,
        runtimeMessages,
        emitLateStatus: () => emitLateStatus && emitLateStatus(),
        getAutomationCalls: () => automationCalls,
        getCheckpointClearCalls: () => checkpointClearCalls,
        getActivityClearCalls: () => activityClearCalls,
        getRateLimitClearCalls: () => rateLimitClearCalls
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

test('content initialization automatically resumes a recent matching checkpoint', async () => {
    const content = loadContent({
        initialUndoQueue: [],
        refollowResult: true,
        checkpoint: {
            version: 1,
            userId: 'self',
            dryRunMode: false,
            updatedAt: Date.now(),
            phase: 'followers'
        }
    });

    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(content.getAutomationCalls(), 1);
    assert.equal(content.getActivityClearCalls(), 0);
});

test('content initialization rejects and clears a stale checkpoint', async () => {
    const content = loadContent({
        initialUndoQueue: [],
        refollowResult: true,
        checkpoint: {
            version: 1,
            userId: 'self',
            dryRunMode: false,
            updatedAt: Date.now() - 86400001,
            phase: 'following'
        }
    });

    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(content.getAutomationCalls(), 0);
    assert.equal(content.getCheckpointClearCalls(), 1);
});

test('GET_STATUS returns the live run snapshot without broadcasting idle', async () => {
    const content = loadContent({
        initialUndoQueue: [],
        refollowResult: true,
        keepRunning: true
    });

    await new Promise(resolve => setImmediate(resolve));
    content.runtimeMessages.length = 0;
    const started = await content.send('START');
    const response = await content.send('GET_STATUS');

    assert.equal(started.success, true);
    assert.equal(response.isRunning, true);
    assert.equal(response.statusData.status, 'scanning');
    assert.equal(response.statusData.queueSize, 2);
    assert.equal(response.statusData.totalScanned, 17);
    assert.equal(content.runtimeMessages.some(message => message.status === 'idle'), false);
});

test('STOP suppresses late active status updates from in-flight work', async () => {
    const content = loadContent({
        initialUndoQueue: [],
        refollowResult: true,
        keepRunning: true
    });

    await new Promise(resolve => setImmediate(resolve));
    await content.send('START');
    await content.send('STOP');
    content.emitLateStatus();
    const response = await content.send('GET_STATUS');

    assert.equal(response.isRunning, false);
    assert.equal(response.statusData.status, 'stopped');
    assert.equal(content.runtimeMessages.at(-1).status, 'stopped');
    assert.equal(content.getCheckpointClearCalls(), 1);
    assert.equal(content.getRateLimitClearCalls(), 1);
});

test('statistics reset does not reset the protected daily quota window', () => {
    const source = fs.readFileSync(path.join(root, 'src/popup/events.js'), 'utf8');
    const resetBody = source.match(/async function handleReset\(\) \{([\s\S]*?)\n    \}/)[1];

    assert.doesNotMatch(resetBody, /STORAGE_KEYS\.SESSION_COUNT/);
    assert.doesNotMatch(resetBody, /STORAGE_KEYS\.SESSION_START/);
});
