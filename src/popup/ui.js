/**
 * @fileoverview Instagram Unfollow Radar - Popup UI Module
 * @description Owns every DOM interaction: element caching, tab switching,
 *   status bar updates, list renders, theme, chart, and message-driven
 *   UI state transitions.
 *
 *   IGRadarEvents is referenced lazily (event callbacks fire after all
 *   scripts have loaded) so the forward reference is safe.
 * @version 2.0.0
 */

const IGRadarUI = (function() {
    'use strict';

    // ─── STATE ────────────────────────────────────────────────────────────────

    /** Populated by cacheElements(). Always the same object reference. */
    const el = {};
    let chart             = null;
    let rateLimitInterval = null;
    let displayedUsers    = new Set();
    let _isRunning        = false;

    // ─── ELEMENT CACHE ────────────────────────────────────────────────────────

    /**
     * Queries and stores all required DOM elements.
     * Must be called once before any other function that accesses `el`.
     */
    function cacheElements() {
        el.tabBtns            = document.querySelectorAll('.tab-btn');
        el.tabContents        = document.querySelectorAll('.tab-content');
        el.startBtn           = document.getElementById('startBtn');
        el.stopBtn            = document.getElementById('stopBtn');
        el.continueBtn        = document.getElementById('continueBtn');
        el.resetBtn           = document.getElementById('resetBtn');
        el.undoBtn            = document.getElementById('undoBtn');
        el.undoCount          = document.getElementById('undoCount');
        el.dryRunMode         = document.getElementById('dryRunMode');
        el.sessionCount       = document.getElementById('sessionCount');
        el.totalCount         = document.getElementById('totalCount');
        el.lastRun            = document.getElementById('lastRun');
        el.statusText         = document.getElementById('statusText');
        el.statusIndicator    = document.getElementById('statusIndicator');
        el.userList           = document.getElementById('userList');
        el.testModeAlert      = document.getElementById('testModeAlert');
        el.rateLimitAlert     = document.getElementById('rateLimitAlert');
        el.rateLimitCountdown = document.getElementById('rateLimitCountdown');
        el.limitReachedAlert  = document.getElementById('limitReachedAlert');
        el.keywordInput       = document.getElementById('keywordInput');
        el.addKeywordBtn      = document.getElementById('addKeywordBtn');
        el.keywordList        = document.getElementById('keywordList');
        el.whitelistInput     = document.getElementById('whitelistInput');
        el.addWhitelistBtn    = document.getElementById('addWhitelistBtn');
        el.whitelistList      = document.getElementById('whitelistList');
        el.chartContainer     = document.getElementById('chart');
        el.exportCsvBtn       = document.getElementById('exportCsvBtn');
        el.themeToggle        = document.getElementById('themeToggle');
        el.langSelect         = document.getElementById('langSelect');
        el.statusBar          = document.getElementById('statusBar');
        el.userListEmpty      = document.getElementById('userListEmpty');
        el.sessionProgress      = document.getElementById('sessionProgress');
        el.premiumBadge         = document.getElementById('premiumBadge');
        el.premiumEmail         = document.getElementById('premiumEmail');
        el.licenseInput         = document.getElementById('licenseInput');
        el.activateLicenseBtn   = document.getElementById('activateLicenseBtn');
        el.licenseStatus        = document.getElementById('licenseStatus');
        el.deactivateWrapper    = document.getElementById('deactivateWrapper');
        el.deactivateLicenseBtn = document.getElementById('deactivateLicenseBtn');
        el.licenseForm          = document.getElementById('licenseForm');
        el.limitUpgradeHint     = document.getElementById('limitUpgradeHint');
        el.buyWrapper           = document.getElementById('buyWrapper');
        el.buyOnGumroadBtn      = document.getElementById('buyOnGumroadBtn');
        el.manageSubscriptionLink = document.getElementById('manageSubscriptionLink');
        el.exportCsvLock        = document.getElementById('exportCsvLock');
        el.watchUsernameInput   = document.getElementById('watchUsernameInput');
        el.watchAddBtn          = document.getElementById('watchAddBtn');
        el.watchRefreshAllBtn   = document.getElementById('watchRefreshAllBtn');
        el.watchList            = document.getElementById('watchList');
        el.watchMessage         = document.getElementById('watchMessage');
        el.watchListEmpty       = document.getElementById('watchListEmpty');
    }

    // ─── DOM HELPERS ──────────────────────────────────────────────────────────

    /**
     * Creates a DOM element, assigns attributes, and optionally sets text.
     * Supports className, dataset, aria-* prefixed, and regular HTML attributes.
     *
     * @param {string} tag
     * @param {Object} [attrs={}]
     * @param {string} [text='']
     * @returns {HTMLElement}
     */
    function createElement(tag, attrs = {}, text = '') {
        const node = document.createElement(tag);
        for (const [key, val] of Object.entries(attrs)) {
            if (key === 'className') {
                node.className = val;
            } else if (key === 'dataset') {
                for (const [dk, dv] of Object.entries(val)) { node.dataset[dk] = dv; }
            } else if (key.startsWith('aria')) {
                node.setAttribute(key.replace(/([A-Z])/g, '-$1').toLowerCase(), val);
            } else {
                node.setAttribute(key, val);
            }
        }
        if (text) node.textContent = text;
        return node;
    }

    // ─── TABS ─────────────────────────────────────────────────────────────────

    /**
     * Activates the named tab and deactivates all others.
     * @param {string} tabName
     */
    function switchTab(tabName) {
        el.tabBtns.forEach(btn => {
            const active = btn.dataset.tab === tabName;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active);
        });
        el.tabContents.forEach(content => {
            const active = content.id === `${tabName}-tab`;
            content.classList.toggle('active', active);
            if (active) content.removeAttribute('hidden');
            else content.setAttribute('hidden', '');
        });
        if (tabName === 'stats') renderChart();
        if (tabName === 'watch') loadWatchList();
    }

    /**
     * Keyboard handler for the tab bar — arrow keys move focus and activate tabs.
     * @param {KeyboardEvent} e
     */
    function handleTabKeyboard(e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const tabs = Array.from(document.querySelectorAll('.tab-btn'));
        const idx  = tabs.findIndex(t => t === document.activeElement);
        if (idx === -1) return;
        const next = e.key === 'ArrowRight'
            ? (idx + 1) % tabs.length
            : (idx - 1 + tabs.length) % tabs.length;
        tabs[next].focus();
        tabs[next].click();
        e.preventDefault();
    }

    // ─── STATUS BAR ───────────────────────────────────────────────────────────

    /**
     * Updates the status indicator and message text.
     * @param {'active'|'stopped'|'ready'|'error'} type
     * @param {string} message
     */
    function updateStatus(type, message) {
        el.statusText.textContent = message;
        el.statusIndicator.className = 'status-indicator';
        if (type === 'active')  el.statusIndicator.classList.add('active');
        if (type === 'stopped') el.statusIndicator.classList.add('stopped');
        if (type === 'ready')   el.statusIndicator.classList.add('ready');
        el.statusBar.className = 'status-bar';
        if (type === 'active')  el.statusBar.classList.add('active');
        if (type === 'stopped') el.statusBar.classList.add('stopped');
        if (type === 'ready')   el.statusBar.classList.add('ready');
    }

    /**
     * Updates the undo button visibility and badge count.
     * @param {number} count
     */
    function updateUndoButton(count) {
        el.undoCount.textContent = count;
        el.undoBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }

    /**
     * Toggles the running state and flips start/stop button visibility.
     * @param {boolean} running
     */
    function setRunning(running) {
        _isRunning             = running;
        el.startBtn.style.display = running ? 'none'  : 'block';
        el.stopBtn.style.display  = running ? 'block' : 'none';
    }

    /** @returns {boolean} */
    function isRunning() { return _isRunning; }

    // ─── DATA LOADERS ─────────────────────────────────────────────────────────

    async function loadStats() {
        const data = await chrome.storage.local.get([
            Constants.STORAGE_KEYS.SESSION_COUNT,
            Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED,
            Constants.STORAGE_KEYS.LAST_RUN,
            Constants.STORAGE_KEYS.SESSION_START,
            Constants.STORAGE_KEYS.IS_PREMIUM
        ]);
        const sc        = data[Constants.STORAGE_KEYS.SESSION_COUNT]    || 0;
        const tu        = data[Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED]  || 0;
        const lr        = data[Constants.STORAGE_KEYS.LAST_RUN];
        const isPremium = data[Constants.STORAGE_KEYS.IS_PREMIUM]        || false;
        const limit     = isPremium
            ? Constants.LIMITS.PREMIUM_DAILY_LIMIT
            : Constants.LIMITS.FREE_DAILY_LIMIT;

        el.sessionCount.textContent = `${sc}/${limit}`;
        el.totalCount.textContent   = tu;
        if (lr) el.lastRun.textContent = new Date(lr).toLocaleString();

        el.sessionProgress.parentElement.setAttribute('aria-valuemax', limit);
        const pct = Math.min((sc / limit) * 100, 100);
        el.sessionProgress.style.width = `${pct}%`;
        el.sessionProgress.parentElement.setAttribute('aria-valuenow', sc);

        if (sc >= limit) {
            const sessionStart = data[Constants.STORAGE_KEYS.SESSION_START] || Date.now();
            const timeLeft     = Constants.TIMING.SESSION_DURATION - (Date.now() - sessionStart);
            if (timeLeft > 0) {
                el.limitReachedAlert.style.display = 'block';
                if (el.limitUpgradeHint && !isPremium) {
                    el.limitUpgradeHint.style.display = 'block';
                }
                el.startBtn.disabled = true;
            }
        }
    }

    async function loadKeywords() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.KEYWORDS]);
        renderKeywordList(data[Constants.STORAGE_KEYS.KEYWORDS] || []);
    }

    async function loadWhitelist() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        renderWhitelistList(data[Constants.STORAGE_KEYS.WHITELIST] || {});
    }

    async function loadTheme() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.THEME]);
        applyTheme(data[Constants.STORAGE_KEYS.THEME] || Constants.THEMES.LIGHT);
    }

    async function loadDryRunMode() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.DRY_RUN_MODE]);
        el.dryRunMode.checked = data[Constants.STORAGE_KEYS.DRY_RUN_MODE] || false;
    }

    async function loadUndoQueue() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNDO_QUEUE]);
        updateUndoButton((data[Constants.STORAGE_KEYS.UNDO_QUEUE] || []).length);
    }

    // ─── LIST RENDERS ─────────────────────────────────────────────────────────

    /**
     * Re-renders the keyword filter list.
     * Remove buttons call back into IGRadarEvents at click time (safe lazy ref).
     * @param {string[]} keywords
     */
    function renderKeywordList(keywords) {
        el.keywordList.innerHTML = '';
        for (const keyword of keywords) {
            const li  = createElement('li');
            const btn = createElement('button', { className: 'remove-btn', dataset: { keyword } }, '✕');
            btn.addEventListener('click', () => IGRadarEvents.handleRemoveKeyword(keyword));
            li.appendChild(createElement('span', {}, keyword));
            li.appendChild(btn);
            el.keywordList.appendChild(li);
        }
    }

    /**
     * Re-renders the whitelist.
     * @param {Object} whitelist - { [username]: { addedDate } }
     */
    function renderWhitelistList(whitelist) {
        el.whitelistList.innerHTML = '';
        for (const username of Object.keys(whitelist)) {
            const li  = createElement('li');
            const btn = createElement('button', { className: 'remove-btn', dataset: { username } }, '✕');
            btn.addEventListener('click', () => IGRadarEvents.handleRemoveWhitelist(username));
            li.appendChild(createElement('span', {}, `@${username}`));
            li.appendChild(btn);
            el.whitelistList.appendChild(li);
        }
    }

    // ─── THEME ────────────────────────────────────────────────────────────────

    /**
     * Applies the given theme to the document root and updates the toggle button.
     * @param {'light'|'dark'} theme
     */
    function applyTheme(theme) {
        const isDark = theme === Constants.THEMES.DARK;
        document.documentElement.classList.toggle('dark-mode', isDark);
        el.themeToggle.textContent = isDark ? '☀️' : '🌙';
        el.themeToggle.setAttribute('aria-pressed', isDark);
    }

    // ─── CHART & CSV ──────────────────────────────────────────────────────────

    /** Renders (or updates) the 30-day unfollow activity chart via Chartist. */
    async function renderChart() {
        const data   = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNFOLLOW_STATS]);
        const stats  = data[Constants.STORAGE_KEYS.UNFOLLOW_STATS] || { daily: {} };
        const labels = [];
        const series = [];

        for (let i = Constants.LIMITS.CHART_DAYS - 1; i >= 0; i--) {
            const date    = new Date(Date.now() - i * 86400000);
            const dateStr = date.toISOString().split('T')[0];
            labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
            series.push(stats.daily[dateStr] ? stats.daily[dateStr].unfollowed : 0);
        }

        if (chart) {
            chart.update({ labels, series: [series] });
        } else {
            chart = new Chartist.Line(
                el.chartContainer,
                { labels, series: [series] },
                { fullWidth: true, chartPadding: { right: 20 }, low: 0, showArea: true }
            );
        }
    }

    /** Downloads the unfollow history as a UTF-8 BOM CSV file. Premium only. */
    async function handleExportCsv() {
        const premiumData = await chrome.storage.local.get([Constants.STORAGE_KEYS.IS_PREMIUM]);
        if (!premiumData[Constants.STORAGE_KEYS.IS_PREMIUM]) {
            IGRadarUI.switchTab('premium');
            return;
        }

        const data    = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNFOLLOW_HISTORY]);
        const history = data[Constants.STORAGE_KEYS.UNFOLLOW_HISTORY] || [];
        if (history.length === 0) { alert(I18n.t('messages.noHistory')); return; }

        const rows = ['Username,Date,Reason'].concat(
            history.map(r => [r.username, r.date, r.reason].join(','))
        );
        const csv  = '\uFEFF' + rows.join('\n');
        const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href     = url;
        link.download = `ig-unfollow-radar-history-${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    // ─── USER LIST ────────────────────────────────────────────────────────────

    /**
     * Appends one entry to the processed-user list panel.
     * Deduplicates by username+action key. Trims list to MAX_USER_LIST_DISPLAY.
     * Per-row action buttons delegate to IGRadarEvents (safe lazy ref).
     *
     * @param {string} username
     * @param {string} action
     * @param {number} timestamp
     */
    async function addUserToList(username, action, timestamp) {
        const key = `${username}:${action}`;
        if (displayedUsers.has(key)) return;
        displayedUsers.add(key);

        const data          = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist     = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        const cleanName     = username.replace('@', '').toLowerCase();
        const isWhitelisted = !!whitelist[cleanName];
        const time          = new Date(timestamp).toLocaleTimeString(
            I18n.getLocale(), { hour: '2-digit', minute: '2-digit' }
        );

        let icon = '', cls = '';
        if (action === Constants.USER_ACTIONS.UNFOLLOWED)   { icon = '✓';  cls = 'unfollowed'; }
        else if (action === Constants.USER_ACTIONS.DRY_RUN) { icon = '🧪'; cls = 'dry-run'; }
        else if (action.startsWith('skipped:'))             { icon = '⊘';  cls = 'skipped'; }

        const li         = createElement('li', { className: cls, dataset: { username } });
        const actionsDiv = createElement('div', { className: 'user-actions' });

        li.appendChild(createElement('span', { className: 'user-icon' }, icon));
        li.appendChild(createElement('span', { className: 'user-name' }, `@${username}`));
        li.appendChild(createElement('span', { className: 'user-time' }, time));

        if (action === Constants.USER_ACTIONS.UNFOLLOWED) {
            const undoBtn = createElement(
                'button',
                { className: 'action-btn undo-btn', title: I18n.t('userList.undoBtn') },
                '↶'
            );
            undoBtn.addEventListener('click', e => {
                e.stopPropagation();
                IGRadarEvents.handleUndoSingleUser(username, li);
            });
            actionsDiv.appendChild(undoBtn);
        }

        if (!isWhitelisted) {
            const wlBtn = createElement(
                'button',
                { className: 'action-btn whitelist-btn', title: I18n.t('userList.addToWhitelist') },
                '⭐'
            );
            wlBtn.addEventListener('click', e => {
                e.stopPropagation();
                IGRadarEvents.handleAddToWhitelistFromList(username, wlBtn);
            });
            actionsDiv.appendChild(wlBtn);
        }

        li.appendChild(actionsDiv);
        el.userListEmpty.style.display = 'none';
        el.userList.appendChild(li);

        if (el.userList.children.length > Constants.LIMITS.MAX_USER_LIST_DISPLAY) {
            el.userList.removeChild(el.userList.firstChild);
        }
        el.userList.scrollTop = el.userList.scrollHeight;
    }

    /** Clears all entries from the user list panel. */
    function clearUserList() {
        el.userList.innerHTML = '';
        displayedUsers.clear();
        el.userListEmpty.style.display = '';
    }

    // ─── MESSAGE-DRIVEN UI UPDATES ────────────────────────────────────────────

    /**
     * Handles a STATUS_UPDATE message by updating counters, status bar,
     * and button state.
     * @param {Object} data - the full STATUS_UPDATE message object
     */
    function handleStatusUpdate(data) {
        if (data.sessionCount !== undefined) {
            chrome.storage.local.get([Constants.STORAGE_KEYS.IS_PREMIUM]).then(d => {
                const isPremium = d[Constants.STORAGE_KEYS.IS_PREMIUM] || false;
                const limit     = isPremium
                    ? Constants.LIMITS.PREMIUM_DAILY_LIMIT
                    : Constants.LIMITS.FREE_DAILY_LIMIT;
                el.sessionCount.textContent = `${data.sessionCount}/${limit}`;
            });
        }
        if (data.totalUnfollowed !== undefined) {
            el.totalCount.textContent = data.totalUnfollowed;
        }

        switch (data.status) {
            case Constants.STATUS.STARTED:
                updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
                break;
            case Constants.STATUS.SCANNING:
                if (data.phase === 'buildingFollowers') {
                    updateStatus('active', `🔍 ${I18n.t('status.buildingFollowers')} (${data.followerCount || 0})`);
                } else {
                    const checked = data.totalScanned != null
                        ? ` · ${data.totalScanned} ${I18n.t('status.checked')}`
                        : '';
                    updateStatus('active', `🔍 ${I18n.t('status.scanning')}... (${data.queueSize || 0} ${I18n.t('aria.found')}${checked})`);
                }
                break;
            case Constants.STATUS.UNFOLLOWED:
                updateStatus('active', `${data.dryRun ? '[DRY RUN] ' : ''}✓ @${data.username || 'user'}`);
                break;
            case Constants.STATUS.STOPPED:
                updateStatus('stopped', `⏸ ${I18n.t('status.stopped')}`);
                setRunning(false);
                break;
            case Constants.STATUS.COMPLETED:
                updateStatus('ready', `✅ ${I18n.t('status.completed')}`);
                setRunning(false);
                break;
            case Constants.STATUS.LIMIT_REACHED:
                updateStatus('stopped', `🚫 ${I18n.t('alerts.dailyLimitReached')}`);
                el.limitReachedAlert.style.display = 'block';
                el.startBtn.disabled = true;
                setRunning(false);
                break;
            case Constants.STATUS.READY:
            case Constants.STATUS.IDLE:
                updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
                setRunning(false);
                break;
            case Constants.STATUS.RESUMED:
                updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
                setRunning(true);
                break;
            case Constants.STATUS.ERROR:
                updateStatus('stopped', `⚠️ ${I18n.t('status.error')}`);
                setRunning(false);
                break;
            default:
                break;
        }
        loadStats();
    }

    /**
     * Displays the rate-limit alert and starts a countdown timer.
     * @param {{ remainingMinutes: number }} data
     */
    function handleRateLimitMessage(data) {
        el.rateLimitAlert.style.display = 'block';
        updateStatus('stopped', `🚫 ${I18n.t('alerts.rateLimit')}`);
        setRunning(false);

        let remaining = data.remainingMinutes * 60;
        if (rateLimitInterval) clearInterval(rateLimitInterval);

        rateLimitInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(rateLimitInterval);
                el.rateLimitAlert.style.display = 'none';
                updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
                return;
            }
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            el.rateLimitCountdown.textContent =
                `${m}:${String(s).padStart(2, '0')} ${I18n.t('aria.rateLimitCountdown')}`;
        }, 1000);
    }

    // ─── PREMIUM UI ───────────────────────────────────────────────────────────

    /**
     * Updates the premium tab to reflect the current license status.
     * @param {boolean} isPremium
     * @param {string|null} email - email from Gumroad purchase
     */
    function renderPremiumStatus(isPremium, email) {
        if (!el.premiumBadge) return;

        // Always set the Gumroad buy link
        if (el.buyOnGumroadBtn) {
            el.buyOnGumroadBtn.href =
                `https://cayliverse.gumroad.com/l/${Constants.GUMROAD.PRODUCT_PERMALINK}`;
        }
        if (el.manageSubscriptionLink) {
            el.manageSubscriptionLink.href = Constants.GUMROAD.MANAGE_URL;
        }

        if (isPremium) {
            el.premiumBadge.textContent = I18n.t('premium.activeBadge');
            el.premiumBadge.className   = 'premium-badge premium-badge--active';
            el.premiumBadge.setAttribute('data-i18n', 'premium.activeBadge');
            if (email) {
                el.premiumEmail.textContent   = email;
                el.premiumEmail.style.display = 'block';
            }
            el.licenseForm.style.display       = 'none';
            el.deactivateWrapper.style.display = 'block';
            if (el.buyWrapper) el.buyWrapper.style.display = 'none';
            // Unlock CSV export
            if (el.exportCsvBtn) {
                el.exportCsvBtn.disabled = false;
                el.exportCsvBtn.classList.remove('btn--locked');
            }
            if (el.exportCsvLock) el.exportCsvLock.style.display = 'none';
        } else {
            el.premiumBadge.textContent = I18n.t('premium.freeBadge');
            el.premiumBadge.className   = 'premium-badge premium-badge--free';
            el.premiumBadge.setAttribute('data-i18n', 'premium.freeBadge');
            el.premiumEmail.style.display      = 'none';
            el.licenseForm.style.display       = 'block';
            el.deactivateWrapper.style.display = 'none';
            if (el.buyWrapper) el.buyWrapper.style.display = 'block';
            // Lock CSV export
            if (el.exportCsvBtn) {
                el.exportCsvBtn.disabled = false; // clickable so we can redirect to Premium tab
                el.exportCsvBtn.classList.add('btn--locked');
            }
            if (el.exportCsvLock) el.exportCsvLock.style.display = 'block';
        }
    }

    /**
     * Enables or disables the activate button and shows a loading state.
     * @param {boolean} loading
     */
    function setLicenseLoading(loading) {
        if (!el.activateLicenseBtn) return;
        el.activateLicenseBtn.disabled = loading;
        el.activateLicenseBtn.textContent = loading
            ? '⏳'
            : I18n.t('premium.activateBtn');
    }

    /**
     * Shows a success or error message below the license input.
     * @param {boolean} success
     * @param {string} messageKey - i18n key for the message text
     */
    function showLicenseResult(success, messageKey) {
        if (!el.licenseStatus) return;
        el.licenseStatus.textContent = I18n.t(messageKey);
        el.licenseStatus.className   = `license-status license-status--${success ? 'success' : 'error'}`;
        el.licenseStatus.style.display = 'block';
    }

    // ─── WATCH LIST ───────────────────────────────────────────────────────────

    /**
     * Keeps new-follow events inside [watchStartedAt, watchStartedAt+24h] or rolling 24h (legacy).
     * @param {Array<Object>} list
     * @returns {Array<Object>}
     */
    function pruneWatchListEntries(list) {
        const WL = Constants.WATCH_LIST;
        return list.map(entry => ({
            ...entry,
            recentNewFollows: (entry.recentNewFollows || []).filter(x => {
                if (entry.watchStartedAt != null) {
                    const end = entry.watchStartedAt + WL.NEW_FOLLOW_RETENTION_MS;
                    return x.detectedAt >= entry.watchStartedAt && x.detectedAt <= end;
                }
                return x.detectedAt > Date.now() - WL.NEW_FOLLOW_RETENTION_MS;
            })
        }));
    }

    /**
     * Reads watch list from storage, prunes stale events, persists, and renders.
     */
    async function loadWatchList() {
        if (!el.watchList) return;
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WATCH_LIST]);
        let list   = data[Constants.STORAGE_KEYS.WATCH_LIST] || [];
        list       = pruneWatchListEntries(list);
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WATCH_LIST]: list });
        renderWatchList(list);
    }

    /**
     * @param {Array<Object>} list
     */
    function renderWatchList(list) {
        if (!el.watchList || !el.watchListEmpty) return;
        el.watchList.innerHTML = '';
        if (!list.length) {
            el.watchListEmpty.style.display = 'block';
            return;
        }
        el.watchListEmpty.style.display = 'none';

        for (const entry of list) {
            const newCount = (entry.recentNewFollows || []).length;
            const following  = entry.followingCount != null
                ? entry.followingCount
                : (entry.lastFollowingIds || []).length;
            const lastCheck  = entry.lastCheckedAt
                ? new Date(entry.lastCheckedAt).toLocaleString()
                : '—';

            const li = createElement('li', {
                className: 'watch-list__item',
                dataset:   { username: entry.username }
            });

            const header = createElement('div', {
                className:   'watch-list__header',
                role:        'button',
                tabIndex:    '0',
                'aria-expanded': 'false'
            });
            const titleRow = createElement('div', { className: 'watch-list__title-row' });
            titleRow.appendChild(createElement('span', {
                className: 'watch-list__username'
            }, `@${entry.username}`));
            const meta = createElement('span', { className: 'watch-list__meta' });
            meta.appendChild(document.createTextNode(
                I18n.t('watch.followingCount', { count: following })
            ));
            meta.appendChild(document.createTextNode(' · '));
            meta.appendChild(document.createTextNode(
                I18n.t('watch.newLast24', { count: newCount })
            ));
            if (entry.partialSnapshot) {
                meta.appendChild(document.createTextNode(' · '));
                const partial = createElement('span', { className: 'watch-list__partial' });
                partial.textContent = I18n.t('watch.partialBadge');
                meta.appendChild(partial);
            }
            titleRow.appendChild(meta);
            header.appendChild(titleRow);
            const sub = createElement('div', { className: 'watch-list__sub' },
                `${I18n.t('watch.lastCheck')}: ${lastCheck}`);
            header.appendChild(sub);

            const detail = createElement('div', {
                className: 'watch-list__detail',
                hidden:    ''
            });
            const uniq = [];
            const seen = new Set();
            for (const ev of entry.recentNewFollows || []) {
                if (seen.has(ev.username)) continue;
                seen.add(ev.username);
                uniq.push(ev.username);
            }
            if (uniq.length) {
                const ul = createElement('ul', { className: 'watch-list__new-list' });
                for (const u of uniq) {
                    ul.appendChild(createElement('li', {}, `@${u}`));
                }
                detail.appendChild(ul);
            } else {
                detail.appendChild(createElement('p', {
                    className: 'watch-list__no-new'
                }, I18n.t('watch.noNewFollows')));
            }

            const actions = createElement('div', { className: 'watch-list__actions' });
            actions.appendChild(createElement('button', {
                type:            'button',
                className:       'btn btn-secondary btn--small',
                dataset:         { watchRefresh: entry.username },
                'aria-label':    I18n.t('watch.refreshOneAria', { username: entry.username })
            }, I18n.t('watch.refreshOne')));
            actions.appendChild(createElement('button', {
                type:            'button',
                className:       'btn btn-secondary btn--small watch-list__remove',
                dataset:         { watchRemove: entry.username },
                'aria-label':    I18n.t('watch.removeAria', { username: entry.username })
            }, I18n.t('watch.remove')));

            li.appendChild(header);
            li.appendChild(detail);
            li.appendChild(actions);
            el.watchList.appendChild(li);
        }
    }

    /**
     * @param {string} messageKey - i18n key or literal fallback
     * @param {boolean} isError
     */
    function showWatchMessage(messageKey, isError) {
        if (!el.watchMessage) return;
        const text = messageKey.includes('.') ? I18n.t(messageKey) : messageKey;
        el.watchMessage.textContent       = text;
        el.watchMessage.className         = `watch-message${isError ? ' watch-message--error' : ''}`;
        el.watchMessage.style.display     = 'block';
    }

    function hideWatchMessage() {
        if (el.watchMessage) el.watchMessage.style.display = 'none';
    }

    /**
     * @param {boolean} loading
     */
    function setWatchListLoading(loading) {
        if (el.watchAddBtn) el.watchAddBtn.disabled = loading;
        if (el.watchRefreshAllBtn) el.watchRefreshAllBtn.disabled = loading;
        if (el.watchList) {
            el.watchList.querySelectorAll('[data-watch-refresh]').forEach(btn => {
                btn.disabled = loading;
            });
        }
    }

    return {
        cacheElements,
        el,
        createElement,
        switchTab,
        handleTabKeyboard,
        updateStatus,
        updateUndoButton,
        setRunning,
        isRunning,
        clearUserList,
        loadStats,
        loadKeywords,
        loadWhitelist,
        loadTheme,
        loadDryRunMode,
        loadUndoQueue,
        renderKeywordList,
        renderWhitelistList,
        applyTheme,
        renderChart,
        handleExportCsv,
        addUserToList,
        handleStatusUpdate,
        handleRateLimitMessage,
        renderPremiumStatus,
        setLicenseLoading,
        showLicenseResult,
        loadWatchList,
        renderWatchList,
        pruneWatchListEntries,
        showWatchMessage,
        hideWatchMessage,
        setWatchListLoading
    };
})();
