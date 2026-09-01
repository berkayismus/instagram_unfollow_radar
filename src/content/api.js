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
    constructor(reason = 'invalid_payload', status = null, contentType = null) {
        super('Instagram returned an invalid response', 'invalid_response', { status });
        this.reason = reason;
        this.contentType = contentType;
    }
}

class APIRequestError extends InstagramAPIError {
    constructor(status = null, reason = null) {
        super('Instagram API request failed', 'api_error', { status });
        this.reason = reason;
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
            'X-ASBD-ID':         '129477',
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
        if (!data || typeof data !== 'object') throw new InvalidResponseError('invalid_payload');
        if (data.status !== 'fail') return data;
        const serialized = JSON.stringify(data);
        throw classifyFailure(null, serialized);
    }

    async function requestJSON(url, options, {
        allowEmptySuccess = false,
        allowPlainOkSuccess = false
    } = {}) {
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
        const contentType = response.headers && response.headers.get
            ? response.headers.get('content-type')
            : null;
        if (!text) {
            if (allowEmptySuccess) return {};
            throw new InvalidResponseError('empty_body', response.status, contentType);
        }
        if (/^\s*</.test(text)) {
            const finalUrl = response.url || '';
            if (response.redirected && finalUrl.includes('/accounts/login')) {
                throw new AuthenticationError(response.status);
            }
            throw new InvalidResponseError('html_response', response.status, contentType);
        }
        if (allowPlainOkSuccess && text.trim().toLowerCase() === 'ok') return {};

        let data;
        try {
            data = JSON.parse(text);
        } catch (_) {
            throw new InvalidResponseError('invalid_json', response.status, contentType);
        }
        return validatePayload(data);
    }

    async function getJSON(url, signal) {
        return requestJSON(url, { headers: getApiHeaders(), signal });
    }

    async function postJSON(kind, url, body = '', signal) {
        try {
            return await requestJSON(
                url,
                {
                    method: 'POST',
                    headers: {
                        ...getApiHeaders(),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body,
                    signal
                },
                { allowEmptySuccess: true, allowPlainOkSuccess: true }
            );
        } catch (err) {
            if (err) err.endpoint = kind;
            console.warn('[IGRadar] Instagram write request failed:', {
                endpoint: kind,
                code: err && err.code,
                status: err && err.status,
                reason: err && err.reason,
                contentType: err && err.contentType
            });
            throw err;
        }
    }

    function normalizeUserPage(data) {
        const payload = Array.isArray(data.users)
            ? data
            : data.data && Array.isArray(data.data.users)
                ? data.data
                : null;
        if (!payload) throw new InvalidResponseError('missing_users');
        return {
            users: payload.users,
            nextCursor: payload.next_max_id || payload.next_cursor || null
        };
    }

    async function fetchUserPage(kind, url, signal) {
        const maxAttempts = Constants.LIMITS.API_READ_MAX_ATTEMPTS || 2;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return normalizeUserPage(await getJSON(url, signal));
            } catch (err) {
                lastError = err;
                if (err) err.endpoint = kind;
                const canRetry = err && ['invalid_response', 'network_error', 'server_error']
                    .includes(err.code) && attempt < maxAttempts;
                console.warn('[IGRadar] Instagram read request failed:', {
                    endpoint: kind,
                    code: err && err.code,
                    status: err && err.status,
                    reason: err && err.reason,
                    contentType: err && err.contentType,
                    attempt,
                    willRetry: canRetry
                });
                if (!canRetry) break;
                const delay = Constants.TIMING.API_READ_RETRY_DELAY || 0;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }

    function normalizeFriendshipStatus(data) {
        const candidates = [
            data && data.friendship_status,
            data && data.data && data.data.friendship_status,
            data
        ];
        const status = candidates.find(candidate =>
            candidate && typeof candidate.following === 'boolean'
        );
        if (!status) throw new InvalidResponseError('missing_friendship_status');
        return { following: status.following };
    }

    async function fetchFriendshipStatus(userId, signal) {
        const kind = 'friendship_status';
        const maxAttempts = Constants.LIMITS.API_READ_MAX_ATTEMPTS || 2;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return normalizeFriendshipStatus(
                    await getJSON(Constants.API.FRIENDSHIP_STATUS(userId), signal)
                );
            } catch (err) {
                lastError = err;
                if (err) err.endpoint = kind;
                const canRetry = err && ['invalid_response', 'network_error', 'server_error']
                    .includes(err.code) && attempt < maxAttempts;
                if (!canRetry) break;
                const delay = Constants.TIMING.API_READ_RETRY_DELAY || 0;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }

    async function changeFriendship({
        userId,
        primaryKind,
        primaryUrl,
        fallbackKind,
        fallbackUrl,
        desiredFollowing,
        signal
    }) {
        const body = new URLSearchParams({
            container_module: 'profile',
            user_id: String(userId)
        }).toString();
        try {
            await postJSON(primaryKind, primaryUrl, body, signal);
            return true;
        } catch (err) {
            if (!err || err.code !== 'invalid_response' || err.reason !== 'html_response') {
                throw err;
            }
        }

        const beforeFallback = await fetchFriendshipStatus(userId, signal);
        if (beforeFallback.following === desiredFollowing) return true;

        await postJSON(fallbackKind, fallbackUrl, body, signal);
        const afterFallback = await fetchFriendshipStatus(userId, signal);
        if (afterFallback.following !== desiredFollowing) {
            const err = new APIRequestError(null, 'relationship_change_not_applied');
            err.endpoint = fallbackKind;
            throw err;
        }
        return true;
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
        return fetchUserPage(
            'following',
            `${Constants.API.FOLLOWING(userId)}?${params}`,
            signal
        );
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
        return fetchUserPage(
            'followers',
            `${Constants.API.FOLLOWERS(userId)}?${params}`,
            signal
        );
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
        return changeFriendship({
            userId,
            primaryKind: 'unfollow',
            primaryUrl: Constants.API.DESTROY(userId),
            fallbackKind: 'unfollow_fallback',
            fallbackUrl: Constants.API.WEB_DESTROY(userId),
            desiredFollowing: false,
            signal
        });
    }

    /**
     * Sends a re-follow (undo) request for the given user ID.
     * @param {string} userId
     * @param {AbortSignal} [signal]
     * @returns {Promise<boolean>}
     */
    async function refollowUser(userId, signal) {
        return changeFriendship({
            userId,
            primaryKind: 'refollow',
            primaryUrl: Constants.API.CREATE(userId),
            fallbackKind: 'refollow_fallback',
            fallbackUrl: Constants.API.WEB_CREATE(userId),
            desiredFollowing: true,
            signal
        });
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
