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

    // ─── RATE LIMIT ───────────────────────────────────────────────────────────

    /**
     * Pauses the session and schedules an automatic resume after the cool-down
     * window defined in Constants.TIMING.RATE_LIMIT_WAIT.
     *
     * @param {Object}   state
     * @param {Function} sendStatus
     */
    async function handleRateLimit(state, sendStatus) {
        const until          = Date.now() + Constants.TIMING.RATE_LIMIT_WAIT;
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

        setTimeout(async() => {
            if (state.rateLimitUntil && Date.now() >= state.rateLimitUntil) {
                state.rateLimitUntil = null;
                state.isPaused       = false;
                await IGRadarStorage.clearRateLimit();
                if (state.isRunning) sendStatus(Constants.STATUS.RESUMED);
            }
        }, Constants.TIMING.RATE_LIMIT_WAIT);
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
        if (state.dryRunMode) {
            await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
            state.sessionCount++;
            sendStatus(Constants.STATUS.UNFOLLOWED, { username: user.username, dryRun: true });
            chrome.runtime.sendMessage({
                type: Constants.MESSAGE_TYPES.USER_PROCESSED,
                data: {
                    username:  user.username,
                    action:    Constants.USER_ACTIONS.DRY_RUN,
                    timestamp: Date.now()
                }
            });
            await IGRadarStorage.updateDailyStats();
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
    async function buildFollowerSet(userId, state, sendStatus) {
        const followerSet = new Set();
        let cursor        = null;
        const signal      = state.abortController && state.abortController.signal;

        do {
            if (!state.isRunning) break;

            sendStatus(Constants.STATUS.SCANNING, {
                phase: 'buildingFollowers',
                followerCount: followerSet.size
            });

            const result = await IGRadarAPI.fetchFollowersPage(userId, cursor, signal);
            if (!result) break;

            result.users.forEach(u => followerSet.add(String(u.pk || u.id)));
            cursor = result.nextCursor;

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
     * @returns {Promise<{nextCursor: string|null, fetched: number}|null>}
     */
    async function scanPage(userId, cursor, followerSet, state, sendStatus) {
        const signal = state.abortController && state.abortController.signal;
        const result = await IGRadarAPI.fetchFollowingPage(userId, cursor, signal);
        if (!result) return null;

        const { users, nextCursor } = result;
        if (users.length === 0) return { nextCursor: null, fetched: 0 };

        sendStatus(Constants.STATUS.SCANNING, { queueSize: state.unfollowQueue.length });

        for (const user of users) {
            if (state.processedUsers.has(user.username)) continue;
            state.processedUsers.add(user.username);

            const pk = String(user.pk || user.id);
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

        sendStatus(Constants.STATUS.SCANNING, { queueSize: state.unfollowQueue.length });
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
        sendStatus(Constants.STATUS.STARTED);

        const userId = IGRadarAPI.getCurrentUserId();
        if (!userId) {
            console.error('[IGRadar] Not logged in — ds_user_id cookie missing');
            sendStatus(Constants.STATUS.ERROR, { message: 'Not logged in' });
            state.isRunning = false;
            return;
        }

        // ── Phase 1: build follower set ────────────────────────────────────────
        let followerSet;
        try {
            followerSet = await buildFollowerSet(userId, state, sendStatus);
        } catch (err) {
            if (err.name === 'AbortError') return;
            if (err instanceof RateLimitError) {
                await handleRateLimit(state, sendStatus);
                return;
            }
            throw err;
        }

        if (!state.isRunning) return;

        // ── Phase 2: scan following list + process queue ───────────────────────
        let cursor  = null;
        let hasMore = true;

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
            if (state.sessionCount >= Constants.LIMITS.MAX_SESSION) {
                state.isRunning = false;
                sendStatus(Constants.STATUS.LIMIT_REACHED);
                break;
            }

            // Batch (test-mode) milestone guard
            if (state.testMode && !state.testComplete &&
                state.sessionCount >= Constants.LIMITS.BATCH_SIZE) {
                state.isPaused = true;
                chrome.runtime.sendMessage({ type: Constants.MESSAGE_TYPES.TEST_COMPLETE });
                sendStatus(Constants.STATUS.TEST_COMPLETE);
                return;
            }

            // Fetch next page when queue is drained and pages remain
            if (state.unfollowQueue.length === 0 && hasMore) {
                try {
                    const scanResult = await scanPage(userId, cursor, followerSet, state, sendStatus);
                    if (scanResult) {
                        cursor  = scanResult.nextCursor;
                        hasMore = !!scanResult.nextCursor;
                    } else {
                        await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
                        continue;
                    }
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    if (err instanceof RateLimitError) {
                        await handleRateLimit(state, sendStatus);
                        continue;
                    }
                    throw err;
                }
                await randomDelay(Constants.TIMING.MIN_DELAY, Constants.TIMING.MAX_DELAY);
            }

            // Drain queue
            while (state.unfollowQueue.length > 0 && state.isRunning && !state.isPaused) {
                if (state.sessionCount >= Constants.LIMITS.MAX_SESSION) break;
                if (state.testMode && !state.testComplete &&
                    state.sessionCount >= Constants.LIMITS.BATCH_SIZE) {
                    state.isPaused = true;
                    chrome.runtime.sendMessage({ type: Constants.MESSAGE_TYPES.TEST_COMPLETE });
                    sendStatus(Constants.STATUS.TEST_COMPLETE);
                    return;
                }

                const user   = state.unfollowQueue.shift();
                const signal = state.abortController && state.abortController.signal;
                try {
                    await processUnfollow(user, state, sendStatus, signal);
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    if (err instanceof RateLimitError) {
                        await handleRateLimit(state, sendStatus);
                        break;
                    }
                    console.error('[IGRadar] Unfollow error:', err);
                }

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
                sendStatus(Constants.STATUS.COMPLETED);
                break;
            }
        }
    }

    return { mainLoop };
})();
