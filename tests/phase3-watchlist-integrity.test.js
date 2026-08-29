const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));

function loadWatchlist({ initialList, api, maxPages = 1 }) {
    let stored = clone(initialList);
    const context = vm.createContext({
        Constants: {
            WATCH_LIST: {
                ENTRY_SCHEMA: 4,
                FOLLOW_COUNT_SLACK: 1,
                MAX_ENTRIES_FREE: 1,
                MAX_ENTRIES_PREMIUM: 10,
                MAX_PAGES_PER_REFRESH: maxPages,
                NEW_FOLLOW_RETENTION_MS: 24 * 60 * 60 * 1000
            }
        },
        IGRadarAPI: api,
        IGRadarStorage: {
            async getWatchList() { return clone(stored); },
            async saveWatchList(list) { stored = clone(list); }
        },
        IGRadarWatchlistLimits: { maxEntries: premium => premium ? 10 : 1 },
        console
    });

    const source = fs.readFileSync(path.join(root, 'src/content/watchlist.js'), 'utf8');
    vm.runInContext(source, context);

    return {
        module: vm.runInContext('IGRadarWatchlist', context),
        stored: () => clone(stored)
    };
}

function watchedEntry(overrides = {}) {
    return {
        username: 'watched',
        userId: '42',
        followingCount: 1,
        followersCount: 10,
        lastProfileFollowingCount: 1,
        watchStartedAt: Date.now(),
        watchSchema: 4,
        lastFollowingIds: ['old-id'],
        snapshotReady: true,
        lastCheckedAt: Date.now() - 1000,
        recentNewFollows: [],
        partialSnapshot: false,
        error: null,
        ...overrides
    };
}

test('a truncated refresh preserves the last complete watchlist baseline', async () => {
    const watchlist = loadWatchlist({
        initialList: [watchedEntry()],
        api: {
            fetchWebProfileInfo: async () => ({
                userId: '42', username: 'watched', followingCount: 2, followersCount: 10
            }),
            fetchFollowingPage: async () => ({
                users: [{ id: 'new-id', username: 'new_user' }],
                nextCursor: 'more-pages'
            })
        }
    });

    const result = await watchlist.module.refreshUser('watched');
    const entry = watchlist.stored()[0];

    assert.equal(result.success, false);
    assert.equal(result.error, 'snapshot_incomplete');
    assert.deepEqual(entry.lastFollowingIds, ['old-id']);
    assert.equal(entry.snapshotReady, true);
    assert.equal(entry.partialSnapshot, false);
    assert.equal(entry.error, 'snapshot_incomplete');
    assert.deepEqual(entry.recentNewFollows, []);
});

test('a failed initial snapshot is not accepted as an empty baseline', async () => {
    const watchlist = loadWatchlist({
        initialList: [watchedEntry({
            lastFollowingIds: [],
            snapshotReady: false,
            lastCheckedAt: null
        })],
        api: {
            fetchWebProfileInfo: async () => ({
                userId: '42', username: 'watched', followingCount: 0, followersCount: 10
            }),
            fetchFollowingPage: async () => null
        }
    });

    const result = await watchlist.module.refreshUser('watched');
    const entry = watchlist.stored()[0];

    assert.equal(result.success, false);
    assert.equal(result.error, 'snapshot_failed');
    assert.equal(entry.snapshotReady, false);
    assert.equal(entry.partialSnapshot, true);
    assert.deepEqual(entry.lastFollowingIds, []);
});

test('profile count mismatch rejects a silently incomplete API response', async () => {
    const watchlist = loadWatchlist({
        initialList: [watchedEntry()],
        api: {
            fetchWebProfileInfo: async () => ({
                userId: '42', username: 'watched', followingCount: 20, followersCount: 10
            }),
            fetchFollowingPage: async () => ({
                users: [{ id: 'only-visible-id', username: 'visible_user' }],
                nextCursor: null
            })
        }
    });

    const result = await watchlist.module.refreshUser('watched');
    const entry = watchlist.stored()[0];

    assert.equal(result.success, false);
    assert.equal(result.error, 'snapshot_incomplete');
    assert.deepEqual(entry.lastFollowingIds, ['old-id']);
    assert.equal(entry.snapshotReady, true);
});

test('refresh and remove mutations are serialized so removal cannot be overwritten', async () => {
    let releaseProfile;
    const profileGate = new Promise(resolve => { releaseProfile = resolve; });
    const watchlist = loadWatchlist({
        initialList: [watchedEntry()],
        api: {
            fetchWebProfileInfo: async () => {
                await profileGate;
                return {
                    userId: '42', username: 'watched', followingCount: 1, followersCount: 10
                };
            },
            fetchFollowingPage: async () => ({
                users: [{ id: 'old-id', username: 'existing_user' }],
                nextCursor: null
            })
        }
    });

    const refresh = watchlist.module.refreshUser('watched');
    await new Promise(resolve => setImmediate(resolve));
    const remove = watchlist.module.removeUser('watched');
    releaseProfile();

    const [refreshResult, removeResult] = await Promise.all([refresh, remove]);

    assert.equal(refreshResult.success, true);
    assert.equal(removeResult.success, true);
    assert.deepEqual(watchlist.stored(), []);
});
