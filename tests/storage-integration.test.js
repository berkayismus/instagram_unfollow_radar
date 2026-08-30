const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadStorageStack(initial = {}) {
    const stored = structuredClone(initial);
    const sandbox = {
        chrome: {
            storage: {
                local: {
                    async get(keys) {
                        const selected = Array.isArray(keys) ? keys : Object.keys(stored);
                        return Object.fromEntries(selected
                            .filter(key => stored[key] !== undefined)
                            .map(key => [key, structuredClone(stored[key])]));
                    },
                    async set(values) {
                        Object.assign(stored, structuredClone(values));
                    },
                    async remove(keys) {
                        for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key];
                    }
                }
            }
        },
        console
    };
    sandbox.window = sandbox;
    const context = vm.createContext(sandbox);
    for (const file of [
        'src/shared/constants.js',
        'src/shared/accountStorage.js',
        'src/content/storage.js'
    ]) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
    }
    return {
        constants: vm.runInContext('Constants', context),
        accountStorage: vm.runInContext('IGRadarAccountStorage', context),
        contentStorage: vm.runInContext('IGRadarStorage', context),
        stored
    };
}

function blankState() {
    return {};
}

test('real storage modules isolate operational data and share license state', async () => {
    const { constants, accountStorage, contentStorage } = loadStorageStack();
    const SK = constants.STORAGE_KEYS;

    accountStorage.setScope('account-a');
    await accountStorage.migrateLegacy();
    await accountStorage.set({
        [SK.KEYWORDS]: ['a-keyword'],
        [SK.IS_PREMIUM]: true
    });
    await contentStorage.saveSessionProgress({
        sessionCount: 3,
        totalUnfollowed: 7,
        undoQueue: [{ id: '1', username: 'a-user' }]
    });
    await contentStorage.saveWatchList([{ username: 'a-watch' }]);
    await contentStorage.saveRunCheckpoint({ version: 1, userId: 'account-a' });
    await contentStorage.addRunActivity({ username: 'a-processed', action: 'dry-run' });

    accountStorage.setScope('account-b');
    await accountStorage.migrateLegacy();
    const stateB = blankState();
    await contentStorage.loadState(stateB);

    assert.equal(stateB.sessionCount, 0);
    assert.equal(stateB.totalUnfollowed, 0);
    assert.equal(JSON.stringify(stateB.keywords), '[]');
    assert.equal(stateB.isPremium, true);
    assert.equal(JSON.stringify(await contentStorage.getWatchList()), '[]');
    assert.equal(await contentStorage.getRunCheckpoint(), null);
    assert.equal(JSON.stringify(await contentStorage.getRunActivity()), '[]');

    accountStorage.setScope('account-a');
    const stateA = blankState();
    await contentStorage.loadState(stateA);

    assert.equal(stateA.sessionCount, 3);
    assert.equal(stateA.totalUnfollowed, 7);
    assert.equal(JSON.stringify(stateA.keywords), JSON.stringify(['a-keyword']));
    assert.equal(JSON.stringify(stateA.undoQueue), JSON.stringify([{ id: '1', username: 'a-user' }]));
    assert.equal(JSON.stringify(await contentStorage.getWatchList()), JSON.stringify([{ username: 'a-watch' }]));
    assert.equal((await contentStorage.getRunCheckpoint()).userId, 'account-a');
    assert.equal((await contentStorage.getRunActivity())[0].username, 'a-processed');
});

test('legacy values flow through migration into the real content state once', async () => {
    const { constants, accountStorage, contentStorage, stored } = loadStorageStack({
        igSessionCount: 4,
        igTotalUnfollowed: 9,
        igKeywords: ['legacy-keyword'],
        igTestComplete: true
    });
    const SK = constants.STORAGE_KEYS;
    accountStorage.setScope('legacy-account');

    assert.equal(await accountStorage.migrateLegacy(), true);
    const state = blankState();
    await contentStorage.loadState(state);

    assert.equal(state.sessionCount, 4);
    assert.equal(state.totalUnfollowed, 9);
    assert.equal(JSON.stringify(state.keywords), JSON.stringify(['legacy-keyword']));
    assert.equal(stored[SK.SESSION_COUNT], undefined);
    assert.equal(stored.igTestComplete, undefined);
    assert.equal(await accountStorage.migrateLegacy(), false);
});

test('processed-user activity is capped to the popup display limit', async () => {
    const { constants, accountStorage, contentStorage } = loadStorageStack();
    accountStorage.setScope('activity-account');

    for (let index = 0; index < constants.LIMITS.MAX_USER_LIST_DISPLAY + 5; index++) {
        await contentStorage.addRunActivity({ username: `user-${index}`, action: 'dry-run' });
    }

    const activity = await contentStorage.getRunActivity();
    assert.equal(activity.length, constants.LIMITS.MAX_USER_LIST_DISPLAY);
    assert.equal(activity[0].username, 'user-5');
});
