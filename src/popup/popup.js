/**
 * @fileoverview Instagram Unfollow Radar - Popup Entry Point
 * @description Initialises the popup, wires modules together, and routes
 *   incoming background messages to the appropriate UI handlers.
 *   All DOM manipulation lives in ui.js; all event handlers live in events.js.
 * @version 3.0.0
 */

(function() {
    'use strict';

    // ─── MESSAGE ROUTER ───────────────────────────────────────────────────────

    /**
     * Routes messages relayed from the content script through the background
     * service worker to the correct UI handler.
     * @param {Object} message
     */
    function handleMessage(message) {
        switch (message.type) {
            case Constants.MESSAGE_TYPES.STATUS_UPDATE:
                IGRadarUI.handleStatusUpdate(message);
                break;
            case Constants.MESSAGE_TYPES.TEST_COMPLETE:
                IGRadarUI.el.testModeAlert.style.display = 'block';
                IGRadarUI.updateStatus('stopped', `⏸ ${I18n.t('alerts.batchComplete')}`);
                break;
            case Constants.MESSAGE_TYPES.RATE_LIMIT_HIT:
                IGRadarUI.handleRateLimitMessage(message.data);
                break;
            case Constants.MESSAGE_TYPES.USER_PROCESSED:
                IGRadarUI.addUserToList(
                    message.data.username,
                    message.data.action,
                    message.data.timestamp
                );
                IGRadarUI.loadUndoQueue();
                break;
            default:
                break;
        }
    }

    // ─── AUTH LOADER ──────────────────────────────────────────────────────────

    /**
     * Reads the stored user and premium status, then renders both the header
     * auth bar and the premium tab in one pass.
     * Also silently refreshes premium status from the backend in the background.
     */
    async function loadAuthState() {
        const user      = await IGRadarAuth.getUser();
        const data      = await chrome.storage.local.get([
            Constants.STORAGE_KEYS.IS_PREMIUM,
            Constants.STORAGE_KEYS.USER_EMAIL,
            Constants.STORAGE_KEYS.USER_PLAN_NAME,
            Constants.STORAGE_KEYS.USER_PLAN_RENEWS
        ]);
        const isPremium = data[Constants.STORAGE_KEYS.IS_PREMIUM]       || false;
        const email     = data[Constants.STORAGE_KEYS.USER_EMAIL]        || null;
        const planInfo  = {
            planName:  data[Constants.STORAGE_KEYS.USER_PLAN_NAME]   || null,
            renewsAt:  data[Constants.STORAGE_KEYS.USER_PLAN_RENEWS] || null
        };

        IGRadarUI.renderAuthState(user, isPremium);
        IGRadarUI.renderPremiumStatus(isPremium, email, planInfo, !!user);

        // Silently refresh in background so next popup open has fresh data.
        if (user) {
            IGRadarAuth.refreshPremium().then(premium => {
                if (premium.isPremium !== isPremium) {
                    IGRadarUI.renderAuthState(user, premium.isPremium);
                    IGRadarUI.renderPremiumStatus(
                        premium.isPremium,
                        email,
                        premium,
                        true
                    );
                    IGRadarUI.loadStats();
                }
            }).catch(() => {});
        }
    }

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async function init() {
        IGRadarUI.cacheElements();
        await IGRadarUI.loadTheme();
        await I18n.init();

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        IGRadarEvents.setCurrentTab(tab);

        const isOnInstagram = tab && tab.url && tab.url.includes('instagram.com');

        if (!isOnInstagram) {
            IGRadarUI.updateStatus('error', `❌ ${I18n.t('messages.notOnInstagram')}`);
            IGRadarUI.el.startBtn.disabled = true;
        }

        await Promise.all([
            IGRadarUI.loadStats(),
            IGRadarUI.loadKeywords(),
            IGRadarUI.loadWhitelist(),
            IGRadarUI.loadDryRunMode(),
            IGRadarUI.loadUndoQueue(),
            loadAuthState()
        ]);

        const savedTab = await chrome.storage.local.get([Constants.STORAGE_KEYS.POPUP_ACTIVE_TAB]);
        const lastTab  = savedTab[Constants.STORAGE_KEYS.POPUP_ACTIVE_TAB];
        if (lastTab && Constants.UI.POPUP_TAB_IDS.includes(lastTab)) {
            IGRadarUI.switchTab(lastTab);
        }

        IGRadarEvents.setup();
        chrome.runtime.onMessage.addListener(handleMessage);

        if (isOnInstagram) {
            try {
                const res = await chrome.tabs.sendMessage(tab.id, {
                    action: Constants.ACTIONS.GET_STATUS
                });
                if (res && res.isRunning) IGRadarUI.setRunning(true);
                IGRadarUI.updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
            } catch (_) {
                IGRadarUI.updateStatus('ready', `⚠️ ${I18n.t('status.ready')}`);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
