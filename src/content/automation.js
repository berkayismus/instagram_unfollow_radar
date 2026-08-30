/**
 * @fileoverview Instagram Unfollow Radar - Automation Engine
 * @description Orchestrates the two-phase scan-and-unfollow loop.
 *   Depends on IGRadarAPI, IGRadarStorage, IGRadarFilters (loaded before this
 *   file) and the RateLimitError class defined in api.js.
 *
 *   Phase 1 — buildFollowerSet: page-by-page download of the full followers list.
 *   Phase 2 — mainLoop: page-by-page scan of the following list; processes the
 *             unfollowQueue between fetches with human-like random delays.
 * @version 2.0.0
 */

const IGRadarAutomation = (function() {
    'use strict';

    class IncompleteFollowerScanError extends Error {
        constructor() {
            super('Follower scan did not complete');
            this.name = 'IncompleteFollowerScanError';
            this.code = 'followers_scan_incomplete';
        }
    }

    class AccountChangedError extends Error {
        constructor() {
            super('Active Instagram account changed during automation');
            this.name = 'AccountChangedError';
            this.code = 'account_changed';
        }
    }

    function assertActiveAccount(state) {
        if (!state.runUserId) return;
        const currentUserId = IGRadarAPI.getCurrentUserId();
        if (!currentUserId || String(currentUserId) !== String(state.runUserId)) {
            throw new AccountChangedError();
        }
    }

    // ─── UTILITIES ────────────────────────────────────────────────────────────

    /**
     * Returns a Promise that resolves after a random delay within [min, max] ms.
     * @param {number} min
     * @param {number} max
     * @returns {Promise<void>}
     */
    function randomDelay(min, max) {
        const ms = Math.floor(Math.random() * (max - min + 1)) + min;
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function isUsableCheckpoint(checkpoint, state, userId) {
        return !!checkpoint &&
            checkpoint.version === 1 &&
            String(checkpoint.userId) === String(userId) &&
            checkpoint.dryRunMode === state.dryRunMode &&
            Date.now() - checkpoint.updatedAt <= Constants.TIMING.CHECKPOINT_MAX_AGE;
    }

    async function persistCheckpoint(state, changes = {}) {
        state.runCheckpoint = {
            ...(state.runCheckpoint || {}),
            ...changes,
            version:      1,
            userId:       state.runUserId,
            dryRunMode:   state.dryRunMode,
            previewCount: state.previewCount || 0
        };
        try {
            await IGRadarStorage.saveRunCheckpoint(state.runCheckpoint);
        } catch (err) {
            console.warn('[IGRadar] Failed to persist run checkpoint:', err);
        }
    }

    async function clearCheckpoint(state) {
        state.runCheckpoint = null;
        await IGRadarStorage.clearRunCheckpoint();
    }

    // ─── RATE LIMIT ───────────────────────────────────────────────────────────

    /**
     * Pauses the session and waits until the persisted cool-down expires.
     * window defined in Constants.TIMING.RATE_LIMIT_WAIT.
     *
     * @param {Object}   state
     * @param {Function} sendStatus
     */
    async function handleRateLimit(state, sendStatus) {
        const existingUntil  = state.rateLimitUntil && state.rateLimitUntil > Date.now()
            ? state.rateLimitUntil
            : null;
        const until          = existingUntil || Date.now() + Constants.TIMING.RATE_LIMIT_WAIT;
        state.rateLimitUntil = until;
        state.isPaused       = true;

        await IGRadarStorage.setRateLimitUntil(until);

        chrome.runtime.sendMessage({
            type: Constants.MESSAGE_TYPES.RATE_LIMIT_HIT,
            data: { until, remainingMinutes: Constants.TIMING.RATE_LIMIT_MINUTES }
        });
        sendStatus(Constants.STATUS.RATE_LIMIT, {
            remainingMinutes: Constants.TIMING.RATE_LIMIT_MINUTES
        });
        await persistCheckpoint(state, { rateLimitUntil: until });

        while (state.isRunning && Date.now() < until) {
            const remaining = until - Date.now();
            const wait = Math.min(Constants.TIMING.PAUSE_CHECK_INTERVAL, remaining);
            await randomDelay(wait, wait);
        }

        if (!state.isRunning) return false;
        state.rateLimitUntil = null;
        state.isPaused       = false;
        await IGRadarStorage.clearRateLimit();
        await persistCheckpoint(state, { rateLimitUntil: null });
        sendStatus(Constants.STATUS.RESUMED);
        return true;
    }

    // ─── SINGLE UNFOLLOW ──────────────────────────────────────────────────────

    /**
     * Executes one unfollow action (real or dry-run), updates counters,
     * persists state, and broadcasts the result to the popup.
     *
     * @param {{ id: string, username: string }} user
     * @param {Object}      state
     * @param {Function}    sendStatus
     * @param {AbortSignal} [signal]
     * @returns {Promise<boolean>} true if the action succeeded
     */
    async function processUnfollow(user, state, sendStatus, signal) {
        assertActiveAccount(state);
        if (state.dryRunMode) {
            await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
            state.previewCount = (state.previewCount || 0) + 1;
            sendStatus(Constants.STATUS.UNFOLLOWED, { username: user.username, dryRun: true });
            chrome.runtime.sendMessage({
                type: Constants.MESSAGE_TYPES.USER_PROCESSED,
                data: {
                    username:  user.username,
                    action:    Constants.USER_ACTIONS.DRY_RUN,
                    timestamp: Date.now()
                }
            });
            return true;
        }

        const ok = await IGRadarAPI.unfollowUser(user.id, signal);
        if (!ok) return false;

        state.sessionCount++;
        state.totalUnfollowed++;
        state.undoQueue.push({ id: user.id, username: user.username, timestamp: Date.now() });
        if (state.undoQueue.length > Constants.LIMITS.MAX_UNDO_QUEUE) state.undoQueue.shift();

        await IGRadarStorage.saveSessionProgress(state);
        await IGRadarStorage.updateDailyStats();
        await IGRadarStorage.addToHistory(user.username, Constants.USER_ACTIONS.UNFOLLOWED);

        sendStatus(Constants.STATUS.UNFOLLOWED, { username: user.username });
        chrome.runtime.sendMessage({
            type: Constants.MESSAGE_TYPES.USER_PROCESSED,
            data: {
                username:  user.username,
                action:    Constants.USER_ACTIONS.UNFOLLOWED,
                timestamp: Date.now()
            }
        });
        return true;
    }

    // ─── PHASE 1 ──────────────────────────────────────────────────────────────

    /**
     * Downloads every page of the followers list and collects all PKs into a Set.
     * Reports progress via SCANNING status messages.
     *
     * @param {string}      userId
     * @param {Object}      state
     * @param {Function}    sendStatus
     * @returns {Promise<Set<string>>}
     */
    async function buildFollowerSet(userId, state, sendStatus, checkpoint) {
        const canResume   = checkpoint && checkpoint.phase === 'followers';
        const followerSet = new Set(canResume ? checkpoint.followerIds || [] : []);
        let cursor        = canResume ? checkpoint.followerCursor || null : null;
        const signal      = state.abortController && state.abortController.signal;

        do {
            if (!state.isRunning) break;
            assertActiveAccount(state);

            sendStatus(Constants.STATUS.SCANNING, {
                phase: 'buildingFollowers',
                followerCount: followerSet.size
            });

            const result = await IGRadarAPI.fetchFollowersPage(userId, cursor, signal);
            if (!result) throw new IncompleteFollowerScanError();

            result.users.forEach(u => followerSet.add(String(u.pk || u.id)));
            cursor = result.nextCursor;
            await persistCheckpoint(state, {
                phase:          'followers',
                followerIds:    Array.from(followerSet),
                followerCursor: cursor
            });

            if (cursor && state.isRunning) {
                await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
            }
        } while (cursor);

        console.log(`[IGRadar] Follower set ready: ${followerSet.size} followers`);
        return followerSet;
    }

    // ─── PHASE 2 HELPERS ─────────────────────────────────────────────────────

    /**
     * Fetches one page of the following list and pushes non-followers that pass
     * the filter check into state.unfollowQueue.
     *
     * @param {string}      userId
     * @param {string|null} cursor
     * @param {Set<string>} followerSet
     * @param {Object}      state
     * @param {Function}    sendStatus
     * @param {number}      totalScanned - cumulative users checked so far (for display)
     * @returns {Promise<{nextCursor: string|null, fetched: number}|null>}
     */
    async function scanPage(userId, cursor, followerSet, state, sendStatus, totalScanned) {
        assertActiveAccount(state);
        const signal = state.abortController && state.abortController.signal;
        const result = await IGRadarAPI.fetchFollowingPage(userId, cursor, signal);
        if (!result) return null;

        const { users, nextCursor } = result;
        if (users.length === 0) return { nextCursor: null, fetched: 0 };

        for (const user of users) {
            if (state.processedUsers.has(user.username)) continue;
            state.processedUsers.add(user.username);

            const pk = String(user.pk || user.id || '');
            if (followerSet.has(pk)) continue;

            const displayText       = `${user.username} ${user.full_name || ''}`;
            const { skip, reason }  = IGRadarFilters.shouldSkipUser(
                user.username, displayText, state.whitelist, state.keywords
            );

            if (skip) {
                chrome.runtime.sendMessage({
                    type: Constants.MESSAGE_TYPES.USER_PROCESSED,
                    data: { username: user.username, action: `skipped:${reason}`, timestamp: Date.now() }
                });
                continue;
            }

            state.unfollowQueue.push({ id: user.id, username: user.username });
        }

        sendStatus(Constants.STATUS.SCANNING, {
            queueSize:    state.unfollowQueue.length,
            totalScanned: totalScanned + users.length
        });
        return { nextCursor, fetched: users.length };
    }

    // ─── MAIN LOOP ────────────────────────────────────────────────────────────

    /**
     * Entry point for the automation session.
     * Loads persisted state, runs Phase 1 (follower set), then Phase 2 (unfollow sweep).
     *
     * @param {Object}   state
     * @param {Function} sendStatus
     */
    async function mainLoop(state, sendStatus) {
        await IGRadarStorage.loadState(state);
        state.dailyLimit = state.isPremium
            ? Constants.LIMITS.PREMIUM_DAILY_LIMIT
            : Constants.LIMITS.FREE_DAILY_LIMIT;
        sendStatus(Constants.STATUS.STARTED);

        const userId = IGRadarAPI.getCurrentUserId();
        if (!userId) {
            console.error('[IGRadar] Not logged in — ds_user_id cookie missing');
            sendStatus(Constants.STATUS.ERROR, { message: 'Not logged in' });
            state.isRunning = false;
            return;
        }
        if (!state.runUserId) state.runUserId = userId;
        if (String(userId) !== String(state.runUserId)) {
            state.isRunning = false;
            sendStatus(Constants.STATUS.ERROR, { message: 'account_changed' });
            return;
        }

        const storedCheckpoint = await IGRadarStorage.getRunCheckpoint();
        if (isUsableCheckpoint(storedCheckpoint, state, userId)) {
            state.runCheckpoint = storedCheckpoint;
            state.previewCount  = storedCheckpoint.previewCount || 0;
        } else {
            state.runCheckpoint = null;
            if (storedCheckpoint) await IGRadarStorage.clearRunCheckpoint();
        }

        if (state.rateLimitUntil && state.rateLimitUntil > Date.now()) {
            const resumed = await handleRateLimit(state, sendStatus);
            if (!resumed) return;
        }

        // ── Phase 1: build follower set ────────────────────────────────────────
        let followerSet;
        const checkpoint = state.runCheckpoint;
        try {
            if (checkpoint && checkpoint.phase === 'following') {
                followerSet = new Set(checkpoint.followerIds || []);
            } else {
                followerSet = await buildFollowerSet(userId, state, sendStatus, checkpoint);
                await persistCheckpoint(state, {
                    phase:              'following',
                    followerIds:        Array.from(followerSet),
                    followerCursor:     null,
                    followingCursor:    null,
                    hasMore:            true,
                    unfollowQueue:       [],
                    processedUsernames: [],
                    totalScanned:       0
                });
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            if (err instanceof RateLimitError) {
                const resumed = await handleRateLimit(state, sendStatus);
                if (resumed) return mainLoop(state, sendStatus);
                return;
            }
            if (err instanceof IncompleteFollowerScanError) {
                state.isRunning = false;
                await clearCheckpoint(state);
                sendStatus(Constants.STATUS.ERROR, { message: err.code });
                return;
            }
            if (err instanceof AccountChangedError) {
                state.isRunning = false;
                sendStatus(Constants.STATUS.ERROR, { message: err.code });
                return;
            }
            throw err;
        }

        if (!state.isRunning) return;

        // Brief pause between Phase 1 and Phase 2 to avoid back-to-back bursts
        await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
        if (!state.isRunning) return;

        // ── Phase 2: scan following list + process queue ───────────────────────
        const followingCheckpoint = state.runCheckpoint && state.runCheckpoint.phase === 'following'
            ? state.runCheckpoint
            : null;
        let cursor            = followingCheckpoint ? followingCheckpoint.followingCursor || null : null;
        let hasMore           = followingCheckpoint ? followingCheckpoint.hasMore !== false : true;
        let consecutiveErrors = 0;
        let totalScanned      = followingCheckpoint ? followingCheckpoint.totalScanned || 0 : 0;
        if (followingCheckpoint) {
            state.unfollowQueue = [...(followingCheckpoint.unfollowQueue || [])];
            state.processedUsers = new Set(followingCheckpoint.processedUsernames || []);
        }

        while (state.isRunning) {

            // Pause / rate-limit check
            if (state.isPaused) {
                await randomDelay(
                    Constants.TIMING.PAUSE_CHECK_INTERVAL,
                    Constants.TIMING.PAUSE_CHECK_INTERVAL
                );
                continue;
            }

            // Session limit guard
            if (!state.dryRunMode && state.sessionCount >= state.dailyLimit) {
                state.isRunning = false;
                await clearCheckpoint(state);
                sendStatus(Constants.STATUS.LIMIT_REACHED);
                break;
            }

            // Fetch next page when queue is drained and pages remain
            if (state.unfollowQueue.length === 0 && hasMore) {
                try {
                    const scanResult = await scanPage(userId, cursor, followerSet, state, sendStatus, totalScanned);
                    if (scanResult) {
                        consecutiveErrors  = 0;
                        totalScanned      += scanResult.fetched;
                        cursor             = scanResult.nextCursor;
                        hasMore            = !!scanResult.nextCursor;
                        await persistCheckpoint(state, {
                            phase:              'following',
                            followingCursor:    cursor,
                            hasMore,
                            unfollowQueue:       state.unfollowQueue,
                            processedUsernames: Array.from(state.processedUsers),
                            totalScanned
                        });
                    } else {
                        consecutiveErrors++;
                        console.warn(`[IGRadar] scanPage returned null (error ${consecutiveErrors}/3)`);
                        if (consecutiveErrors >= 3) {
                            console.error('[IGRadar] 3 consecutive scan failures — stopping');
                            sendStatus(Constants.STATUS.ERROR, { message: 'api_error' });
                            state.isRunning = false;
                            return;
                        }
                        await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
                        continue;
                    }
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    if (err instanceof AccountChangedError) {
                        state.isRunning = false;
                        sendStatus(Constants.STATUS.ERROR, { message: err.code });
                        return;
                    }
                    if (err instanceof RateLimitError) {
                        const resumed = await handleRateLimit(state, sendStatus);
                        if (!resumed) return;
                        continue;
                    }
                    throw err;
                }
                await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
            }

            // Drain queue
            while (state.unfollowQueue.length > 0 && state.isRunning && !state.isPaused) {
                if (!state.dryRunMode && state.sessionCount >= state.dailyLimit) break;
                const user   = state.unfollowQueue.shift();
                const signal = state.abortController && state.abortController.signal;
                try {
                    await processUnfollow(user, state, sendStatus, signal);
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    if (err instanceof AccountChangedError) {
                        state.isRunning = false;
                        sendStatus(Constants.STATUS.ERROR, { message: err.code });
                        return;
                    }
                    if (err instanceof RateLimitError) {
                        state.unfollowQueue.unshift(user);
                        await persistCheckpoint(state, {
                            unfollowQueue: state.unfollowQueue
                        });
                        const resumed = await handleRateLimit(state, sendStatus);
                        if (!resumed) return;
                        continue;
                    }
                    console.error('[IGRadar] Unfollow error:', err);
                }

                await persistCheckpoint(state, {
                    unfollowQueue:       state.unfollowQueue,
                    processedUsernames: Array.from(state.processedUsers),
                    totalScanned,
                    followingCursor:    cursor,
                    hasMore
                });

                await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);

                if (Math.random() < Constants.UI.HUMAN_PAUSE_PROBABILITY) {
                    await randomDelay(
                        Constants.TIMING.HUMAN_PAUSE_MIN,
                        Constants.TIMING.HUMAN_PAUSE_MAX
                    );
                }
            }

            // All done
            if (!hasMore && state.unfollowQueue.length === 0) {
                state.isRunning = false;
                await clearCheckpoint(state);
                sendStatus(Constants.STATUS.COMPLETED);
                break;
            }
        }
    }

    return { mainLoop };
})();
