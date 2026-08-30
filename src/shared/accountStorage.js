/**
 * @fileoverview Account-scoped chrome.storage.local adapter.
 * @description Keeps Instagram-dependent data isolated by ds_user_id while
 *   leaving extension-wide preferences and license state global.
 */

window.IGRadarAccountStorage = (function() {
    'use strict';

    const SK = Constants.STORAGE_KEYS;
    const SCOPED_KEYS = new Set([
        SK.SESSION_COUNT,
        SK.SESSION_START,
        SK.TOTAL_UNFOLLOWED,
        SK.LAST_RUN,
        SK.TEST_MODE,
        SK.TEST_COMPLETE,
        SK.KEYWORDS,
        SK.WHITELIST,
        SK.DRY_RUN_MODE,
        SK.UNDO_QUEUE,
        SK.RATE_LIMIT_UNTIL,
        SK.UNFOLLOW_STATS,
        SK.UNFOLLOW_HISTORY,
        SK.WATCH_LIST,
        SK.RUN_CHECKPOINT
    ]);
    const MIGRATION_PREFIX = 'igAccountStorageMigrated';
    let currentUserId = null;

    function setScope(userId) {
        currentUserId = userId == null ? null : String(userId);
    }

    function getScope() {
        return currentUserId;
    }

    function physicalKey(key, userId = currentUserId) {
        if (!SCOPED_KEYS.has(key)) return key;
        if (!userId) return null;
        return `${key}::account::${encodeURIComponent(userId)}`;
    }

    function normalizeKeys(keys) {
        if (Array.isArray(keys)) return keys;
        if (typeof keys === 'string') return [keys];
        return Object.keys(keys || {});
    }

    async function get(keys) {
        const logicalKeys = normalizeKeys(keys);
        const pairs = logicalKeys
            .map(key => [key, physicalKey(key)])
            .filter(([, key]) => key != null);
        const stored = await chrome.storage.local.get(pairs.map(([, key]) => key));
        const result = {};
        for (const [logical, physical] of pairs) {
            if (stored[physical] !== undefined) result[logical] = stored[physical];
        }
        return result;
    }

    async function set(values) {
        const stored = {};
        for (const [logical, value] of Object.entries(values)) {
            const physical = physicalKey(logical);
            if (!physical) throw new Error(`Storage scope required for ${logical}`);
            stored[physical] = value;
        }
        await chrome.storage.local.set(stored);
    }

    async function remove(keys) {
        const physicalKeys = normalizeKeys(keys)
            .map(key => physicalKey(key))
            .filter(Boolean);
        if (physicalKeys.length) await chrome.storage.local.remove(physicalKeys);
    }

    async function migrateLegacy() {
        if (!currentUserId) return false;
        const markerKey = `${MIGRATION_PREFIX}::${encodeURIComponent(currentUserId)}`;
        const logicalKeys = Array.from(SCOPED_KEYS);
        const physicalKeys = logicalKeys.map(key => physicalKey(key));
        const data = await chrome.storage.local.get([markerKey, ...logicalKeys, ...physicalKeys]);
        if (data[markerKey]) return false;

        const writes = { [markerKey]: true };
        const legacyKeys = logicalKeys.filter(key => data[key] !== undefined);
        logicalKeys.forEach((logical, index) => {
            const physical = physicalKeys[index];
            if (data[physical] === undefined && data[logical] !== undefined) {
                writes[physical] = data[logical];
            }
        });

        await chrome.storage.local.set(writes);
        if (legacyKeys.length) await chrome.storage.local.remove(legacyKeys);
        return legacyKeys.length > 0;
    }

    return { setScope, getScope, get, set, remove, migrateLegacy };
})();
