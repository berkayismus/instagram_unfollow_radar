/**
 * @fileoverview Instagram Unfollow Radar - Background Service Worker
 * @description Coordinates extension-wide automation state.
 * @version 2.0.0
 */

importScripts('../shared/constants.js', '../shared/gumroadLicense.js');

const IGUnfollowRadarBackground = (function () {
    'use strict';

    const SK = Constants.STORAGE_KEYS.ACTIVE_RUN_LOCK;
    const LOCK_TTL = Constants.TIMING.RUN_LOCK_TTL;
    const LICENSE_ALARM = 'igLicenseRevalidation';
    let lockQueue = Promise.resolve();

    function serialiseLockOperation(operation) {
        const result = lockQueue.then(operation, operation);
        lockQueue = result.then(() => undefined, () => undefined);
        return result;
    }

    async function readActiveLock() {
        const data = await chrome.storage.local.get([SK]);
        const lock = data[SK] || null;
        if (!lock || lock.expiresAt <= Date.now()) {
            if (lock) await chrome.storage.local.remove(SK);
            return null;
        }
        return lock;
    }

    async function acquireLock(runId, tabId) {
        const active = await readActiveLock();
        if (active && active.tabId !== tabId) {
            return { success: false, error: 'run_already_active', lock: active };
        }

        const lock = {
            runId,
            tabId,
            acquiredAt: Date.now(),
            expiresAt: Date.now() + LOCK_TTL
        };
        await chrome.storage.local.set({ [SK]: lock });
        return { success: true, lock };
    }

    async function renewLock(runId, tabId) {
        const active = await readActiveLock();
        if (!active || active.runId !== runId || active.tabId !== tabId) {
            return { success: false, error: 'run_lock_lost' };
        }
        active.expiresAt = Date.now() + LOCK_TTL;
        await chrome.storage.local.set({ [SK]: active });
        return { success: true, lock: active };
    }

    async function releaseLock(runId, tabId) {
        const active = await readActiveLock();
        if (!active) return { success: true };
        if (active.runId !== runId || active.tabId !== tabId) {
            return { success: false, error: 'run_lock_not_owned' };
        }
        await chrome.storage.local.remove(SK);
        return { success: true };
    }

    function handleMessage(message, sender, sendResponse) {
        if (message.target !== 'background') return false;

        const tabId = sender.tab && sender.tab.id;
        if (tabId == null || !message.runId) {
            sendResponse({ success: false, error: 'invalid_lock_request' });
            return false;
        }

        const operations = {
            [Constants.ACTIONS.ACQUIRE_RUN_LOCK]: () => acquireLock(message.runId, tabId),
            [Constants.ACTIONS.RENEW_RUN_LOCK]:   () => renewLock(message.runId, tabId),
            [Constants.ACTIONS.RELEASE_RUN_LOCK]: () => releaseLock(message.runId, tabId)
        };
        const operation = operations[message.action];
        if (!operation) return false;

        serialiseLockOperation(operation)
            .then(sendResponse)
            .catch(error => {
                console.error('[IGRadar] Run lock operation failed:', error);
                sendResponse({ success: false, error: 'run_lock_error' });
            });
        return true;
    }

    async function broadcastLicenseState(result) {
        if (!chrome.tabs || !chrome.tabs.query) return;
        const data = await chrome.storage.local.get([
            Constants.STORAGE_KEYS.LICENSE_KEY,
            Constants.STORAGE_KEYS.LICENSE_EMAIL
        ]);
        const tabs = await chrome.tabs.query({ url: ['https://www.instagram.com/*'] });
        await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {
            action: Constants.ACTIONS.UPDATE_LICENSE,
            isPremium: result.isPremium === true,
            licenseKey: data[Constants.STORAGE_KEYS.LICENSE_KEY] || null,
            licenseEmail: data[Constants.STORAGE_KEYS.LICENSE_EMAIL] || null
        })));
    }

    function init() {
        console.log('🟣 Instagram Unfollow Radar - Background Service Worker initialized');
        chrome.runtime.onMessage.addListener(handleMessage);
        if (chrome.alarms) {
            chrome.alarms.create(LICENSE_ALARM, {
                periodInMinutes: Constants.GUMROAD.REVALIDATE_INTERVAL / 60000
            });
            chrome.alarms.onAlarm.addListener(alarm => {
                if (alarm.name !== LICENSE_ALARM) return;
                IGRadarGumroadLicense.revalidate()
                    .then(broadcastLicenseState)
                    .catch(err => {
                        console.error('[IGRadar] License revalidation failed:', err);
                    });
            });
        }
    }

    return { init };
})();

IGUnfollowRadarBackground.init();
