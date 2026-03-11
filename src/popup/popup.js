/**
 * @fileoverview Instagram Unfollow Radar - Popup Script
 * @description Handles popup UI, user interactions and content script communication
 * @version 1.0.0
 */

const IGUnfollowRadarPopup = (function () {
    'use strict';

    let currentTab = null;
    let isRunning = false;
    let chart = null;
    let rateLimitInterval = null;
    let elements = {};
    let displayedUsers = new Set();

    // ─── DOM HELPERS ──────────────────────────────────────────────────────────

    function cacheElements() {
        elements = {
            tabBtns:      document.querySelectorAll('.tab-btn'),
            tabContents:  document.querySelectorAll('.tab-content'),

            startBtn:     document.getElementById('startBtn'),
            stopBtn:      document.getElementById('stopBtn'),
            continueBtn:  document.getElementById('continueBtn'),
            resetBtn:     document.getElementById('resetBtn'),
            undoBtn:      document.getElementById('undoBtn'),
            undoCount:    document.getElementById('undoCount'),
            dryRunMode:   document.getElementById('dryRunMode'),

            sessionCount: document.getElementById('sessionCount'),
            totalCount:   document.getElementById('totalCount'),
            lastRun:      document.getElementById('lastRun'),

            statusText:       document.getElementById('statusText'),
            statusIndicator:  document.getElementById('statusIndicator'),

            userList: document.getElementById('userList'),

            testModeAlert:     document.getElementById('testModeAlert'),
            rateLimitAlert:    document.getElementById('rateLimitAlert'),
            rateLimitCountdown: document.getElementById('rateLimitCountdown'),
            limitReachedAlert: document.getElementById('limitReachedAlert'),

            keywordInput:   document.getElementById('keywordInput'),
            addKeywordBtn:  document.getElementById('addKeywordBtn'),
            keywordList:    document.getElementById('keywordList'),

            whitelistInput:   document.getElementById('whitelistInput'),
            addWhitelistBtn:  document.getElementById('addWhitelistBtn'),
            whitelistList:    document.getElementById('whitelistList'),

            chartContainer: document.getElementById('chart'),
            exportCsvBtn:   document.getElementById('exportCsvBtn'),

            themeToggle: document.getElementById('themeToggle'),
            langToggle:  document.getElementById('langToggle')
        };
    }

    function createElement(tag, attributes = {}, textContent = '') {
        const el = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([dk, dv]) => { el.dataset[dk] = dv; });
            } else if (key.startsWith('aria')) {
                el.setAttribute(key.replace(/([A-Z])/g, '-$1').toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        });
        if (textContent) el.textContent = textContent;
        return el;
    }

    // ─── TABS ─────────────────────────────────────────────────────────────────

    function switchTab(tabName) {
        elements.tabBtns.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive);
        });
        elements.tabContents.forEach(content => {
            const isActive = content.id === `${tabName}-tab`;
            content.classList.toggle('active', isActive);
            if (isActive) content.removeAttribute('hidden');
            else content.setAttribute('hidden', '');
        });
        if (tabName === 'stats') renderChart();
    }

    function handleTabKeyboard(e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const tabs = Array.from(document.querySelectorAll('.tab-btn'));
        const currentIndex = tabs.findIndex(t => t === document.activeElement);
        if (currentIndex === -1) return;
        const nextIndex = e.key === 'ArrowRight'
            ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
        e.preventDefault();
    }

    // ─── STATUS ───────────────────────────────────────────────────────────────

    function updateStatus(type, message) {
        elements.statusText.textContent = message;
        elements.statusIndicator.className = 'status-indicator';
        if (type === 'active')  elements.statusIndicator.classList.add('active');
        if (type === 'stopped') elements.statusIndicator.classList.add('stopped');
        if (type === 'ready')   elements.statusIndicator.classList.add('ready');
    }

    function updateUndoButton(count) {
        elements.undoCount.textContent = count;
        elements.undoBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }

    // ─── DATA LOADING ─────────────────────────────────────────────────────────

    async function loadStats() {
        const data = await chrome.storage.local.get([
            Constants.STORAGE_KEYS.SESSION_COUNT,
            Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED,
            Constants.STORAGE_KEYS.LAST_RUN,
            Constants.STORAGE_KEYS.SESSION_START
        ]);

        const sc = data[Constants.STORAGE_KEYS.SESSION_COUNT] || 0;
        const tu = data[Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED] || 0;
        const lr = data[Constants.STORAGE_KEYS.LAST_RUN];

        elements.sessionCount.textContent = `${sc}/${Constants.LIMITS.MAX_SESSION}`;
        elements.totalCount.textContent = tu;

        if (lr) {
            elements.lastRun.textContent = new Date(lr).toLocaleString('tr-TR');
        }

        if (sc >= Constants.LIMITS.MAX_SESSION) {
            const now = Date.now();
            const sessionStart = data[Constants.STORAGE_KEYS.SESSION_START] || now;
            const timeLeft = Constants.TIMING.SESSION_DURATION - (now - sessionStart);
            if (timeLeft > 0) {
                elements.limitReachedAlert.style.display = 'block';
                elements.startBtn.disabled = true;
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
        elements.dryRunMode.checked = data[Constants.STORAGE_KEYS.DRY_RUN_MODE] || false;
    }

    async function loadUndoQueue() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNDO_QUEUE]);
        updateUndoButton((data[Constants.STORAGE_KEYS.UNDO_QUEUE] || []).length);
    }

    // ─── EVENT HANDLERS ───────────────────────────────────────────────────────

    async function handleStart() {
        if (!currentTab) return;
        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.START });
            isRunning = true;
            elements.startBtn.style.display = 'none';
            elements.stopBtn.style.display = 'block';
            elements.userList.innerHTML = '';
            displayedUsers.clear();
            updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
        } catch (error) {
            console.error('Failed to start:', error);
            if (confirm(I18n.t('messages.confirmReload'))) {
                await chrome.tabs.reload(currentTab.id);
                updateStatus('ready', `🔄 ${I18n.t('messages.pageReloaded')}`);
            } else {
                updateStatus('error', `❌ ${I18n.t('messages.startFailed')}`);
            }
        }
    }

    async function handleStop() {
        if (!currentTab) return;
        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.STOP });
            isRunning = false;
            elements.startBtn.style.display = 'block';
            elements.stopBtn.style.display = 'none';
            updateStatus('stopped', `⏸ ${I18n.t('status.stopped')}`);
        } catch (error) {
            console.error('Failed to stop:', error);
        }
    }

    async function handleContinue() {
        if (!currentTab) return;
        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.CONTINUE_TEST });
            elements.testModeAlert.style.display = 'none';
            updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
        } catch (error) {
            console.error('Failed to continue:', error);
        }
    }

    async function handleReset() {
        if (confirm(I18n.t('messages.confirmReset'))) {
            await chrome.storage.local.set({
                [Constants.STORAGE_KEYS.SESSION_COUNT]:  0,
                [Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED]: 0,
                [Constants.STORAGE_KEYS.SESSION_START]:  Date.now(),
                [Constants.STORAGE_KEYS.TEST_MODE]:      true,
                [Constants.STORAGE_KEYS.TEST_COMPLETE]:  false,
                [Constants.STORAGE_KEYS.UNDO_QUEUE]:     []
            });
            elements.sessionCount.textContent = `0/${Constants.LIMITS.MAX_SESSION}`;
            elements.totalCount.textContent = '0';
            elements.lastRun.textContent = '-';
            elements.limitReachedAlert.style.display = 'none';
            elements.startBtn.disabled = false;
            elements.userList.innerHTML = '';
            displayedUsers.clear();
            updateUndoButton(0);
            updateStatus('ready', `✓ ${I18n.t('status.reset')}`);
        }
    }

    async function handleUndo() {
        if (!currentTab) return;
        try {
            const response = await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.UNDO_LAST });
            if (response.success) {
                updateStatus('ready', `↶ ${I18n.t('messages.undone')}: @${response.username}`);
                await loadUndoQueue();
            } else {
                alert(response.message || I18n.t('messages.noUndoAction'));
            }
        } catch (error) {
            console.error('Failed to undo:', error);
        }
    }

    async function handleDryRunToggle(e) {
        const enabled = e.target.checked;
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.DRY_RUN_MODE]: enabled });
        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.TOGGLE_DRY_RUN, enabled });
        } catch (_) {}
        updateStatus('ready', enabled ? `🧪 ${I18n.t('messages.dryRunActive')}` : `✓ ${I18n.t('messages.normalMode')}`);
    }

    // ─── KEYWORD HANDLERS ─────────────────────────────────────────────────────

    async function handleAddKeyword() {
        const keyword = elements.keywordInput.value.trim();
        if (!keyword) return;
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.KEYWORDS]);
        const keywords = data[Constants.STORAGE_KEYS.KEYWORDS] || [];
        if (!keywords.includes(keyword.toLowerCase())) {
            keywords.push(keyword.toLowerCase());
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.KEYWORDS]: keywords });
            try { await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.UPDATE_KEYWORDS, keywords }); }
            catch (_) {}
            renderKeywordList(keywords);
        }
        elements.keywordInput.value = '';
    }

    async function handleRemoveKeyword(keyword) {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.KEYWORDS]);
        const filtered = (data[Constants.STORAGE_KEYS.KEYWORDS] || []).filter(k => k !== keyword);
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.KEYWORDS]: filtered });
        try { await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.UPDATE_KEYWORDS, keywords: filtered }); }
        catch (_) {}
        renderKeywordList(filtered);
    }

    function renderKeywordList(keywords) {
        elements.keywordList.innerHTML = '';
        keywords.forEach(keyword => {
            const li = createElement('li');
            li.appendChild(createElement('span', {}, keyword));
            const btn = createElement('button', { className: 'remove-btn', dataset: { keyword } }, '✕');
            btn.addEventListener('click', () => handleRemoveKeyword(keyword));
            li.appendChild(btn);
            elements.keywordList.appendChild(li);
        });
    }

    // ─── WHITELIST HANDLERS ───────────────────────────────────────────────────

    async function handleAddWhitelist() {
        let username = elements.whitelistInput.value.trim().replace('@', '').toLowerCase();
        if (!username) return;
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        if (!whitelist[username]) {
            whitelist[username] = { addedDate: Date.now() };
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });
            try { await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.UPDATE_WHITELIST, whitelist }); }
            catch (_) {}
            renderWhitelistList(whitelist);
        }
        elements.whitelistInput.value = '';
    }

    async function handleRemoveWhitelist(username) {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        delete whitelist[username];
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });
        try { await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.UPDATE_WHITELIST, whitelist }); }
        catch (_) {}
        renderWhitelistList(whitelist);
    }

    function renderWhitelistList(whitelist) {
        elements.whitelistList.innerHTML = '';
        Object.keys(whitelist).forEach(username => {
            const li = createElement('li');
            li.appendChild(createElement('span', {}, `@${username}`));
            const btn = createElement('button', { className: 'remove-btn', dataset: { username } }, '✕');
            btn.addEventListener('click', () => handleRemoveWhitelist(username));
            li.appendChild(btn);
            elements.whitelistList.appendChild(li);
        });
    }

    // ─── THEME & LANGUAGE ─────────────────────────────────────────────────────

    async function handleThemeToggle() {
        const isDark = document.documentElement.classList.contains('dark-mode');
        const newTheme = isDark ? Constants.THEMES.LIGHT : Constants.THEMES.DARK;
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.THEME]: newTheme });
        applyTheme(newTheme);
    }

    function applyTheme(theme) {
        const isDark = theme === Constants.THEMES.DARK;
        document.documentElement.classList.toggle('dark-mode', isDark);
        elements.themeToggle.textContent = isDark ? '☀️' : '🌙';
        elements.themeToggle.setAttribute('aria-pressed', isDark);
    }

    async function handleLanguageToggle() {
        await I18n.toggleLocale();
    }

    // ─── CHART & CSV ──────────────────────────────────────────────────────────

    async function renderChart() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNFOLLOW_STATS]);
        const stats = data[Constants.STORAGE_KEYS.UNFOLLOW_STATS] || { daily: {} };
        const labels = [], series = [];
        for (let i = Constants.LIMITS.CHART_DAYS - 1; i >= 0; i--) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split('T')[0];
            labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
            series.push(stats.daily[dateStr]?.unfollowed || 0);
        }
        if (chart) {
            chart.update({ labels, series: [series] });
        } else {
            chart = new Chartist.Line(elements.chartContainer,
                { labels, series: [series] },
                { fullWidth: true, chartPadding: { right: 20 }, low: 0, showArea: true }
            );
        }
    }

    async function handleExportCsv() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNFOLLOW_HISTORY]);
        const history = data[Constants.STORAGE_KEYS.UNFOLLOW_HISTORY] || [];
        if (history.length === 0) { alert(I18n.t('messages.noHistory')); return; }
        const csv = '\uFEFF' + [
            ['Username', 'Date', 'Reason'].join(','),
            ...history.map(item => [item.username, item.date, item.reason].join(','))
        ].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `ig-unfollow-radar-history-${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    // ─── USER LIST ────────────────────────────────────────────────────────────

    async function addUserToList(username, action, timestamp) {
        const userKey = `${username}:${action}`;
        if (displayedUsers.has(userKey)) return;
        displayedUsers.add(userKey);

        const li = createElement('li');
        const time = new Date(timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        const cleanUsername = username.replace('@', '').toLowerCase();
        const isInWhitelist = !!whitelist[cleanUsername];

        let icon = '', className = '';
        if (action === Constants.USER_ACTIONS.UNFOLLOWED) { icon = '✓'; className = 'unfollowed'; }
        else if (action === Constants.USER_ACTIONS.DRY_RUN) { icon = '🧪'; className = 'dry-run'; }
        else if (action.startsWith('skipped:')) { icon = '⊘'; className = 'skipped'; }

        li.className = className;
        li.dataset.username = username;

        const actionsDiv = createElement('div', { className: 'user-actions' });
        li.appendChild(createElement('span', { className: 'user-icon' }, icon));
        li.appendChild(createElement('span', { className: 'user-name' }, `@${username}`));
        li.appendChild(createElement('span', { className: 'user-time' }, time));

        if (action === Constants.USER_ACTIONS.UNFOLLOWED) {
            const undoBtn = createElement('button', { className: 'action-btn undo-btn', title: I18n.t('userList.undoBtn') }, '↶');
            undoBtn.addEventListener('click', e => { e.stopPropagation(); handleUndoSingleUser(username, li); });
            actionsDiv.appendChild(undoBtn);
        }

        if (!isInWhitelist) {
            const wlBtn = createElement('button', { className: 'action-btn whitelist-btn', title: I18n.t('userList.addToWhitelist') }, '⭐');
            wlBtn.addEventListener('click', e => { e.stopPropagation(); handleAddToWhitelistFromList(username, wlBtn); });
            actionsDiv.appendChild(wlBtn);
        }

        li.appendChild(actionsDiv);
        elements.userList.appendChild(li);

        if (elements.userList.children.length > Constants.LIMITS.MAX_USER_LIST_DISPLAY) {
            elements.userList.removeChild(elements.userList.firstChild);
        }
        elements.userList.scrollTop = elements.userList.scrollHeight;
    }

    async function handleUndoSingleUser(username, liElement) {
        if (!currentTab) return;
        try {
            const response = await chrome.tabs.sendMessage(currentTab.id, {
                action: Constants.ACTIONS.UNDO_SINGLE,
                username
            });
            if (response.success) {
                updateStatus('ready', `↶ ${I18n.t('messages.undone')}: @${username}`);
                liElement.classList.remove('unfollowed');
                liElement.classList.add('undone');
                liElement.querySelector('.user-icon').textContent = '↶';
                liElement.querySelector('.undo-btn')?.remove();
                await loadUndoQueue();
            } else {
                alert(response.message || I18n.t('messages.undoFailed'));
            }
        } catch (_) {
            alert(I18n.t('messages.undoFailedDetail'));
        }
    }

    async function handleAddToWhitelistFromList(username, btnElement) {
        const cleanUsername = username.replace('@', '').toLowerCase();
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        whitelist[cleanUsername] = { addedDate: Date.now() };
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });
        try { await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.UPDATE_WHITELIST, whitelist }); }
        catch (_) {}
        renderWhitelistList(whitelist);
        btnElement.textContent = '✓';
        btnElement.disabled = true;
        btnElement.classList.add('added');
        updateStatus('ready', `⭐ ${I18n.t('messages.addedToWhitelist')}: @${cleanUsername}`);
    }

    // ─── MESSAGE HANDLER ──────────────────────────────────────────────────────

    function handleMessage(message) {
        switch (message.type) {
            case Constants.MESSAGE_TYPES.STATUS_UPDATE:
                handleStatusUpdate(message);
                break;
            case Constants.MESSAGE_TYPES.TEST_COMPLETE:
                elements.testModeAlert.style.display = 'block';
                updateStatus('stopped', `⏸ ${I18n.t('alerts.batchComplete')}`);
                break;
            case Constants.MESSAGE_TYPES.RATE_LIMIT_HIT:
                handleRateLimitMessage(message.data);
                break;
            case Constants.MESSAGE_TYPES.USER_PROCESSED:
                addUserToList(message.data.username, message.data.action, message.data.timestamp);
                loadUndoQueue();
                break;
        }
    }

    function handleStatusUpdate(data) {
        if (data.sessionCount !== undefined) {
            elements.sessionCount.textContent = `${data.sessionCount}/${Constants.LIMITS.MAX_SESSION}`;
        }
        if (data.totalUnfollowed !== undefined) {
            elements.totalCount.textContent = data.totalUnfollowed;
        }

        switch (data.status) {
            case Constants.STATUS.STARTED:
                updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
                break;
            case Constants.STATUS.SCANNING:
                if (data.message) {
                    updateStatus('active', `🔍 ${data.message}`);
                } else {
                    updateStatus('active', `🔍 ${I18n.t('status.scanning')}... (${data.queueSize || 0} ${I18n.t('aria.found')})`);
                }
                break;
            case Constants.STATUS.UNFOLLOWED:
                updateStatus('active', `${data.dryRun ? '[DRY RUN] ' : ''}✓ @${data.username || 'user'}`);
                break;
            case Constants.STATUS.STOPPED:
                updateStatus('stopped', `⏸ ${I18n.t('status.stopped')}`);
                isRunning = false;
                elements.startBtn.style.display = 'block';
                elements.stopBtn.style.display = 'none';
                break;
            case Constants.STATUS.COMPLETED:
                updateStatus('ready', `✅ ${I18n.t('status.completed')}`);
                isRunning = false;
                elements.startBtn.style.display = 'block';
                elements.stopBtn.style.display = 'none';
                break;
            case Constants.STATUS.LIMIT_REACHED:
                updateStatus('stopped', `🚫 ${I18n.t('alerts.dailyLimitReached')}`);
                elements.limitReachedAlert.style.display = 'block';
                isRunning = false;
                elements.startBtn.style.display = 'block';
                elements.stopBtn.style.display = 'none';
                elements.startBtn.disabled = true;
                break;
            case Constants.STATUS.READY:
            case Constants.STATUS.IDLE:
                isRunning = false;
                elements.startBtn.style.display = 'block';
                elements.stopBtn.style.display = 'none';
                updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
                break;
        }
        loadStats();
    }

    function handleRateLimitMessage(data) {
        elements.rateLimitAlert.style.display = 'block';
        updateStatus('stopped', `🚫 ${I18n.t('alerts.rateLimit')}`);
        isRunning = false;
        elements.startBtn.style.display = 'block';
        elements.stopBtn.style.display = 'none';

        let remaining = data.remainingMinutes * 60;
        if (rateLimitInterval) clearInterval(rateLimitInterval);
        rateLimitInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(rateLimitInterval);
                elements.rateLimitAlert.style.display = 'none';
                updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
                return;
            }
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            elements.rateLimitCountdown.textContent =
                `${m}:${String(s).padStart(2, '0')} ${I18n.t('aria.rateLimitCountdown')}`;
        }, 1000);
    }

    // ─── EVENT LISTENERS ──────────────────────────────────────────────────────

    function setupEventListeners() {
        elements.tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
        document.querySelector('.tabs')?.addEventListener('keydown', handleTabKeyboard);

        elements.startBtn.addEventListener('click', handleStart);
        elements.stopBtn.addEventListener('click', handleStop);
        elements.continueBtn.addEventListener('click', handleContinue);
        elements.resetBtn.addEventListener('click', handleReset);
        elements.undoBtn.addEventListener('click', handleUndo);
        elements.dryRunMode.addEventListener('change', handleDryRunToggle);

        elements.addKeywordBtn.addEventListener('click', handleAddKeyword);
        elements.keywordInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleAddKeyword(); });

        elements.addWhitelistBtn.addEventListener('click', handleAddWhitelist);
        elements.whitelistInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleAddWhitelist(); });

        elements.exportCsvBtn.addEventListener('click', handleExportCsv);
        elements.themeToggle.addEventListener('click', handleThemeToggle);
        elements.langToggle.addEventListener('click', handleLanguageToggle);

        chrome.runtime.onMessage.addListener(handleMessage);
    }

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async function init() {
        cacheElements();
        await loadTheme();
        await I18n.init();

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTab = tabs[0];

        const isOnInstagram = currentTab.url && currentTab.url.includes('instagram.com');

        if (!isOnInstagram) {
            updateStatus('error', `❌ ${I18n.t('messages.notOnInstagram')}`);
            elements.startBtn.disabled = true;
        }

        await loadStats();
        await loadKeywords();
        await loadWhitelist();
        await loadDryRunMode();
        await loadUndoQueue();

        setupEventListeners();

        if (isOnInstagram) {
            try {
                const response = await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.GET_STATUS });
                if (response && response.isRunning) {
                    isRunning = true;
                    elements.startBtn.style.display = 'none';
                    elements.stopBtn.style.display = 'block';
                }
                updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
            } catch (_) {
                updateStatus('ready', `⚠️ ${I18n.t('status.ready')}`);
            }
        }
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => IGUnfollowRadarPopup.init());
