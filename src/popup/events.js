/**
 * @fileoverview Instagram Unfollow Radar - Popup Event Handlers
 * @description All user-initiated event handlers and the setup() function
 *   that wires them to DOM elements. Communicates with the content script
 *   via chrome.tabs.sendMessage and delegates UI updates to IGRadarUI.
 * @version 2.0.0
 */

const IGRadarEvents = (function() {
    'use strict';

    let _currentTab = null;

    /** @param {chrome.tabs.Tab} tab */
    function setCurrentTab(tab) { _currentTab = tab; }

    /**
     * Safely sends a message to the Instagram content script on the active tab.
     * @param {Object} message
     * @returns {Promise<Object>}
     */
    function sendToContent(message) {
        return chrome.tabs.sendMessage(_currentTab.id, message);
    }

    // ─── MAIN CONTROLS ────────────────────────────────────────────────────────

    async function handleStart() {
        if (!_currentTab) return;
        try {
            await sendToContent({ action: Constants.ACTIONS.START });
            IGRadarUI.setRunning(true);
            IGRadarUI.clearUserList();
            IGRadarUI.updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
        } catch (err) {
            console.error('[IGRadar] Failed to start:', err);
            if (confirm(I18n.t('messages.confirmReload'))) {
                await chrome.tabs.reload(_currentTab.id);
                IGRadarUI.updateStatus('ready', `🔄 ${I18n.t('messages.pageReloaded')}`);
            } else {
                IGRadarUI.updateStatus('error', `❌ ${I18n.t('messages.startFailed')}`);
            }
        }
    }

    async function handleStop() {
        if (!_currentTab) return;
        try {
            await sendToContent({ action: Constants.ACTIONS.STOP });
            IGRadarUI.setRunning(false);
            IGRadarUI.updateStatus('stopped', `⏸ ${I18n.t('status.stopped')}`);
        } catch (err) {
            console.error('[IGRadar] Failed to stop:', err);
        }
    }

    async function handleContinue() {
        if (!_currentTab) return;
        try {
            await sendToContent({ action: Constants.ACTIONS.CONTINUE_TEST });
            IGRadarUI.el.testModeAlert.style.display = 'none';
            IGRadarUI.updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
        } catch (err) {
            console.error('[IGRadar] Failed to continue:', err);
        }
    }

    async function handleReset() {
        if (!confirm(I18n.t('messages.confirmReset'))) return;
        await chrome.storage.local.set({
            [Constants.STORAGE_KEYS.SESSION_COUNT]:    0,
            [Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED]: 0,
            [Constants.STORAGE_KEYS.SESSION_START]:    Date.now(),
            [Constants.STORAGE_KEYS.TEST_MODE]:        true,
            [Constants.STORAGE_KEYS.TEST_COMPLETE]:    false,
            [Constants.STORAGE_KEYS.UNDO_QUEUE]:       []
        });
        const d         = await chrome.storage.local.get([Constants.STORAGE_KEYS.IS_PREMIUM]);
        const isPremium = d[Constants.STORAGE_KEYS.IS_PREMIUM] || false;
        const limit     = isPremium
            ? Constants.LIMITS.PREMIUM_DAILY_LIMIT
            : Constants.LIMITS.FREE_DAILY_LIMIT;
        IGRadarUI.el.sessionCount.textContent        = `0/${limit}`;
        IGRadarUI.el.totalCount.textContent          = '0';
        IGRadarUI.el.lastRun.textContent             = '-';
        IGRadarUI.el.limitReachedAlert.style.display = 'none';
        IGRadarUI.el.startBtn.disabled               = false;
        IGRadarUI.clearUserList();
        IGRadarUI.updateUndoButton(0);
        IGRadarUI.updateStatus('ready', `✓ ${I18n.t('status.reset')}`);
    }

    async function handleUndo() {
        if (!_currentTab) return;
        try {
            const res = await sendToContent({ action: Constants.ACTIONS.UNDO_LAST });
            if (res.success) {
                IGRadarUI.updateStatus('ready', `↶ ${I18n.t('messages.undone')}: @${res.username}`);
                await IGRadarUI.loadUndoQueue();
            } else {
                alert(res.message || I18n.t('messages.noUndoAction'));
            }
        } catch (err) {
            console.error('[IGRadar] Failed to undo:', err);
        }
    }

    async function handleDryRunToggle(e) {
        const enabled = e.target.checked;
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.DRY_RUN_MODE]: enabled });
        try { await sendToContent({ action: Constants.ACTIONS.TOGGLE_DRY_RUN, enabled }); } catch (_) {}
        IGRadarUI.updateStatus(
            'ready',
            enabled ? `🧪 ${I18n.t('messages.dryRunActive')}` : `✓ ${I18n.t('messages.normalMode')}`
        );
    }

    // ─── KEYWORD HANDLERS ─────────────────────────────────────────────────────

    async function handleAddKeyword() {
        const keyword = IGRadarUI.el.keywordInput.value.trim().toLowerCase();
        if (!keyword) return;
        const data     = await chrome.storage.local.get([Constants.STORAGE_KEYS.KEYWORDS]);
        const keywords = data[Constants.STORAGE_KEYS.KEYWORDS] || [];
        if (!keywords.includes(keyword)) {
            keywords.push(keyword);
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.KEYWORDS]: keywords });
            try { await sendToContent({ action: Constants.ACTIONS.UPDATE_KEYWORDS, keywords }); } catch (_) {}
            IGRadarUI.renderKeywordList(keywords);
        }
        IGRadarUI.el.keywordInput.value = '';
    }

    async function handleRemoveKeyword(keyword) {
        const data     = await chrome.storage.local.get([Constants.STORAGE_KEYS.KEYWORDS]);
        const filtered = (data[Constants.STORAGE_KEYS.KEYWORDS] || []).filter(k => k !== keyword);
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.KEYWORDS]: filtered });
        try { await sendToContent({ action: Constants.ACTIONS.UPDATE_KEYWORDS, keywords: filtered }); } catch (_) {}
        IGRadarUI.renderKeywordList(filtered);
    }

    // ─── WHITELIST HANDLERS ───────────────────────────────────────────────────

    async function handleAddWhitelist() {
        const username = IGRadarUI.el.whitelistInput.value.trim().replace('@', '').toLowerCase();
        if (!username) return;
        const data      = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        if (!whitelist[username]) {
            whitelist[username] = { addedDate: Date.now() };
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });
            try { await sendToContent({ action: Constants.ACTIONS.UPDATE_WHITELIST, whitelist }); } catch (_) {}
            IGRadarUI.renderWhitelistList(whitelist);
        }
        IGRadarUI.el.whitelistInput.value = '';
    }

    async function handleRemoveWhitelist(username) {
        const data      = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        delete whitelist[username];
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });
        try { await sendToContent({ action: Constants.ACTIONS.UPDATE_WHITELIST, whitelist }); } catch (_) {}
        IGRadarUI.renderWhitelistList(whitelist);
    }

    // ─── LICENSE / PREMIUM ────────────────────────────────────────────────────

    /**
     * Validates the entered license key against the Gumroad API.
     * On success, persists premium status and notifies the content script.
     */
    async function handleLicenseActivate() {
        const key = IGRadarUI.el.licenseInput.value.trim();
        if (!key) return;

        IGRadarUI.setLicenseLoading(true);
        IGRadarUI.el.licenseStatus.style.display = 'none';

        try {
            const body = new URLSearchParams({
                product_permalink:      Constants.GUMROAD.PRODUCT_PERMALINK,
                license_key:            key,
                increment_uses_count:   'false'
            });
            const response = await fetch(Constants.GUMROAD.VERIFY_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            const json = await response.json();

            if (json.success === true) {
                const email = json.purchase && json.purchase.email ? json.purchase.email : null;
                await chrome.storage.local.set({
                    [Constants.STORAGE_KEYS.IS_PREMIUM]:    true,
                    [Constants.STORAGE_KEYS.LICENSE_KEY]:   key,
                    [Constants.STORAGE_KEYS.LICENSE_EMAIL]: email
                });
                try {
                    await sendToContent({
                        action:       Constants.ACTIONS.UPDATE_LICENSE,
                        isPremium:    true,
                        licenseKey:   key,
                        licenseEmail: email
                    });
                } catch (_) {}
                IGRadarUI.renderPremiumStatus(true, email);
                IGRadarUI.showLicenseResult(true, 'premium.successMessage');
                await IGRadarUI.loadStats();
            } else {
                IGRadarUI.showLicenseResult(false, 'premium.errorInvalid');
            }
        } catch (err) {
            console.error('[IGRadar] License verification failed:', err);
            IGRadarUI.showLicenseResult(false, 'premium.errorNetwork');
        } finally {
            IGRadarUI.setLicenseLoading(false);
        }
    }

    /**
     * Removes the stored license and reverts the user to free tier.
     */
    async function handleDeactivateLicense() {
        if (!confirm(I18n.t('premium.confirmDeactivate'))) return;
        await chrome.storage.local.set({
            [Constants.STORAGE_KEYS.IS_PREMIUM]:    false,
            [Constants.STORAGE_KEYS.LICENSE_KEY]:   null,
            [Constants.STORAGE_KEYS.LICENSE_EMAIL]: null
        });
        try {
            await sendToContent({
                action:    Constants.ACTIONS.UPDATE_LICENSE,
                isPremium: false,
                licenseKey:   null,
                licenseEmail: null
            });
        } catch (_) {}
        IGRadarUI.renderPremiumStatus(false, null);
        await IGRadarUI.loadStats();
    }

    // ─── THEME & LANGUAGE ─────────────────────────────────────────────────────

    async function handleThemeToggle() {
        const isDark = document.documentElement.classList.contains('dark-mode');
        const theme  = isDark ? Constants.THEMES.LIGHT : Constants.THEMES.DARK;
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.THEME]: theme });
        IGRadarUI.applyTheme(theme);
    }

    async function handleLanguageChange(e) {
        const locale = e.target.value;
        await I18n.setLocale(locale);
    }

    // ─── PER-USER LIST ACTIONS ────────────────────────────────────────────────

    /**
     * Re-follows a user via the content script and updates the list row UI.
     * @param {string}      username
     * @param {HTMLElement} liElement - the list row to update on success
     */
    async function handleUndoSingleUser(username, liElement) {
        if (!_currentTab) return;
        try {
            const res = await sendToContent({ action: Constants.ACTIONS.UNDO_SINGLE, username });
            if (res.success) {
                IGRadarUI.updateStatus('ready', `↶ ${I18n.t('messages.undone')}: @${username}`);
                liElement.classList.replace('unfollowed', 'undone');
                liElement.querySelector('.user-icon').textContent = '↶';
                const undoBtn = liElement.querySelector('.undo-btn');
                if (undoBtn) undoBtn.remove();
                await IGRadarUI.loadUndoQueue();
            } else {
                alert(res.message || I18n.t('messages.undoFailed'));
            }
        } catch (_) {
            alert(I18n.t('messages.undoFailedDetail'));
        }
    }

    /**
     * Adds a user to the whitelist directly from the processed-user list.
     * @param {string}      username
     * @param {HTMLElement} btnElement - the whitelist button to mark as added
     */
    async function handleAddToWhitelistFromList(username, btnElement) {
        const cleanName = username.replace('@', '').toLowerCase();
        const data      = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        whitelist[cleanName] = { addedDate: Date.now() };
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });
        try { await sendToContent({ action: Constants.ACTIONS.UPDATE_WHITELIST, whitelist }); } catch (_) {}
        IGRadarUI.renderWhitelistList(whitelist);
        btnElement.textContent = '✓';
        btnElement.disabled    = true;
        btnElement.classList.add('added');
        IGRadarUI.updateStatus('ready', `⭐ ${I18n.t('messages.addedToWhitelist')}: @${cleanName}`);
    }

    // ─── WIRE LISTENERS ───────────────────────────────────────────────────────

    /** Attaches all event listeners to the cached DOM elements. */
    function setup() {
        IGRadarUI.el.tabBtns.forEach(btn =>
            btn.addEventListener('click', () => IGRadarUI.switchTab(btn.dataset.tab))
        );
        document.querySelector('.tabs').addEventListener('keydown', IGRadarUI.handleTabKeyboard);

        IGRadarUI.el.startBtn.addEventListener('click',    handleStart);
        IGRadarUI.el.stopBtn.addEventListener('click',     handleStop);
        IGRadarUI.el.continueBtn.addEventListener('click', handleContinue);
        IGRadarUI.el.resetBtn.addEventListener('click',    handleReset);
        IGRadarUI.el.undoBtn.addEventListener('click',     handleUndo);
        IGRadarUI.el.dryRunMode.addEventListener('change', handleDryRunToggle);

        IGRadarUI.el.addKeywordBtn.addEventListener('click', handleAddKeyword);
        IGRadarUI.el.keywordInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') handleAddKeyword();
        });

        IGRadarUI.el.addWhitelistBtn.addEventListener('click', handleAddWhitelist);
        IGRadarUI.el.whitelistInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') handleAddWhitelist();
        });

        IGRadarUI.el.exportCsvBtn.addEventListener('click', IGRadarUI.handleExportCsv);
        IGRadarUI.el.themeToggle.addEventListener('click',  handleThemeToggle);
        IGRadarUI.el.langSelect.addEventListener('change',  handleLanguageChange);

        IGRadarUI.el.activateLicenseBtn.addEventListener('click', handleLicenseActivate);
        IGRadarUI.el.licenseInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') handleLicenseActivate();
        });
        IGRadarUI.el.deactivateLicenseBtn.addEventListener('click', handleDeactivateLicense);

        if (IGRadarUI.el.exportCsvLock) {
            IGRadarUI.el.exportCsvLock.addEventListener('click', () => IGRadarUI.switchTab('premium'));
        }
    }

    return {
        setCurrentTab,
        handleRemoveKeyword,
        handleRemoveWhitelist,
        handleUndoSingleUser,
        handleAddToWhitelistFromList,
        setup
    };
})();
