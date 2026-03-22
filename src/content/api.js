/**
 * @fileoverview Instagram Unfollow Radar - API Layer
 * @description Pure fetch functions for Instagram's internal API.
 *   No mutable state. Every function that hits the network accepts an
 *   optional AbortSignal so callers can cancel in-flight requests.
 * @version 2.0.0
 */

/**
 * Thrown when the Instagram API responds with HTTP 429 (Too Many Requests).
 * Caught by automation.js to trigger the rate-limit pause flow.
 */
class RateLimitError extends Error {
    constructor() {
        super('Instagram rate limit reached (HTTP 429)');
        this.name = 'RateLimitError';
    }
}

const IGRadarAPI = (function() {
    'use strict';

    // ─── AUTH HELPERS ─────────────────────────────────────────────────────────

    /**
     * Reads a single cookie value from the current document.
     * @param {string} name
     * @returns {string|null}
     */
    function getCookie(name) {
        for (const part of document.cookie.split(';')) {
            const [k, v] = part.trim().split('=');
            if (k === name) return v ?? null;
        }
        return null;
    }

    /** @returns {string|null} Instagram user ID from the ds_user_id cookie */
    function getCurrentUserId() {
        return getCookie('ds_user_id');
    }

    /** @returns {Object} Headers required by all Instagram API calls */
    function getApiHeaders() {
        return {
            'X-IG-App-ID':      Constants.API.APP_ID,
            'X-CSRFToken':      getCookie('csrftoken') || '',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept':           '*/*'
        };
    }

    // ─── LOW-LEVEL FETCH WRAPPERS ─────────────────────────────────────────────

    /**
     * GETs a URL and returns the parsed JSON body.
     * Returns null on non-429 HTTP errors.
     * Throws RateLimitError on HTTP 429.
     * Propagates AbortError transparently when signal is aborted.
     *
     * @param {string} url
     * @param {AbortSignal} [signal]
     * @returns {Promise<Object|null>}
     */
    async function getJSON(url, signal) {
        const response = await fetch(url, { headers: getApiHeaders(), signal });
        if (response.status === 429) throw new RateLimitError();
        if (!response.ok) {
            console.error('[IGRadar] GET failed:', response.status, url);
            return null;
        }
        return response.json();
    }

    /**
     * POSTs to a URL with an optional URL-encoded body and returns parsed JSON.
     * Returns null on non-429 HTTP errors.
     * Throws RateLimitError on HTTP 429.
     *
     * @param {string} url
     * @param {string} [body='']
     * @param {AbortSignal} [signal]
     * @returns {Promise<Object|null>}
     */
    async function postJSON(url, body = '', signal) {
        const response = await fetch(url, {
            method:  'POST',
            headers: { ...getApiHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal
        });
        if (response.status === 429) throw new RateLimitError();
        if (!response.ok) {
            console.error('[IGRadar] POST failed:', response.status, url);
            return null;
        }
        return response.json();
    }

    // ─── INSTAGRAM ENDPOINTS ──────────────────────────────────────────────────

    /**
     * Fetches one page of accounts the user is following.
     * @param {string} userId
     * @param {string|null} cursor - max_id pagination cursor
     * @param {AbortSignal} [signal]
     * @returns {Promise<{users: Array, nextCursor: string|null}|null>}
     */
    async function fetchFollowingPage(userId, cursor, signal) {
        const params = new URLSearchParams({ count: Constants.LIMITS.SCAN_PAGE_SIZE });
        if (cursor) params.append('max_id', cursor);
        const data = await getJSON(`${Constants.API.FOLLOWING(userId)}?${params}`, signal);
        if (!data) return null;
        return { users: data.users || [], nextCursor: data.next_max_id || null };
    }

    /**
     * Fetches one page of the user's followers.
     * @param {string} userId
     * @param {string|null} cursor
     * @param {AbortSignal} [signal]
     * @returns {Promise<{users: Array, nextCursor: string|null}|null>}
     */
    async function fetchFollowersPage(userId, cursor, signal) {
        const params = new URLSearchParams({ count: Constants.LIMITS.SCAN_PAGE_SIZE });
        if (cursor) params.append('max_id', cursor);
        const data = await getJSON(`${Constants.API.FOLLOWERS(userId)}?${params}`, signal);
        if (!data) return null;
        return { users: data.users || [], nextCursor: data.next_max_id || null };
    }

    /**
     * Resolves a public username to profile metadata (requires instagram.com session).
     * @param {string} username - without @
     * @param {AbortSignal} [signal]
     * @returns {Promise<{userId: string, username: string, followingCount: number, followersCount: number}|null>}
     */
    async function fetchWebProfileInfo(username, signal) {
        const data = await getJSON(Constants.API.WEB_PROFILE_INFO(username), signal);
        if (!data || !data.data || !data.data.user) return null;
        const u = data.data.user;
        const userId = String(u.id || u.pk || '');
        if (!userId) return null;
        const edgeFollow   = u.edge_follow;
        const edgeFollowed = u.edge_followed_by;
        const followingCount = edgeFollow && typeof edgeFollow.count === 'number'
            ? edgeFollow.count
            : 0;
        const followersCount = edgeFollowed && typeof edgeFollowed.count === 'number'
            ? edgeFollowed.count
            : 0;
        return {
            userId,
            username: u.username || username,
            followingCount,
            followersCount
        };
    }

    /**
     * Sends an unfollow request for the given user ID.
     * @param {string} userId
     * @param {AbortSignal} [signal]
     * @returns {Promise<boolean>} true if the request succeeded
     */
    async function unfollowUser(userId, signal) {
        const data = await postJSON(Constants.API.DESTROY(userId), '', signal);
        return data !== null;
    }

    /**
     * Sends a re-follow (undo) request for the given user ID.
     * @param {string} userId
     * @param {AbortSignal} [signal]
     * @returns {Promise<boolean>}
     */
    async function refollowUser(userId, signal) {
        const data = await postJSON(Constants.API.CREATE(userId), '', signal);
        return data !== null;
    }

    return {
        getCurrentUserId,
        fetchFollowingPage,
        fetchFollowersPage,
        fetchWebProfileInfo,
        unfollowUser,
        refollowUser
    };
})();
