const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadBackground() {
    let listener;
    let now = 1000;
    const values = {};
    const context = vm.createContext({
        Constants: {
            ACTIONS: {
                ACQUIRE_RUN_LOCK: 'ACQUIRE_RUN_LOCK',
                RENEW_RUN_LOCK: 'RENEW_RUN_LOCK',
                RELEASE_RUN_LOCK: 'RELEASE_RUN_LOCK'
            },
            STORAGE_KEYS: { ACTIVE_RUN_LOCK: 'igActiveRunLock' },
            TIMING: { RUN_LOCK_TTL: 45000 }
        },
        Date: { now: () => now },
        chrome: {
            runtime: {
                onMessage: { addListener: callback => { listener = callback; } }
            },
            storage: {
                local: {
                    async get(keys) {
                        return Object.fromEntries(keys.map(key => [key, values[key]]));
                    },
                    async remove(key) {
                        delete values[key];
                    },
                    async set(update) {
                        await new Promise(resolve => setImmediate(resolve));
                        Object.assign(values, update);
                    }
                }
            }
        },
        console,
        importScripts: () => {}
    });

    const source = fs.readFileSync(path.join(root, 'src/background/index.js'), 'utf8');
    vm.runInContext(source, context);

    return {
        advance(ms) { now += ms; },
        send(action, runId, tabId) {
            return new Promise(resolve => {
                listener(
                    { target: 'background', action, runId },
                    { tab: { id: tabId } },
                    resolve
                );
            });
        },
        values
    };
}

test('only one tab can acquire the automation lock concurrently', async () => {
    const background = loadBackground();

    const [first, second] = await Promise.all([
        background.send('ACQUIRE_RUN_LOCK', 'run-a', 11),
        background.send('ACQUIRE_RUN_LOCK', 'run-b', 22)
    ]);

    assert.equal(first.success, true);
    assert.equal(second.success, false);
    assert.equal(second.error, 'run_already_active');
    assert.equal(background.values.igActiveRunLock.runId, 'run-a');
});

test('a lock can only be renewed and released by its owning run', async () => {
    const background = loadBackground();
    await background.send('ACQUIRE_RUN_LOCK', 'owner', 11);

    const foreignRenew = await background.send('RENEW_RUN_LOCK', 'foreign', 22);
    const foreignRelease = await background.send('RELEASE_RUN_LOCK', 'foreign', 22);
    const ownerRelease = await background.send('RELEASE_RUN_LOCK', 'owner', 11);

    assert.equal(foreignRenew.success, false);
    assert.equal(foreignRenew.error, 'run_lock_lost');
    assert.equal(foreignRelease.success, false);
    assert.equal(foreignRelease.error, 'run_lock_not_owned');
    assert.equal(ownerRelease.success, true);
    assert.equal(background.values.igActiveRunLock, undefined);
});

test('an expired lock does not block a new tab', async () => {
    const background = loadBackground();
    await background.send('ACQUIRE_RUN_LOCK', 'expired', 11);
    background.advance(45001);

    const result = await background.send('ACQUIRE_RUN_LOCK', 'replacement', 22);

    assert.equal(result.success, true);
    assert.equal(background.values.igActiveRunLock.runId, 'replacement');
    assert.equal(background.values.igActiveRunLock.tabId, 22);
});
