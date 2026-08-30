/**
 * @fileoverview Instagram Unfollow Radar - API Layer
 * @description Pure fetch functions for Instagram's internal API.
 *   No mutable state. Every function that hits the network accepts an
 *   optional AbortSignal so callers can cancel in-flight requests.
 * @version 2.0.0
 */

class InstagramAPIError extends Error {
    constructor(message, code, { status = null, retriable = false } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.status = status;
        this.retriable = retriable;
    }
}

class RateLimitError extends InstagramAPIError {
    constructor(status = 429) {
        super('Instagram rate limit reached', 'rate_limit', { status, retriable: true });
    }
}

class AuthenticationError extends InstagramAPIError {
    constructor(status = 401) {
        super('Instagram authentication required', 'auth_required', { status });
    }
}

class ChallengeRequiredError extends InstagramAPIError {
    constructor(status = null) {
        super('Instagram challenge or checkpoint required', 'challenge_required', { status });
    }
}

class NetworkError extends InstagramAPIError {
    constructor(cause) {
        super('Instagram network request failed', 'network_error', { retriable: true });
        this.cause = cause;
    }
}

class ServerError extends InstagramAPIError {
    constructor(status) {
        super('Instagram server error', 'server_error', { status, retriable: true });
    }
}

class InvalidResponseError extends InstagramAPIError {
    constructor() {
        super('Instagram returned an invalid response', 'invalid_response');
    }
}

class APIRequestError extends InstagramAPIError {
    constructor(status = null) {
        super('Instagram API request failed', 'api_error', { status });
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
            'X-IG-App-ID':       Constants.API.APP_ID,
            'X-CSRFToken':       getCookie('csrftoken') || '',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Instagram-AJAX':  '1',
            'Accept':            '*/*',
            'Referer':           'https://www.instagram.com/'
        };
    }

    // ─── LOW-LEVEL FETCH WRAPPERS ─────────────────────────────────────────────

    function bodySignals(text, patterns) {
        const normalized = String(text || '').toLowerCase();
        return patterns.some(pattern => normalized.includes(pattern));
    }

    function classifyFailure(status, text) {
        if (status === 429) return new RateLimitError(status);
        if (status >= 500) return new ServerError(status);
        if (bodySignals(text, ['challenge_required', 'checkpoint_required', 'checkpoint_url',
            'consent_required'])) {
            return new ChallengeRequiredError(status);
        }
        if (bodySignals(text, ['feedback_required', 'please wait a few minutes'])) {
            return new RateLimitError(status);
        }
        if (status === 401 || status === 403 ||
            bodySignals(text, ['login_required', 'not logged in'])) {
            return new AuthenticationError(status);
        }
        return new APIRequestError(status);
    }

    function validatePayload(data) {
        if (!data || typeof data !== 'object') throw new InvalidResponseError();
        if (data.status !== 'fail') return data;
        const serialized = JSON.stringify(data);
        throw classifyFailure(null, serialized);
    }

    async function requestJSON(url, options) {
        let response;
        try {
            response = await fetch(url, { ...options, credentials: 'include' });
        } catch (err) {
            if (err && err.name === 'AbortError') throw err;
            throw new NetworkError(err);
        }

        let text;
        try {
            text = await response.text();
        } catch (err) {
            if (err && err.name === 'AbortError') throw err;
            throw new NetworkError(err);
        }
        if (!response.ok) throw classifyFailure(response.status, text);
        if (!text) throw new InvalidResponseError();

        let data;
        try {
            data = JSON.parse(text);
        } catch (_) {
            throw new InvalidResponseError();
        }
        return validatePayload(data);
    }

    async function getJSON(url, signal) {
        return requestJSON(url, { headers: getApiHeaders(), signal });
    }

    async function postJSON(url, body = '', signal) {
        return requestJSON(url, {
            method: 'POST',
            headers: { ...getApiHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal
        });
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
        if (!Array.isArray(data.users)) throw new InvalidResponseError();
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
        if (!Array.isArray(data.users)) throw new InvalidResponseError();
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
        const u = data.data && data.data.user;
        if (!u) return null;
        const rawId = u.pk != null && u.pk !== '' ? u.pk : u.id;
        const userId = rawId != null && rawId !== '' ? String(rawId) : '';
        if (!userId || userId === 'undefined') return null;
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
        await postJSON(Constants.API.DESTROY(userId), '', signal);
        return true;
    }

    /**
     * Sends a re-follow (undo) request for the given user ID.
     * @param {string} userId
     * @param {AbortSignal} [signal]
     * @returns {Promise<boolean>}
     */
    async function refollowUser(userId, signal) {
        await postJSON(Constants.API.CREATE(userId), '', signal);
        return true;
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
