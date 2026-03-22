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
     * Tab ID for instagram.com (active window first, else any matching tab).
     * @returns {Promise<number|null>}
     */
    async function getInstagramTabId() {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (active && active.url && active.url.includes('instagram.com')) return active.id;
        const tabs = await chrome.tabs.query({ url: ['https://www.instagram.com/*'] });
        return tabs[0] ? tabs[0].id : null;
    }

    function normalizeWatchUsername(u) {
        return String(u || '').trim().replace(/^@/, '').toLowerCase();
    }

    /** @param {string} code */
    function watchErrorKey(code) {
        const map = {
            empty:          'watch.error.empty',
            max_entries:    'watch.error.max_entries',
            duplicate:      'watch.error.duplicate',
            not_found:      'watch.error.not_found',
            profile_failed: 'watch.error.profile_failed',
            not_in_list:    'watch.error.not_in_list',
            rate_limit:     'watch.error.rate_limit',
            unknown:        'watch.error.unknown'
        };
        return map[code] || 'watch.error.unknown';
    }

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
        const watchTab = document.getElementById('watch-tab');
        if (watchTab && watchTab.classList.contains('active')) await IGRadarUI.loadWatchList();
    }

    // ─── WATCH LIST ───────────────────────────────────────────────────────────

    async function handleWatchAdd() {
        const user = normalizeWatchUsername(IGRadarUI.el.watchUsernameInput.value);
        if (!user) {
            IGRadarUI.showWatchMessage('watch.error.empty', true);
            return;
        }
        IGRadarUI.setWatchListLoading(true);
        IGRadarUI.hideWatchMessage();
        try {
            const tabId = await getInstagramTabId();
            if (tabId == null) {
                IGRadarUI.showWatchMessage('watch.errorNoInstagramTab', true);
                return;
            }
            const res = await chrome.tabs.sendMessage(tabId, {
                action:   Constants.ACTIONS.WATCH_LIST_ADD,
                username: user
            });
            if (res && res.success && res.list) {
                IGRadarUI.el.watchUsernameInput.value = '';
                IGRadarUI.renderWatchList(res.list);
                IGRadarUI.showWatchMessage('watch.addedOk', false);
            } else if (res && res.error) {
                IGRadarUI.showWatchMessage(watchErrorKey(res.error), true);
            } else {
                IGRadarUI.showWatchMessage('watch.error.unknown', true);
            }
        } catch (err) {
            console.error('[IGRadar] watch add:', err);
            IGRadarUI.showWatchMessage('watch.errorContentScript', true);
        } finally {
            IGRadarUI.setWatchListLoading(false);
        }
    }

    async function handleWatchRemove(username) {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WATCH_LIST]);
        const list = (data[Constants.STORAGE_KEYS.WATCH_LIST] || []).filter(
            x => x.username !== username
        );
        const pruned = IGRadarUI.pruneWatchListEntries(list);
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WATCH_LIST]: pruned });
        IGRadarUI.renderWatchList(pruned);
        IGRadarUI.hideWatchMessage();
    }

    async function handleWatchRefreshOne(username) {
        IGRadarUI.setWatchListLoading(true);
        IGRadarUI.hideWatchMessage();
        try {
            const tabId = await getInstagramTabId();
            if (tabId == null) {
                IGRadarUI.showWatchMessage('watch.errorNoInstagramTab', true);
                return;
            }
            const res = await chrome.tabs.sendMessage(tabId, {
                action:   Constants.ACTIONS.WATCH_LIST_REFRESH,
                username
            });
            if (res && res.success && res.list) {
                IGRadarUI.renderWatchList(res.list);
                IGRadarUI.showWatchMessage('watch.refreshedOk', false);
            } else if (res && res.error) {
                IGRadarUI.showWatchMessage(watchErrorKey(res.error), true);
            } else {
                IGRadarUI.showWatchMessage('watch.error.unknown', true);
            }
        } catch (err) {
            console.error('[IGRadar] watch refresh one:', err);
            IGRadarUI.showWatchMessage('watch.errorContentScript', true);
        } finally {
            IGRadarUI.setWatchListLoading(false);
        }
    }

    async function handleWatchRefreshAll() {
        IGRadarUI.setWatchListLoading(true);
        IGRadarUI.hideWatchMessage();
        try {
            const tabId = await getInstagramTabId();
            if (tabId == null) {
                IGRadarUI.showWatchMessage('watch.errorNoInstagramTab', true);
                return;
            }
            const res = await chrome.tabs.sendMessage(tabId, {
                action: Constants.ACTIONS.WATCH_LIST_REFRESH
            });
            if (res && res.success && res.list) {
                IGRadarUI.renderWatchList(res.list);
                IGRadarUI.showWatchMessage('watch.refreshedAllOk', false);
            } else if (res && res.error) {
                IGRadarUI.showWatchMessage(watchErrorKey(res.error), true);
            } else {
                IGRadarUI.showWatchMessage('watch.error.unknown', true);
            }
        } catch (err) {
            console.error('[IGRadar] watch refresh all:', err);
            IGRadarUI.showWatchMessage('watch.errorContentScript', true);
        } finally {
            IGRadarUI.setWatchListLoading(false);
        }
    }

    /**
     * @param {MouseEvent} e
     */
    function handleWatchListClick(e) {
        const refreshBtn = e.target.closest('[data-watch-refresh]');
        if (refreshBtn) {
            handleWatchRefreshOne(refreshBtn.getAttribute('data-watch-refresh'));
            return;
        }
        const removeBtn = e.target.closest('[data-watch-remove]');
        if (removeBtn) {
            handleWatchRemove(removeBtn.getAttribute('data-watch-remove'));
            return;
        }
        const header = e.target.closest('.watch-list__header');
        if (header && !e.target.closest('.watch-list__actions')) {
            const item   = header.closest('.watch-list__item');
            const detail = item && item.querySelector('.watch-list__detail');
            if (!detail) return;
            const expanded = header.getAttribute('aria-expanded') === 'true';
            header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            detail.hidden = expanded;
        }
    }

    /**
     * @param {KeyboardEvent} e
     */
    function handleWatchListKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const header = e.target.closest('.watch-list__header');
        if (!header) return;
        e.preventDefault();
        header.click();
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

        if (IGRadarUI.el.watchAddBtn) {
            IGRadarUI.el.watchAddBtn.addEventListener('click', handleWatchAdd);
        }
        if (IGRadarUI.el.watchUsernameInput) {
            IGRadarUI.el.watchUsernameInput.addEventListener('keypress', e => {
                if (e.key === 'Enter') handleWatchAdd();
            });
        }
        if (IGRadarUI.el.watchRefreshAllBtn) {
            IGRadarUI.el.watchRefreshAllBtn.addEventListener('click', handleWatchRefreshAll);
        }
        if (IGRadarUI.el.watchList) {
            IGRadarUI.el.watchList.addEventListener('click', handleWatchListClick);
            IGRadarUI.el.watchList.addEventListener('keydown', handleWatchListKeydown);
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
