/**
 * @fileoverview Instagram Unfollow Radar - Auth Module
 * @description Handles Google Sign-In via chrome.identity API and communicates
 *   with the custom backend for JWT-based authentication and Paddle premium
 *   status verification.
 *
 *   Flow:
 *   1. signIn()  → chrome.identity.getAuthToken() → POST /auth/google → store JWT
 *   2. refreshPremium() → GET /user/premium (Bearer JWT) → update IS_PREMIUM
 *   3. openPaddleCheckout() → chrome.tabs.create(PADDLE.CHECKOUT_URL)
 * @version 1.0.0
 */

const IGRadarAuth = (function () {
    'use strict';

    // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

    /**
     * Returns the stored JWT token, or null if the user is not signed in.
     * @returns {Promise<string|null>}
     */
    async function _getToken() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.AUTH_TOKEN]);
        return data[Constants.STORAGE_KEYS.AUTH_TOKEN] || null;
    }

    /**
     * Makes an authenticated request to the backend.
     * @param {string} path - path relative to AUTH.BACKEND_URL
     * @param {RequestInit} [options]
     * @returns {Promise<Response>}
     */
    async function _backendFetch(path, options = {}) {
        const token = await _getToken();
        const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch(`${Constants.AUTH.BACKEND_URL}${path}`, { ...options, headers });
    }

    // ─── PUBLIC API ───────────────────────────────────────────────────────────

    /**
     * Initiates Google Sign-In via chrome.identity, exchanges the Google
     * access token for a backend JWT, then persists user info to storage.
     * @returns {Promise<{ success: boolean, user?: Object, error?: string }>}
     */
    async function signIn() {
        try {
            const googleToken = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(token);
                    }
                });
            });

            // Fetch real user info from Google using the access token
            const profileRes = await fetch(
                `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${encodeURIComponent(googleToken)}`
            );
            if (!profileRes.ok) {
                throw new Error('Failed to fetch Google profile');
            }
            const profile = await profileRes.json();

            const user = {
                email:  profile.email   || null,
                name:   profile.name    || null,
                avatar: profile.picture || null
            };

            // Store Google token as auth token until backend is available
            await chrome.storage.local.set({
                [Constants.STORAGE_KEYS.AUTH_TOKEN]:  googleToken,
                [Constants.STORAGE_KEYS.USER_EMAIL]:  user.email,
                [Constants.STORAGE_KEYS.USER_NAME]:   user.name,
                [Constants.STORAGE_KEYS.USER_AVATAR]: user.avatar
            });

            return { success: true, user };
        } catch (err) {
            console.error('[IGRadarAuth] signIn failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Revokes the cached Google token and clears all auth + premium data from storage.
     * @returns {Promise<void>}
     */
    async function signOut() {
        try {
            const token = await _getToken();
            if (token) {
                await new Promise((resolve) => {
                    chrome.identity.removeCachedAuthToken({ token }, resolve);
                });
            }
        } catch (_) {}

        await chrome.storage.local.remove([
            Constants.STORAGE_KEYS.AUTH_TOKEN,
            Constants.STORAGE_KEYS.USER_EMAIL,
            Constants.STORAGE_KEYS.USER_NAME,
            Constants.STORAGE_KEYS.USER_AVATAR,
            Constants.STORAGE_KEYS.IS_PREMIUM,
            Constants.STORAGE_KEYS.USER_PLAN_NAME,
            Constants.STORAGE_KEYS.USER_PLAN_RENEWS
        ]);
    }

    /**
     * Reads the stored user profile from local storage without any network call.
     * Returns null if the user is not signed in.
     * @returns {Promise<{ email: string, name: string, avatar: string }|null>}
     */
    async function getUser() {
        const data = await chrome.storage.local.get([
            Constants.STORAGE_KEYS.AUTH_TOKEN,
            Constants.STORAGE_KEYS.USER_EMAIL,
            Constants.STORAGE_KEYS.USER_NAME,
            Constants.STORAGE_KEYS.USER_AVATAR
        ]);
        if (!data[Constants.STORAGE_KEYS.AUTH_TOKEN]) return null;
        return {
            email:  data[Constants.STORAGE_KEYS.USER_EMAIL]  || null,
            name:   data[Constants.STORAGE_KEYS.USER_NAME]   || null,
            avatar: data[Constants.STORAGE_KEYS.USER_AVATAR] || null
        };
    }

    /**
     * Fetches the current premium status from the backend using the stored JWT,
     * then updates IS_PREMIUM (and plan info) in local storage.
     * Safe to call when the user is not signed in — will be a no-op.
     * @returns {Promise<{ isPremium: boolean, planName?: string, renewsAt?: string }>}
     */
    async function refreshPremium() {
        const token = await _getToken();
        if (!token) return { isPremium: false };

        try {
            const response = await _backendFetch('/user/premium');
            if (!response.ok) {
                if (response.status === 401) {
                    await chrome.storage.local.remove([Constants.STORAGE_KEYS.AUTH_TOKEN]);
                }
                return { isPremium: false };
            }
            const json = await response.json();
            const isPremium = json.isPremium === true;

            await chrome.storage.local.set({
                [Constants.STORAGE_KEYS.IS_PREMIUM]:       isPremium,
                [Constants.STORAGE_KEYS.USER_PLAN_NAME]:   json.planName  || null,
                [Constants.STORAGE_KEYS.USER_PLAN_RENEWS]: json.renewsAt  || null
            });

            return { isPremium, planName: json.planName, renewsAt: json.renewsAt };
        } catch (err) {
            console.error('[IGRadarAuth] refreshPremium failed:', err);
            return { isPremium: false };
        }
    }

    /**
     * Opens the Paddle checkout page in a new browser tab.
     * Requires the user to be signed in; appends the user email as a prefill
     * parameter when available.
     * @returns {Promise<void>}
     */
    async function openPaddleCheckout() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.USER_EMAIL]);
        const email = data[Constants.STORAGE_KEYS.USER_EMAIL];
        let url = Constants.PADDLE.CHECKOUT_URL;
        if (email) {
            url += (url.includes('?') ? '&' : '?') + `prefilled_email=${encodeURIComponent(email)}`;
        }
        await chrome.tabs.create({ url });
    }

    /**
     * Opens the Paddle subscription management page in a new tab.
     * @returns {Promise<void>}
     */
    async function openPaddleManage() {
        await chrome.tabs.create({ url: Constants.PADDLE.MANAGE_URL });
    }

    return {
        signIn,
        signOut,
        getUser,
        refreshPremium,
        openPaddleCheckout,
        openPaddleManage
    };
})();

if (typeof window !== 'undefined') window.IGRadarAuth = IGRadarAuth;
