/**
 * @fileoverview Instagram Unfollow Radar - Watch list (follow activity)
 * @description Snapshot + diff of following lists for watched usernames.
 *   Runs only in the instagram.com content-script context.
 * @version 1.0.0
 */

const IGRadarWatchlist = (function() {
    'use strict';

    const WL = Constants.WATCH_LIST;

    /**
     * Keeps events inside the watch window: [watchStartedAt, watchStartedAt + 24h].
     * Legacy entries (no watchStartedAt) use rolling last-24h from now.
     *
     * @param {Object} entry
     * @param {number} detectedAt - ms
     * @returns {boolean}
     */
    function isDetectionInWatchWindow(entry, detectedAt) {
        if (entry.watchStartedAt != null) {
            const end = entry.watchStartedAt + WL.NEW_FOLLOW_RETENTION_MS;
            return detectedAt >= entry.watchStartedAt && detectedAt <= end;
        }
        return detectedAt > Date.now() - WL.NEW_FOLLOW_RETENTION_MS;
    }

    /**
     * @param {Array<Object>} entries
     */
    async function pruneRecentNewFollows(entries) {
        for (const e of entries) {
            if (!e.recentNewFollows) e.recentNewFollows = [];
            e.recentNewFollows = e.recentNewFollows.filter(x => isDetectionInWatchWindow(e, x.detectedAt));
        }
        return entries;
    }

    /**
     * @returns {Promise<Array>}
     */
    async function getList() {
        const list = await IGRadarStorage.getWatchList();
        return pruneRecentNewFollows([...list]);
    }

    function normalizeUsername(u) {
        return String(u || '').trim().replace(/^@/, '').toLowerCase();
    }

    /**
     * @param {string} rawUsername
     * @returns {Promise<{success: boolean, list?: Array, error?: string}>}
     */
    async function addUser(rawUsername) {
        const username = normalizeUsername(rawUsername);
        if (!username) return { success: false, error: 'empty' };

        try {
            let list = await IGRadarStorage.getWatchList();
            if (list.length >= WL.MAX_ENTRIES) return { success: false, error: 'max_entries' };
            if (list.some(x => x.username === username)) return { success: false, error: 'duplicate' };

            let profile;
            try {
                profile = await IGRadarAPI.fetchWebProfileInfo(username);
            } catch (err) {
                if (err && err.name === 'RateLimitError') return { success: false, error: 'rate_limit' };
                console.error('[IGRadar] watchlist addUser fetchWebProfileInfo:', err);
                return { success: false, error: 'network' };
            }
            if (!profile || !profile.userId) return { success: false, error: 'not_found' };

            const started = Date.now();
            list.push({
                username,
                userId:                   profile.userId,
                followingCount:           profile.followingCount,
                followersCount:           profile.followersCount,
                lastProfileFollowingCount: profile.followingCount,
                watchStartedAt:           started,
                watchSchema:              WL.ENTRY_SCHEMA,
                lastFollowingIds:         [],
                lastCheckedAt:            null,
                recentNewFollows:         [],
                partialSnapshot:          false,
                error:                    null
            });
            await IGRadarStorage.saveWatchList(list);
            return { success: true, list: await getList() };
        } catch (err) {
            console.error('[IGRadar] watchlist addUser:', err);
            return { success: false, error: 'unknown' };
        }
    }

    /**
     * @param {string} rawUsername
     * @param {AbortSignal} [signal]
     * @returns {Promise<{success: boolean, list?: Array, error?: string}>}
     */
    async function refreshUser(rawUsername, signal) {
        const username = normalizeUsername(rawUsername);
        let list       = await IGRadarStorage.getWatchList();
        const idx      = list.findIndex(x => x.username === username);
        if (idx === -1) return { success: false, error: 'not_in_list' };

        const entry = { ...list[idx] };

        if ((entry.watchSchema ?? 1) < WL.ENTRY_SCHEMA) {
            entry.recentNewFollows = [];
            entry.watchSchema      = WL.ENTRY_SCHEMA;
        }

        try {
            const profile = await IGRadarAPI.fetchWebProfileInfo(entry.username, signal);
            if (!profile || !profile.userId) {
                entry.error = 'profile_failed';
                list[idx]   = entry;
                await IGRadarStorage.saveWatchList(list);
                return { success: false, error: 'profile_failed', list: await getList() };
            }

            entry.userId         = profile.userId;
            const storedFollowingCount = entry.followingCount;
            const storedLastProf       = entry.lastProfileFollowingCount;
            entry.followingCount       = profile.followingCount;
            entry.followersCount       = profile.followersCount;

            const idToUsername = {};
            const idSet        = new Set();
            let cursor         = null;
            let pages          = 0;
            let partial        = false;

            while (pages < WL.MAX_PAGES_PER_REFRESH) {
                const result = await IGRadarAPI.fetchFollowingPage(entry.userId, cursor, signal);
                if (!result) break;
                for (const u of result.users) {
                    const id = String(u.pk != null ? u.pk : u.id);
                    idSet.add(id);
                    idToUsername[id] = u.username || id;
                }
                cursor = result.nextCursor;
                pages++;
                if (!cursor) break;
            }
            if (cursor) partial = true;

            const prevSet     = new Set(entry.lastFollowingIds || []);
            const isBaseline  = prevSet.size === 0;
            const now         = Date.now();
            const prevPartial = entry.partialSnapshot === true;

            /**
             * Incomplete fetch: do not change baseline (avoids false "new" on next full scan).
             */
            if (partial && !isBaseline) {
                entry.lastCheckedAt = now;
                entry.error         = null;
                list[idx]           = entry;
                await IGRadarStorage.saveWatchList(list);
                return { success: true, list: await getList() };
            }

            if (isBaseline) {
                entry.lastFollowingIds = Array.from(idSet);
                entry.partialSnapshot  = partial;
            } else if (prevPartial) {
                // Earlier baseline was partial; full list now — replace baseline, do not diff.
                entry.lastFollowingIds = Array.from(idSet);
                entry.partialSnapshot  = false;
                entry.recentNewFollows = [];
            } else {
                const existing  = entry.recentNewFollows ? [...entry.recentNewFollows] : [];
                const inWindow  = isDetectionInWatchWindow(entry, now);
                const lastProf  = storedLastProf != null
                    ? storedLastProf
                    : (storedFollowingCount != null ? storedFollowingCount : profile.followingCount);
                const profDelta = profile.followingCount - lastProf;

                const newIdsList = [...idSet].filter(id => !prevSet.has(id));

                let idsToRecord = [];
                if (inWindow && newIdsList.length > 0) {
                    if (profDelta === 0) {
                        console.warn(
                            '[IGRadar] watchlist: following count unchanged; ignoring set diff (API churn)'
                        );
                    } else if (profDelta < 0) {
                        // Net unfollows — do not add "new follow" rows
                    } else {
                        const maxNew = profDelta + WL.FOLLOW_COUNT_SLACK;
                        if (newIdsList.length <= maxNew) {
                            idsToRecord = newIdsList;
                        } else {
                            console.warn(
                                '[IGRadar] watchlist: too many new ids vs profile delta',
                                newIdsList.length,
                                profDelta
                            );
                        }
                    }
                }

                for (const id of idsToRecord) {
                    existing.push({
                        username:   idToUsername[id] || id,
                        detectedAt: now
                    });
                }
                entry.recentNewFollows = existing;
                entry.lastFollowingIds = Array.from(idSet);
                entry.partialSnapshot  = false;
            }

            entry.lastProfileFollowingCount = profile.followingCount;
            entry.lastCheckedAt             = now;
            entry.error                     = null;

            entry.recentNewFollows = (entry.recentNewFollows || []).filter(x =>
                isDetectionInWatchWindow(entry, x.detectedAt)
            );

            list[idx] = entry;
            await IGRadarStorage.saveWatchList(list);
            return { success: true, list: await getList() };
        } catch (err) {
            if (err && err.name === 'RateLimitError') {
                return { success: false, error: 'rate_limit', list: await getList() };
            }
            console.error('[IGRadar] watchlist refreshUser:', err);
            entry.error = 'unknown';
            list[idx]   = entry;
            await IGRadarStorage.saveWatchList(list);
            return { success: false, error: 'unknown', list: await getList() };
        }
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<{success: boolean, list?: Array, error?: string}>}
     */
    async function refreshAll(signal) {
        const list = await IGRadarStorage.getWatchList();
        if (!list.length) return { success: true, list: await getList() };

        for (const e of list) {
            const res = await refreshUser(e.username, signal);
            if (!res.success && res.error === 'rate_limit') return res;
        }
        return { success: true, list: await getList() };
    }

    return {
        getList,
        addUser,
        refreshUser,
        refreshAll,
        normalizeUsername
    };
})();
