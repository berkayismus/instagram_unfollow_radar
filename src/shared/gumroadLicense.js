/**
 * @fileoverview Gumroad Premium license verification and revalidation.
 */

const IGRadarGumroadLicense = (function() {
    'use strict';

    const SK = Constants.STORAGE_KEYS;

    function endedReason(purchase) {
        if (purchase.refunded === true) return 'refunded';
        if (purchase.disputed === true) return 'disputed';
        if (purchase.chargebacked === true) return 'chargebacked';
        if (purchase.subscription_ended_at) return 'subscription_ended';
        if (purchase.subscription_cancelled_at) return 'subscription_cancelled';
        if (purchase.subscription_failed_at) return 'subscription_failed';
        return null;
    }

    function evaluateResponse(json) {
        if (!json || json.success !== true || !json.purchase) {
            return { valid: false, reason: 'invalid' };
        }
        const reason = endedReason(json.purchase);
        if (reason) return { valid: false, reason };
        return {
            valid: true,
            reason: 'active',
            email: json.purchase.email || null
        };
    }

    async function requestVerification(licenseKey) {
        const body = new URLSearchParams({
            product_permalink: Constants.GUMROAD.PRODUCT_PERMALINK,
            license_key: licenseKey,
            increment_uses_count: 'false'
        });
        const response = await fetch(Constants.GUMROAD.VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        if (response.status >= 500) throw new Error(`Gumroad server error: ${response.status}`);
        if (response.status >= 400) return { valid: false, reason: 'invalid' };
        const json = await response.json();
        return evaluateResponse(json);
    }

    async function persistValid(licenseKey, result, now) {
        const graceUntil = now + Constants.GUMROAD.OFFLINE_GRACE_PERIOD;
        await chrome.storage.local.set({
            [SK.IS_PREMIUM]: true,
            [SK.LICENSE_KEY]: licenseKey,
            [SK.LICENSE_EMAIL]: result.email,
            [SK.LICENSE_LAST_CHECK]: now,
            [SK.LICENSE_GRACE_UNTIL]: graceUntil,
            [SK.LICENSE_STATUS]: 'active'
        });
        return { ...result, isPremium: true, graceUntil };
    }

    async function persistInvalid(reason, now) {
        await chrome.storage.local.set({
            [SK.IS_PREMIUM]: false,
            [SK.LICENSE_LAST_CHECK]: now,
            [SK.LICENSE_GRACE_UNTIL]: null,
            [SK.LICENSE_STATUS]: reason
        });
        return { valid: false, isPremium: false, reason };
    }

    async function activate(licenseKey) {
        const key = String(licenseKey || '').trim();
        if (!key) return { valid: false, isPremium: false, reason: 'invalid' };
        const result = await requestVerification(key);
        if (!result.valid) {
            const invalid = await persistInvalid(result.reason, Date.now());
            await chrome.storage.local.set({
                [SK.LICENSE_KEY]: null,
                [SK.LICENSE_EMAIL]: null
            });
            return invalid;
        }
        return persistValid(key, result, Date.now());
    }

    async function revalidate({ force = false } = {}) {
        const data = await chrome.storage.local.get([
            SK.IS_PREMIUM,
            SK.LICENSE_KEY,
            SK.LICENSE_EMAIL,
            SK.LICENSE_LAST_CHECK,
            SK.LICENSE_GRACE_UNTIL,
            SK.LICENSE_STATUS
        ]);
        const key = data[SK.LICENSE_KEY];
        if (!key) return { valid: false, isPremium: false, reason: 'missing' };

        const now = Date.now();
        let graceUntil = data[SK.LICENSE_GRACE_UNTIL] || 0;
        if (data[SK.IS_PREMIUM] && !graceUntil) {
            graceUntil = now + Constants.GUMROAD.OFFLINE_GRACE_PERIOD;
            await chrome.storage.local.set({ [SK.LICENSE_GRACE_UNTIL]: graceUntil });
        }
        const lastCheck = data[SK.LICENSE_LAST_CHECK] || 0;
        if (!force && data[SK.IS_PREMIUM] &&
            now - lastCheck < Constants.GUMROAD.REVALIDATE_INTERVAL) {
            return {
                valid: true,
                isPremium: true,
                reason: data[SK.LICENSE_STATUS] || 'active',
                email: data[SK.LICENSE_EMAIL] || null,
                cached: true
            };
        }

        try {
            const result = await requestVerification(key);
            if (!result.valid) return persistInvalid(result.reason, now);
            return persistValid(key, result, now);
        } catch (err) {
            if (data[SK.IS_PREMIUM] && now < graceUntil) {
                await chrome.storage.local.set({ [SK.LICENSE_STATUS]: 'offline_grace' });
                return {
                    valid: true,
                    isPremium: true,
                    reason: 'offline_grace',
                    email: data[SK.LICENSE_EMAIL] || null,
                    error: err
                };
            }
            return persistInvalid('offline_grace_expired', now);
        }
    }

    async function deactivate() {
        await chrome.storage.local.set({
            [SK.IS_PREMIUM]: false,
            [SK.LICENSE_KEY]: null,
            [SK.LICENSE_EMAIL]: null,
            [SK.LICENSE_LAST_CHECK]: null,
            [SK.LICENSE_GRACE_UNTIL]: null,
            [SK.LICENSE_STATUS]: 'deactivated'
        });
    }

    return { evaluateResponse, activate, revalidate, deactivate };
})();
