const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const storageKeys = {
    SESSION_COUNT: 'igSessionCount',
    SESSION_START: 'igSessionStart',
    TOTAL_UNFOLLOWED: 'igTotalUnfollowed',
    LAST_RUN: 'igLastRun',
    TEST_MODE: 'igTestMode',
    TEST_COMPLETE: 'igTestComplete',
    KEYWORDS: 'igKeywords',
    WHITELIST: 'igWhitelist',
    DRY_RUN_MODE: 'igDryRunMode',
    UNDO_QUEUE: 'igUndoQueue',
    RATE_LIMIT_UNTIL: 'igRateLimitUntil',
    UNFOLLOW_STATS: 'igUnfollowStats',
    UNFOLLOW_HISTORY: 'igUnfollowHistory',
    THEME: 'igTheme',
    LANGUAGE: 'igLanguage',
    IS_PREMIUM: 'igIsPremium',
    LICENSE_KEY: 'igLicenseKey',
    LICENSE_EMAIL: 'igLicenseEmail',
    WATCH_LIST: 'igWatchList',
    POPUP_ACTIVE_TAB: 'igPopupActiveTab',
    ACTIVE_RUN_LOCK: 'igActiveRunLock',
    RUN_CHECKPOINT: 'igRunCheckpoint'
};

function loadAccountStorage(initial = {}) {
    const stored = structuredClone(initial);
    const local = {
        async get(keys) {
            return Object.fromEntries((keys || Object.keys(stored))
                .filter(key => stored[key] !== undefined)
                .map(key => [key, structuredClone(stored[key])]));
        },
        async set(values) {
            Object.assign(stored, structuredClone(values));
        },
        async remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key];
        }
    };
    const context = vm.createContext({
        Constants: { STORAGE_KEYS: storageKeys },
        chrome: { storage: { local } },
        window: {}
    });
    const source = fs.readFileSync(path.join(root, 'src/shared/accountStorage.js'), 'utf8');
    vm.runInContext(source, context);
    return { accountStorage: context.window.IGRadarAccountStorage, stored };
}

test('account-scoped values stay isolated while global preferences remain shared', async () => {
    const { accountStorage } = loadAccountStorage();

    accountStorage.setScope('account-a');
    await accountStorage.set({
        [storageKeys.KEYWORDS]: ['a-only'],
        [storageKeys.THEME]: 'dark'
    });

    accountStorage.setScope('account-b');
    await accountStorage.set({ [storageKeys.KEYWORDS]: ['b-only'] });
    assert.equal(JSON.stringify(await accountStorage.get([storageKeys.KEYWORDS, storageKeys.THEME])), JSON.stringify({
        [storageKeys.KEYWORDS]: ['b-only'],
        [storageKeys.THEME]: 'dark'
    }));

    accountStorage.setScope('account-a');
    assert.equal(JSON.stringify(await accountStorage.get([storageKeys.KEYWORDS, storageKeys.THEME])), JSON.stringify({
        [storageKeys.KEYWORDS]: ['a-only'],
        [storageKeys.THEME]: 'dark'
    }));
});

test('legacy account data migrates once without overwriting scoped data', async () => {
    const { accountStorage, stored } = loadAccountStorage({
        [storageKeys.KEYWORDS]: ['legacy'],
        [storageKeys.WHITELIST]: { legacy_user: { addedDate: 1 } },
        [`${storageKeys.KEYWORDS}::account::42`]: ['already-scoped'],
        [storageKeys.THEME]: 'light'
    });
    accountStorage.setScope('42');

    assert.equal(await accountStorage.migrateLegacy(), true);
    assert.equal(JSON.stringify(await accountStorage.get([
        storageKeys.KEYWORDS,
        storageKeys.WHITELIST,
        storageKeys.THEME
    ])), JSON.stringify({
        [storageKeys.KEYWORDS]: ['already-scoped'],
        [storageKeys.WHITELIST]: { legacy_user: { addedDate: 1 } },
        [storageKeys.THEME]: 'light'
    }));
    assert.equal(stored[storageKeys.KEYWORDS], undefined);
    assert.equal(stored[storageKeys.WHITELIST], undefined);
    assert.equal(await accountStorage.migrateLegacy(), false);
});
