/**
 * @fileoverview Watch list slot limits (free vs Premium) — shared by popup + content.
 * @description Enforces max watched accounts in chrome.storage.local; no Instagram API.
 */

window.IGRadarWatchlistLimits = (function() {
    'use strict';

    /**
     * @param {boolean} isPremium
     * @returns {number}
     */
    function maxEntries(isPremium) {
        const WL = Constants.WATCH_LIST;
        return isPremium ? WL.MAX_ENTRIES_PREMIUM : WL.MAX_ENTRIES_FREE;
    }

    /**
     * Trims watch list to tier limit if needed (e.g. after Premium → Free).
     * @returns {Promise<{ list: Array, trimmed: boolean }>}
     */
    async function enforceStorageLimit() {
        const SK = Constants.STORAGE_KEYS;
        const data = await chrome.storage.local.get([SK.WATCH_LIST, SK.IS_PREMIUM]);
        const isPremium = data[SK.IS_PREMIUM] || false;
        const max       = maxEntries(isPremium);
        let list        = data[SK.WATCH_LIST] || [];
        if (list.length <= max) {
            return { list, trimmed: false };
        }
        list = list.slice(0, max);
        await chrome.storage.local.set({ [SK.WATCH_LIST]: list });
        return { list, trimmed: true };
    }

    return { maxEntries, enforceStorageLimit };
})();
