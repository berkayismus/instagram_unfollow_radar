# Instagram Unfollow Radar — Technical Documentation

> **Navigation / İçerik**
> [English](#english) · [Türkçe](#türkçe)

---

<a name="english"></a>

# English

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture & Data Flow](#4-architecture--data-flow)
5. [Content Script Modules](#5-content-script-modules)
6. [Popup Modules](#6-popup-modules)
7. [Shared Modules](#7-shared-modules)
8. [Background Service Worker](#8-background-service-worker)
9. [Instagram API Endpoints](#9-instagram-api-endpoints)
10. [Storage Schema](#10-storage-schema)
11. [Message Protocol](#11-message-protocol)
12. [Two-Phase Scan Algorithm](#12-two-phase-scan-algorithm)
13. [Rate Limiting & Safety](#13-rate-limiting--safety)
14. [Internationalization (i18n)](#14-internationalization-i18n)
15. [Configuration Reference](#15-configuration-reference)

---

## 1. Project Overview

**Instagram Unfollow Radar** is a Chrome Extension (Manifest V3) that helps users identify and unfollow accounts on Instagram that do not follow them back.

Core capabilities:

- Automatically pages through the full followers and following lists using Instagram's internal REST API
- Identifies non-followers by set-difference comparison (following ∖ followers)
- Supports whitelist and keyword-based skip rules
- Dry-run mode to preview results without making changes
- Per-session rate-limit protection with automatic resume
- Batch (test-mode) pause at 50 operations for user confirmation
- Undo queue to re-follow up to 10 recently unfollowed accounts
- 30-day activity chart and CSV export of unfollow history
- Full dark-mode and bilingual (Turkish / English) UI

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Extension platform | Chrome Extensions Manifest V3 |
| Language | Vanilla JavaScript (ES2021, no TypeScript) |
| UI | Plain HTML5 + CSS3 (no frameworks) |
| Build tooling | None — files are loaded directly |
| Module pattern | IIFE namespaces (global scope sharing across content scripts) |
| Charting | [Chartist.js](https://gionkunz.github.io/chartist-js/) (vendored) |
| Storage | `chrome.storage.local` |
| Linting | ESLint (`.eslintrc.json`) |

---

## 3. Project Structure

```
instagram_unfollow_radar/
├── manifest.json               # Extension manifest (MV3)
├── .eslintrc.json              # ESLint configuration
├── assets/
│   └── icons/                  # icon16.png · icon48.png · icon128.png
├── docs/
│   └── TECHNICAL.md            # This file
├── locales/
│   ├── en.json                 # English translations
│   └── tr.json                 # Turkish translations
├── vendor/
│   └── chartist.min.js         # Vendored chart library
└── src/
    ├── background/
    │   └── index.js            # Service worker — message relay
    ├── content/
    │   ├── api.js              # Instagram API calls (fetch layer)
    │   ├── storage.js          # chrome.storage operations
    │   ├── filters.js          # Whitelist / keyword filter helpers
    │   ├── automation.js       # Scan loop + unfollow engine
    │   └── index.js            # State object + message listener
    ├── popup/
    │   ├── popup.html          # Extension popup HTML
    │   ├── popup.css           # Popup styles (light + dark theme)
    │   ├── ui.js               # DOM rendering & status updates
    │   ├── events.js           # User event handlers
    │   └── popup.js            # Init + message router
    └── shared/
        ├── constants.js        # Deep-frozen global constants
        └── i18n.js             # Translation loader & applier
```

---

## 4. Architecture & Data Flow

The extension consists of three isolated execution contexts that communicate only through `chrome.runtime` messaging:

```
┌─────────────────────────────┐
│      POPUP (popup.html)     │
│  ui.js · events.js ·        │
│  popup.js · i18n.js ·       │
│  constants.js               │
└──────────┬──────────────────┘
           │ chrome.tabs.sendMessage  (action commands)
           │ chrome.runtime.onMessage (status updates)
           ▼
┌─────────────────────────────┐
│   BACKGROUND SERVICE WORKER │
│        background/index.js  │
│   (relays content → popup)  │
└──────────┬──────────────────┘
           │ chrome.runtime.onMessage / sendMessage
           ▼
┌─────────────────────────────┐
│   CONTENT SCRIPT (Instagram)│
│  constants.js               │
│  api.js → storage.js        │
│  filters.js → automation.js │
│  index.js                   │
└─────────────────────────────┘
           │ fetch()
           ▼
    Instagram Internal API
```

**Command flow (popup → content):**
`popup.js` sends an action via `chrome.tabs.sendMessage`. The content script's `index.js` handles it and delegates work to `automation.js`.

**Status flow (content → popup):**
`automation.js` calls `sendStatus()` in `index.js`, which sends a `STATUS_UPDATE` message. The background service worker relays it to the popup. `popup.js` receives it and calls `IGRadarUI.handleStatusUpdate()`.

---

## 5. Content Script Modules

All five files are injected in the order listed in `manifest.json`. Because there is no module bundler, each file exposes its API as a global IIFE namespace. Files loaded earlier are available as globals to files loaded later.

### 5.1 `api.js`

**Responsibility:** All network I/O. Zero mutable state.

| Export | Description |
|---|---|
| `IGRadarAPI.getCurrentUserId()` | Reads `ds_user_id` cookie |
| `IGRadarAPI.fetchFollowingPage(userId, cursor, signal)` | GET one page of following list |
| `IGRadarAPI.fetchFollowersPage(userId, cursor, signal)` | GET one page of followers list |
| `IGRadarAPI.unfollowUser(userId, signal)` | POST to `/friendships/destroy/` |
| `IGRadarAPI.refollowUser(userId, signal)` | POST to `/friendships/create/` |

Also defines the `RateLimitError` class (thrown on HTTP 429) which `automation.js` catches to trigger the rate-limit pause flow.

All fetch functions accept an `AbortSignal`. When the user presses Stop, `index.js` calls `state.abortController.abort()`, which causes any pending fetch to reject with `AbortError`, cleanly terminating the loop.

### 5.2 `storage.js`

**Responsibility:** All `chrome.storage.local` reads and writes.

| Export | Description |
|---|---|
| `IGRadarStorage.loadState(state)` | Reads all keys into the mutable state object |
| `IGRadarStorage.saveSessionProgress({sessionCount, totalUnfollowed, undoQueue})` | Persists counters |
| `IGRadarStorage.updateDailyStats()` | Increments today's unfollowed counter |
| `IGRadarStorage.addToHistory(username, reason)` | Appends to history; prunes entries older than 30 days |
| `IGRadarStorage.setRateLimitUntil(timestamp)` | Saves rate-limit expiry |
| `IGRadarStorage.clearRateLimit()` | Clears rate-limit expiry on resume |

### 5.3 `filters.js`

**Responsibility:** Pure, stateless filter logic.

| Export | Description |
|---|---|
| `IGRadarFilters.shouldSkipUser(username, displayText, whitelist, keywords)` | Returns `{ skip: boolean, reason: string\|null }` |

A user is skipped if:
1. Their normalized username exists as a key in `whitelist`
2. Their `displayText` (username + full_name) contains any string from `keywords`

### 5.4 `automation.js`

**Responsibility:** Orchestrates the two-phase scan loop. Calls `api.js`, `storage.js`, and `filters.js`.

| Export | Description |
|---|---|
| `IGRadarAutomation.mainLoop(state, sendStatus)` | Entry point; runs Phase 1 then Phase 2 |

Internal functions (not exported):

| Function | Description |
|---|---|
| `randomDelay(min, max)` | Returns a Promise resolving after a random ms delay |
| `handleRateLimit(state, sendStatus)` | Pauses session; schedules auto-resume via `setTimeout` |
| `processUnfollow(user, state, sendStatus, signal)` | Performs one real/dry-run unfollow; updates counters |
| `buildFollowerSet(userId, state, sendStatus)` | Phase 1 — downloads all followers into a `Set` |
| `scanPage(userId, cursor, followerSet, state, sendStatus)` | Phase 2 helper — fetches one following page; pushes non-followers to queue |

### 5.5 `index.js`

**Responsibility:** Owns the session `state` object and the `chrome.runtime.onMessage` listener. Acts as an orchestrator — delegates all work to the modules above.

**State object shape:**

```js
{
    isRunning:       boolean,
    isPaused:        boolean,
    testMode:        boolean,    // true until user confirms to continue
    testComplete:    boolean,
    unfollowQueue:   Array<{id, username}>,
    processedUsers:  Set<string>,
    sessionCount:    number,
    totalUnfollowed: number,
    keywords:        string[],
    whitelist:       Object,
    dryRunMode:      boolean,
    undoQueue:       Array<{id, username, timestamp}>,
    rateLimitUntil:  number|null,
    abortController: AbortController|null
}
```

---

## 6. Popup Modules

Scripts are loaded in this order in `popup.html`:

```
vendor/chartist.min.js → constants.js → i18n.js → ui.js → events.js → popup.js
```

### 6.1 `ui.js` — `IGRadarUI`

**Responsibility:** All DOM manipulation. No `fetch` calls, no `chrome.tabs.sendMessage`.

Key exports: `cacheElements`, `el` (element cache), `createElement`, `switchTab`, `updateStatus`, `setRunning`, `renderKeywordList`, `renderWhitelistList`, `applyTheme`, `renderChart`, `addUserToList`, `handleStatusUpdate`, `handleRateLimitMessage`.

`el` is a single shared object mutated in-place by `cacheElements()`, so all modules that reference `IGRadarUI.el` always see the latest DOM references.

### 6.2 `events.js` — `IGRadarEvents`

**Responsibility:** User-initiated events. Calls `chrome.tabs.sendMessage` to communicate with the content script; calls `IGRadarUI.*` to update the DOM.

Key exports: `setCurrentTab`, `setup`, `handleRemoveKeyword`, `handleRemoveWhitelist`, `handleUndoSingleUser`, `handleAddToWhitelistFromList`.

`setup()` must be called after `IGRadarUI.cacheElements()`.

### 6.3 `popup.js`

**Responsibility:** Entry point. Initialises all modules, registers `chrome.runtime.onMessage` listener, and checks initial running state.

```
init()
  ├── IGRadarUI.cacheElements()
  ├── IGRadarUI.loadTheme()
  ├── I18n.init()
  ├── chrome.tabs.query → IGRadarEvents.setCurrentTab(tab)
  ├── IGRadarUI.load*() × 5 (parallel)
  ├── IGRadarEvents.setup()
  ├── chrome.runtime.onMessage.addListener(handleMessage)
  └── chrome.tabs.sendMessage GET_STATUS → IGRadarUI.setRunning(true) if needed
```

---

## 7. Shared Modules

### 7.1 `constants.js`

All configurable values are collected into a single `Constants` object that is **recursively frozen** with `deepFreeze()`. Any accidental mutation will throw a `TypeError` in strict mode.

Notable constant groups: `TIMING`, `LIMITS`, `API`, `STORAGE_KEYS`, `MESSAGE_TYPES`, `ACTIONS`, `STATUS`, `USER_ACTIONS`, `THEMES`, `LOCALES`.

### 7.2 `i18n.js`

Loads locale JSON from `locales/<locale>.json` via `fetch(chrome.runtime.getURL(...))`. Translations are cached in memory after the first load. Applies translations by iterating `data-i18n`, `data-i18n-placeholder`, `data-i18n-title`, and `data-i18n-aria` attributes.

On first launch (no saved preference), the locale is auto-detected via `chrome.i18n.getUILanguage()`, falling back to `'tr'` if the detected language is not in the supported list.

---

## 8. Background Service Worker

`src/background/index.js` acts as a **message relay**. Content scripts cannot send messages directly to the popup (which may be closed); the background worker bridges the gap.

It listens for `STATUS_UPDATE`, `TEST_COMPLETE`, `RATE_LIMIT_HIT`, and `USER_PROCESSED` message types and re-broadcasts them via `chrome.runtime.sendMessage`.

---

## 9. Instagram API Endpoints

All endpoints are Instagram's private/internal API. No official public API is used.

| Purpose | Method | URL pattern |
|---|---|---|
| Fetch following list page | GET | `/api/v1/friendships/{userId}/following/?count=50&max_id={cursor}` |
| Fetch followers list page | GET | `/api/v1/friendships/{userId}/followers/?count=50&max_id={cursor}` |
| Unfollow a user | POST | `/api/v1/friendships/destroy/{targetUserId}/` |
| Re-follow a user | POST | `/api/v1/friendships/create/{targetUserId}/` |

**Required request headers:**

| Header | Value |
|---|---|
| `X-IG-App-ID` | `936619743392459` |
| `X-CSRFToken` | Value of the `csrftoken` cookie |
| `X-Requested-With` | `XMLHttpRequest` |
| `Content-Type` (POST only) | `application/x-www-form-urlencoded` |

The logged-in user's ID is read from the `ds_user_id` cookie.

---

## 10. Storage Schema

All keys are stored under `chrome.storage.local`.

| Key | Type | Description |
|---|---|---|
| `igSessionCount` | `number` | Unfollows performed in the current 24 h window |
| `igSessionStart` | `number` | Epoch ms when the current session started |
| `igTotalUnfollowed` | `number` | All-time unfollow count |
| `igLastRun` | `string` | ISO 8601 timestamp of last unfollow action |
| `igTestMode` | `boolean` | Whether batch pause is active |
| `igTestComplete` | `boolean` | Whether user has confirmed to proceed past batch |
| `igKeywords` | `string[]` | Lowercase keyword skip list |
| `igWhitelist` | `Object` | `{ [username]: { addedDate: number } }` |
| `igDryRunMode` | `boolean` | Dry-run flag |
| `igUndoQueue` | `Array` | `[{ id, username, timestamp }]` max 10 items |
| `igRateLimitUntil` | `number\|null` | Epoch ms when rate limit expires |
| `igUnfollowStats` | `Object` | `{ daily: { [YYYY-MM-DD]: { unfollowed, timestamp } } }` |
| `igUnfollowHistory` | `Array` | `[{ username, date, reason }]` — last 30 days |
| `igTheme` | `'light'\|'dark'` | Selected UI theme |
| `igLanguage` | `'tr'\|'en'` | Selected locale |

---

## 11. Message Protocol

Messages flow through `chrome.runtime` messaging in two directions.

### Popup → Content (via `chrome.tabs.sendMessage`)

| `action` | Payload | Description |
|---|---|---|
| `START` | — | Begin the automation loop |
| `STOP` | — | Abort and stop |
| `CONTINUE_TEST` | — | Continue past the batch milestone |
| `GET_STATUS` | — | Query running state |
| `UPDATE_KEYWORDS` | `{ keywords: string[] }` | Sync keyword list |
| `UPDATE_WHITELIST` | `{ whitelist: Object }` | Sync whitelist |
| `TOGGLE_DRY_RUN` | `{ enabled: boolean }` | Toggle dry-run mode |
| `UNDO_LAST` | — | Re-follow the most recently unfollowed user |
| `UNDO_SINGLE` | `{ username: string }` | Re-follow a specific user |

### Content → Popup (via background relay)

| `type` | Key fields | Description |
|---|---|---|
| `STATUS_UPDATE` | `status`, `sessionCount`, `totalUnfollowed` | General status broadcast |
| `TEST_COMPLETE` | — | Batch milestone reached |
| `RATE_LIMIT_HIT` | `{ until, remainingMinutes }` | Rate limit detected |
| `USER_PROCESSED` | `{ username, action, timestamp }` | One user was processed |

---

## 12. Two-Phase Scan Algorithm

Non-followers cannot be determined from the following list alone because Instagram's `/following/` API does not include a `followed_by` field. The extension solves this with a two-phase approach:

**Phase 1 — Build follower set**

Pages through `/followers/` until all pages are exhausted, storing every follower's PK (primary key) in a `Set<string>`.

```
followerSet = new Set()
cursor = null
loop:
  page = GET /followers/?count=50&max_id={cursor}
  for each user in page.users:
    followerSet.add(String(user.pk))
  cursor = page.next_max_id
until cursor is null
```

**Phase 2 — Scan following list**

Pages through `/following/`. For each user whose PK is **not** in `followerSet`, they are a non-follower and are added to the `unfollowQueue` (subject to whitelist/keyword filters). The queue is drained between page fetches.

```
cursor = null
loop:
  if unfollowQueue.empty and hasMore:
    page = GET /following/?count=50&max_id={cursor}
    for each user in page.users:
      if user.pk not in followerSet and not shouldSkip(user):
        unfollowQueue.push(user)
    cursor = page.next_max_id
  
  while unfollowQueue not empty:
    user = unfollowQueue.shift()
    POST /friendships/destroy/{user.id}/
    wait randomDelay(5s – 10s)
    occasionally wait extra humanPause(5s – 15s)
```

---

## 13. Rate Limiting & Safety

| Safeguard | Value | Description |
|---|---|---|
| Inter-request delay | 5 – 10 s | Random delay between every API call |
| Human pause probability | 10 % | Chance of an additional 5 – 15 s pause |
| Session limit | 100 unfollows / 24 h | Hard cap; resets after `SESSION_DURATION` |
| Batch milestone | 50 | User must confirm to continue past the first 50 |
| Rate limit cool-down | 15 min | Automatic pause + resume on HTTP 429 |
| AbortController | On every fetch | Instant clean cancellation when Stop is pressed |

---

## 14. Internationalization (i18n)

Translations live in `locales/tr.json` and `locales/en.json`. Keys use dot-notation groups (`status.ready`, `buttons.start`, etc.).

HTML elements are annotated with `data-i18n` attributes:

```html
<span data-i18n="status.ready">Ready</span>
<input data-i18n-placeholder="filters.keywordsPlaceholder">
<button data-i18n-title="buttons.exportCsv">
<button data-i18n-aria="aria.startButton">
```

`I18n.applyTranslations()` queries all four attribute types and sets `textContent`, `placeholder`, `title`, or `aria-label` respectively.

---

## 15. Configuration Reference

All values can be found in `src/shared/constants.js`. The object is deep-frozen.

### TIMING

| Key | Default | Description |
|---|---|---|
| `MIN_DELAY` | 5000 ms | Minimum inter-request delay |
| `MAX_DELAY` | 10000 ms | Maximum inter-request delay |
| `HUMAN_PAUSE_MIN` | 5000 ms | Minimum human-simulation pause |
| `HUMAN_PAUSE_MAX` | 15000 ms | Maximum human-simulation pause |
| `SESSION_DURATION` | 86400000 ms (24 h) | Session window length |
| `RATE_LIMIT_WAIT` | 900000 ms (15 min) | Rate-limit cool-down duration |
| `PAUSE_CHECK_INTERVAL` | 1000 ms | How often the paused loop re-checks state |

### LIMITS

| Key | Default | Description |
|---|---|---|
| `MAX_SESSION` | 100 | Maximum unfollows per session |
| `BATCH_SIZE` | 50 | Milestone after which a confirmation is required |
| `MAX_UNDO_QUEUE` | 10 | Maximum entries in the undo queue |
| `HISTORY_RETENTION_DAYS` | 30 | Days of unfollow history to retain |
| `MAX_USER_LIST_DISPLAY` | 50 | Maximum rows shown in the popup user list |
| `SCAN_PAGE_SIZE` | 50 | Items requested per API page |
| `CHART_DAYS` | 30 | Days shown in the activity chart |

---

---

<a name="türkçe"></a>

# Türkçe

## İçindekiler

1. [Projeye Genel Bakış](#1-projeye-genel-bakış)
2. [Teknoloji Yığını](#2-teknoloji-yığını)
3. [Proje Yapısı](#3-proje-yapısı)
4. [Mimari ve Veri Akışı](#4-mimari-ve-veri-akışı)
5. [Content Script Modülleri](#5-content-script-modülleri)
6. [Popup Modülleri](#6-popup-modülleri)
7. [Paylaşılan Modüller](#7-paylaşılan-modüller)
8. [Arka Plan Service Worker](#8-arka-plan-service-worker)
9. [Instagram API Uç Noktaları](#9-instagram-api-uç-noktaları)
10. [Storage Şeması](#10-storage-şeması)
11. [Mesaj Protokolü](#11-mesaj-protokolü)
12. [İki Aşamalı Tarama Algoritması](#12-i̇ki-aşamalı-tarama-algoritması)
13. [Hız Sınırı ve Güvenlik](#13-hız-sınırı-ve-güvenlik)
14. [Çoklu Dil Desteği (i18n)](#14-çoklu-dil-desteği-i18n)
15. [Yapılandırma Referansı](#15-yapılandırma-referansı)

---

## 1. Projeye Genel Bakış

**Instagram Unfollow Radar**, kullanıcıların Instagram'da kendilerini takip etmeyen hesapları tespit edip takipten çıkmasına yardımcı olan bir Chrome Uzantısıdır (Manifest V3).

Temel özellikler:

- Instagram'ın dahili REST API'sini kullanarak takipçi ve takip edilen listelerini sayfa sayfa otomatik çeker
- Takipten çıkarılacakları küme farkıyla (takip edilenler ∖ takipçiler) belirler
- Beyaz liste ve anahtar kelime tabanlı atlama kurallarını destekler
- Değişiklik yapmadan ön izleme imkânı sunan "Dry Run" modu
- Oturum başına hız limiti koruması ve otomatik devam
- İlk 50 işlemde kullanıcı onayı isteyen batch (test) modu
- Son 10 takipten çıkarma işlemini geri almak için undo kuyruğu
- 30 günlük aktivite grafiği ve CSV dışa aktarma
- Tam karanlık mod ve iki dilli (Türkçe / İngilizce) arayüz

---

## 2. Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Uzantı platformu | Chrome Extensions Manifest V3 |
| Programlama dili | Vanilla JavaScript (ES2021, TypeScript yok) |
| Arayüz | Saf HTML5 + CSS3 (framework yok) |
| Build aracı | Yok — dosyalar doğrudan yüklenir |
| Modül deseni | IIFE namespace'leri (content script'ler arası global kapsam paylaşımı) |
| Grafik | [Chartist.js](https://gionkunz.github.io/chartist-js/) (vendor klasöründe) |
| Depolama | `chrome.storage.local` |
| Linting | ESLint (`.eslintrc.json`) |

---

## 3. Proje Yapısı

```
instagram_unfollow_radar/
├── manifest.json               # Uzantı manifestosu (MV3)
├── .eslintrc.json              # ESLint yapılandırması
├── assets/
│   └── icons/                  # icon16.png · icon48.png · icon128.png
├── docs/
│   └── TECHNICAL.md            # Bu dosya
├── locales/
│   ├── en.json                 # İngilizce çeviriler
│   └── tr.json                 # Türkçe çeviriler
├── vendor/
│   └── chartist.min.js         # Grafik kütüphanesi (vendored)
└── src/
    ├── background/
    │   └── index.js            # Service Worker — mesaj aktarıcı
    ├── content/
    │   ├── api.js              # Instagram API çağrıları (fetch katmanı)
    │   ├── storage.js          # chrome.storage işlemleri
    │   ├── filters.js          # Beyaz liste / anahtar kelime filtre yardımcıları
    │   ├── automation.js       # Tarama döngüsü + takipten çıkarma motoru
    │   └── index.js            # State nesnesi + mesaj dinleyici
    ├── popup/
    │   ├── popup.html          # Uzantı popup HTML'i
    │   ├── popup.css           # Popup stilleri (açık + koyu tema)
    │   ├── ui.js               # DOM render işlemleri ve durum güncellemeleri
    │   ├── events.js           # Kullanıcı event handler'ları
    │   └── popup.js            # Init + mesaj yönlendirici
    └── shared/
        ├── constants.js        # Derin-dondurulmuş global sabitler
        └── i18n.js             # Çeviri yükleyici ve uygulayıcı
```

---

## 4. Mimari ve Veri Akışı

Uzantı; yalnızca `chrome.runtime` mesajlaşması aracılığıyla haberleşen üç ayrı yürütme bağlamından oluşur:

```
┌─────────────────────────────┐
│      POPUP (popup.html)     │
│  ui.js · events.js ·        │
│  popup.js · i18n.js ·       │
│  constants.js               │
└──────────┬──────────────────┘
           │ chrome.tabs.sendMessage  (komut gönder)
           │ chrome.runtime.onMessage (durum güncelleme al)
           ▼
┌─────────────────────────────┐
│   BACKGROUND SERVICE WORKER │
│        background/index.js  │
│   (content → popup aktarır) │
└──────────┬──────────────────┘
           │ chrome.runtime.onMessage / sendMessage
           ▼
┌─────────────────────────────┐
│   CONTENT SCRIPT (Instagram)│
│  constants.js               │
│  api.js → storage.js        │
│  filters.js → automation.js │
│  index.js                   │
└─────────────────────────────┘
           │ fetch()
           ▼
    Instagram Dahili API
```

**Komut akışı (popup → content):**
`popup.js`, `chrome.tabs.sendMessage` ile bir action gönderir. Content script'teki `index.js` bunu yakalayarak işi `automation.js`'e devreder.

**Durum akışı (content → popup):**
`automation.js`, `index.js`'deki `sendStatus()` fonksiyonunu çağırır; bu da bir `STATUS_UPDATE` mesajı gönderir. Background service worker bunu popup'a aktarır. `popup.js` mesajı alarak `IGRadarUI.handleStatusUpdate()`'i çağırır.

---

## 5. Content Script Modülleri

Beş dosya, `manifest.json`'daki sıraya göre enjekte edilir. Build aracı olmadığından her dosya API'sini global bir IIFE namespace olarak sunar; daha önce yüklenen dosyalar, sonraki dosyalarda global olarak kullanılabilir.

### 5.1 `api.js`

**Sorumluluk:** Tüm ağ I/O işlemleri. Sıfır değişebilir state.

| Dışa aktarım | Açıklama |
|---|---|
| `IGRadarAPI.getCurrentUserId()` | `ds_user_id` cookie'sini okur |
| `IGRadarAPI.fetchFollowingPage(userId, cursor, signal)` | Takip edilenler listesinin bir sayfasını çeker |
| `IGRadarAPI.fetchFollowersPage(userId, cursor, signal)` | Takipçi listesinin bir sayfasını çeker |
| `IGRadarAPI.unfollowUser(userId, signal)` | `/friendships/destroy/`'a POST gönderir |
| `IGRadarAPI.refollowUser(userId, signal)` | `/friendships/create/`'e POST gönderir |

Ayrıca `RateLimitError` sınıfını tanımlar (HTTP 429'da fırlatılır); `automation.js` bunu yakalayarak hız limiti durdurma akışını tetikler.

Tüm fetch fonksiyonları `AbortSignal` kabul eder. Kullanıcı Durdur'a bastığında `index.js`, `state.abortController.abort()`'u çağırarak beklemedeki tüm fetch işlemlerini temiz biçimde sonlandırır.

### 5.2 `storage.js`

**Sorumluluk:** Tüm `chrome.storage.local` okuma ve yazma işlemleri.

| Dışa aktarım | Açıklama |
|---|---|
| `IGRadarStorage.loadState(state)` | Tüm anahtarları değişebilir state nesnesine okur |
| `IGRadarStorage.saveSessionProgress(...)` | Sayaçları kalıcı olarak kaydeder |
| `IGRadarStorage.updateDailyStats()` | Bugünkü takipten çıkarma sayacını artırır |
| `IGRadarStorage.addToHistory(username, reason)` | Geçmişe kayıt ekler; 30 günden eski kayıtları siler |
| `IGRadarStorage.setRateLimitUntil(timestamp)` | Hız limiti bitiş zamanını kaydeder |
| `IGRadarStorage.clearRateLimit()` | Otomatik devamda hız limiti kaydını temizler |

### 5.3 `filters.js`

**Sorumluluk:** Saf, durumsuz filtre mantığı.

| Dışa aktarım | Açıklama |
|---|---|
| `IGRadarFilters.shouldSkipUser(username, displayText, whitelist, keywords)` | `{ skip: boolean, reason: string\|null }` döner |

Bir kullanıcı atlanır eğer:
1. Normalize edilmiş kullanıcı adı `whitelist`'te anahtar olarak varsa
2. `displayText` (kullanıcı adı + tam ad) `keywords` listesindeki herhangi bir kelimeyi içeriyorsa

### 5.4 `automation.js`

**Sorumluluk:** İki aşamalı tarama döngüsünü yönetir. `api.js`, `storage.js` ve `filters.js`'i çağırır.

| Dışa aktarım | Açıklama |
|---|---|
| `IGRadarAutomation.mainLoop(state, sendStatus)` | Giriş noktası; Aşama 1'i çalıştırır, ardından Aşama 2'yi |

İç fonksiyonlar (dışa aktarılmaz):

| Fonksiyon | Açıklama |
|---|---|
| `randomDelay(min, max)` | Rastgele ms gecikmeden sonra çözülen Promise döner |
| `handleRateLimit(state, sendStatus)` | Oturumu duraklatır; `setTimeout` ile otomatik devamı planlar |
| `processUnfollow(user, state, sendStatus, signal)` | Bir gerçek/dry-run takipten çıkarma yapar; sayaçları günceller |
| `buildFollowerSet(userId, state, sendStatus)` | Aşama 1 — tüm takipçileri bir `Set`'e indirir |
| `scanPage(...)` | Aşama 2 yardımcısı — bir takip edilen sayfasını çeker; takipçi olmayanları kuyruğa ekler |

### 5.5 `index.js`

**Sorumluluk:** Oturum `state` nesnesine sahip olur ve `chrome.runtime.onMessage` dinleyicisini yönetir. Orchestrator rolü üstlenir — tüm işleri yukarıdaki modüllere devreder.

**State nesnesi yapısı:**

```js
{
    isRunning:       boolean,
    isPaused:        boolean,
    testMode:        boolean,    // kullanıcı onaylayıncaya kadar true
    testComplete:    boolean,
    unfollowQueue:   Array<{id, username}>,
    processedUsers:  Set<string>,
    sessionCount:    number,
    totalUnfollowed: number,
    keywords:        string[],
    whitelist:       Object,
    dryRunMode:      boolean,
    undoQueue:       Array<{id, username, timestamp}>,
    rateLimitUntil:  number|null,
    abortController: AbortController|null
}
```

---

## 6. Popup Modülleri

Script'ler `popup.html`'de şu sırayla yüklenir:

```
vendor/chartist.min.js → constants.js → i18n.js → ui.js → events.js → popup.js
```

### 6.1 `ui.js` — `IGRadarUI`

**Sorumluluk:** Tüm DOM manipülasyonu. `fetch` çağrısı yok, `chrome.tabs.sendMessage` yok.

Temel dışa aktarımlar: `cacheElements`, `el` (element cache), `createElement`, `switchTab`, `updateStatus`, `setRunning`, `renderKeywordList`, `renderWhitelistList`, `applyTheme`, `renderChart`, `addUserToList`, `handleStatusUpdate`, `handleRateLimitMessage`.

`el`, `cacheElements()` tarafından yerinde değiştirilen tek bir paylaşılan nesnedir; dolayısıyla `IGRadarUI.el`'e başvuran tüm modüller her zaman güncel DOM referanslarını görür.

### 6.2 `events.js` — `IGRadarEvents`

**Sorumluluk:** Kullanıcı kaynaklı event'ler. Content script ile iletişim için `chrome.tabs.sendMessage`, DOM güncellemeleri için `IGRadarUI.*` çağırır.

Temel dışa aktarımlar: `setCurrentTab`, `setup`, `handleRemoveKeyword`, `handleRemoveWhitelist`, `handleUndoSingleUser`, `handleAddToWhitelistFromList`.

`setup()`, `IGRadarUI.cacheElements()`'ten sonra çağrılmalıdır.

### 6.3 `popup.js`

**Sorumluluk:** Giriş noktası. Tüm modülleri başlatır, `chrome.runtime.onMessage` dinleyicisini kaydeder ve ilk çalışma durumunu kontrol eder.

```
init()
  ├── IGRadarUI.cacheElements()
  ├── IGRadarUI.loadTheme()
  ├── I18n.init()
  ├── chrome.tabs.query → IGRadarEvents.setCurrentTab(tab)
  ├── IGRadarUI.load*() × 5 (paralel)
  ├── IGRadarEvents.setup()
  ├── chrome.runtime.onMessage.addListener(handleMessage)
  └── chrome.tabs.sendMessage GET_STATUS → gerekirse IGRadarUI.setRunning(true)
```

---

## 7. Paylaşılan Modüller

### 7.1 `constants.js`

Tüm yapılandırılabilir değerler, `deepFreeze()` ile **özyinelemeli olarak dondurulmuş** tek bir `Constants` nesnesinde toplanır. Yanlışlıkla yapılan herhangi bir değiştirme, strict modda `TypeError` fırlatır.

Başlıca sabit grupları: `TIMING`, `LIMITS`, `API`, `STORAGE_KEYS`, `MESSAGE_TYPES`, `ACTIONS`, `STATUS`, `USER_ACTIONS`, `THEMES`, `LOCALES`.

### 7.2 `i18n.js`

`locales/<locale>.json` dosyasını `fetch(chrome.runtime.getURL(...))` aracılığıyla yükler. Çeviriler ilk yüklemeden sonra bellekte önbelleğe alınır. `data-i18n`, `data-i18n-placeholder`, `data-i18n-title` ve `data-i18n-aria` attribute'larını iterasyonla uygular.

İlk açılışta (kayıtlı tercih yoksa), yerel `chrome.i18n.getUILanguage()` ile otomatik algılanır; algılanan dil desteklenmiyorsa `'tr'`'ye geri düşer.

---

## 8. Arka Plan Service Worker

`src/background/index.js` bir **mesaj aktarıcısı** görevi görür. Content script'ler doğrudan popup'a (kapalı olabilir) mesaj gönderemez; background worker bu köprüyü kurar.

`STATUS_UPDATE`, `TEST_COMPLETE`, `RATE_LIMIT_HIT` ve `USER_PROCESSED` mesaj tiplerini dinler ve `chrome.runtime.sendMessage` aracılığıyla yeniden yayınlar.

---

## 9. Instagram API Uç Noktaları

Tüm uç noktalar Instagram'ın özel/dahili API'sine aittir. Hiçbir resmi genel API kullanılmamaktadır.

| Amaç | Yöntem | URL deseni |
|---|---|---|
| Takip edilenler listesi sayfası | GET | `/api/v1/friendships/{userId}/following/?count=50&max_id={cursor}` |
| Takipçi listesi sayfası | GET | `/api/v1/friendships/{userId}/followers/?count=50&max_id={cursor}` |
| Kullanıcı takipten çıkar | POST | `/api/v1/friendships/destroy/{targetUserId}/` |
| Kullanıcıyı yeniden takip et | POST | `/api/v1/friendships/create/{targetUserId}/` |

**Gerekli istek başlıkları:**

| Başlık | Değer |
|---|---|
| `X-IG-App-ID` | `936619743392459` |
| `X-CSRFToken` | `csrftoken` cookie değeri |
| `X-Requested-With` | `XMLHttpRequest` |
| `Content-Type` (yalnızca POST) | `application/x-www-form-urlencoded` |

Giriş yapmış kullanıcının ID'si `ds_user_id` cookie'sinden okunur.

---

## 10. Storage Şeması

Tüm anahtarlar `chrome.storage.local` altında saklanır.

| Anahtar | Tip | Açıklama |
|---|---|---|
| `igSessionCount` | `number` | Mevcut 24 saatlik pencerede yapılan takipten çıkarmalar |
| `igSessionStart` | `number` | Mevcut oturumun başladığı epoch ms |
| `igTotalUnfollowed` | `number` | Tüm zamanların takipten çıkarma sayısı |
| `igLastRun` | `string` | Son takipten çıkarma işleminin ISO 8601 zaman damgası |
| `igTestMode` | `boolean` | Batch duraklamanın etkin olup olmadığı |
| `igTestComplete` | `boolean` | Kullanıcının batch sonrasına devam etmeyi onaylayıp onaylamadığı |
| `igKeywords` | `string[]` | Küçük harfli anahtar kelime atlama listesi |
| `igWhitelist` | `Object` | `{ [kullaniciadi]: { addedDate: number } }` |
| `igDryRunMode` | `boolean` | Dry-run bayrağı |
| `igUndoQueue` | `Array` | `[{ id, username, timestamp }]` maks. 10 öğe |
| `igRateLimitUntil` | `number\|null` | Hız limitinin biteceği epoch ms |
| `igUnfollowStats` | `Object` | `{ daily: { [YYYY-MM-DD]: { unfollowed, timestamp } } }` |
| `igUnfollowHistory` | `Array` | `[{ username, date, reason }]` — son 30 gün |
| `igTheme` | `'light'\|'dark'` | Seçili arayüz teması |
| `igLanguage` | `'tr'\|'en'` | Seçili yerel dil |

---

## 11. Mesaj Protokolü

Mesajlar iki yönde `chrome.runtime` mesajlaşması üzerinden akar.

### Popup → Content (`chrome.tabs.sendMessage` aracılığıyla)

| `action` | Yük | Açıklama |
|---|---|---|
| `START` | — | Otomasyon döngüsünü başlat |
| `STOP` | — | İptal et ve durdur |
| `CONTINUE_TEST` | — | Batch kilometre taşı geçilsin |
| `GET_STATUS` | — | Çalışma durumunu sorgula |
| `UPDATE_KEYWORDS` | `{ keywords: string[] }` | Anahtar kelime listesini eşitle |
| `UPDATE_WHITELIST` | `{ whitelist: Object }` | Beyaz listeyi eşitle |
| `TOGGLE_DRY_RUN` | `{ enabled: boolean }` | Dry-run modunu değiştir |
| `UNDO_LAST` | — | En son takipten çıkarılan kullanıcıyı yeniden takip et |
| `UNDO_SINGLE` | `{ username: string }` | Belirli bir kullanıcıyı yeniden takip et |

### Content → Popup (background aktarıcı aracılığıyla)

| `type` | Temel alanlar | Açıklama |
|---|---|---|
| `STATUS_UPDATE` | `status`, `sessionCount`, `totalUnfollowed` | Genel durum yayını |
| `TEST_COMPLETE` | — | Batch kilometre taşına ulaşıldı |
| `RATE_LIMIT_HIT` | `{ until, remainingMinutes }` | Hız limiti algılandı |
| `USER_PROCESSED` | `{ username, action, timestamp }` | Bir kullanıcı işlendi |

---

## 12. İki Aşamalı Tarama Algoritması

Instagram'ın `/following/` API'si `followed_by` alanını döndürmediğinden, takipçi olmayan kişiler yalnızca takip edilen listesinden belirlenememektedir. Uzantı bunu iki aşamalı bir yaklaşımla çözer:

**Aşama 1 — Takipçi kümesi oluştur**

`/followers/` üzerinden tüm sayfalar tükenene kadar sayfa sayfa ilerler ve her takipçinin PK'sini (birincil anahtar) bir `Set<string>`'e depolar.

```
followerSet = new Set()
cursor = null
döngü:
  sayfa = GET /followers/?count=50&max_id={cursor}
  sayfadaki her kullanıcı için:
    followerSet.add(String(user.pk))
  cursor = sayfa.next_max_id
cursor null olana kadar
```

**Aşama 2 — Takip edilen listesini tara**

`/following/` üzerinden sayfa sayfa ilerler. PK'si `followerSet`'te **olmayan** her kullanıcı takipçi değildir ve (beyaz liste/anahtar kelime filtrelerine tabi olarak) `unfollowQueue`'ya eklenir. Kuyruk, sayfa çekmeleri arasında boşaltılır.

```
cursor = null
döngü:
  eğer unfollowQueue boş ve hasMore:
    sayfa = GET /following/?count=50&max_id={cursor}
    sayfadaki her kullanıcı için:
      eğer user.pk followerSet'te yoksa ve shouldSkip değilse:
        unfollowQueue.push(user)
    cursor = sayfa.next_max_id
  
  unfollowQueue boş olana kadar:
    user = unfollowQueue.shift()
    POST /friendships/destroy/{user.id}/
    randomDelay(5s – 10s) bekle
    ara sıra ekstra humanPause(5s – 15s) bekle
```

---

## 13. Hız Sınırı ve Güvenlik

| Güvenlik Önlemi | Değer | Açıklama |
|---|---|---|
| İstekler arası gecikme | 5 – 10 sn | Her API çağrısı arasında rastgele gecikme |
| İnsan simülasyonu olasılığı | %10 | Ek 5 – 15 sn duraklama ihtimali |
| Oturum limiti | 100 takipten çıkarma / 24 saat | Sabit üst sınır; `SESSION_DURATION` sonrası sıfırlanır |
| Batch kilometre taşı | 50 | Kullanıcı devam için onay vermeli |
| Hız limiti soğuma | 15 dk | HTTP 429'da otomatik duraklama + devam |
| AbortController | Her fetch'te | Durdur'a basıldığında anında temiz iptal |

---

## 14. Çoklu Dil Desteği (i18n)

Çeviriler `locales/tr.json` ve `locales/en.json` dosyalarında bulunur. Anahtarlar noktalı gösterim grupları kullanır (`status.ready`, `buttons.start` vb.).

HTML öğeleri `data-i18n` attribute'larıyla işaretlenir:

```html
<span data-i18n="status.ready">Hazır</span>
<input data-i18n-placeholder="filters.keywordsPlaceholder">
<button data-i18n-title="buttons.exportCsv">
<button data-i18n-aria="aria.startButton">
```

`I18n.applyTranslations()` dört attribute tipini sorgulayarak sırasıyla `textContent`, `placeholder`, `title` veya `aria-label` değerlerini ayarlar.

---

## 15. Yapılandırma Referansı

Tüm değerler `src/shared/constants.js` içinde bulunur. Nesne derin-dondurulmuştur.

### TIMING

| Anahtar | Varsayılan | Açıklama |
|---|---|---|
| `MIN_DELAY` | 5000 ms | Minimum istek arası gecikme |
| `MAX_DELAY` | 10000 ms | Maksimum istek arası gecikme |
| `HUMAN_PAUSE_MIN` | 5000 ms | Minimum insan simülasyonu duraklaması |
| `HUMAN_PAUSE_MAX` | 15000 ms | Maksimum insan simülasyonu duraklaması |
| `SESSION_DURATION` | 86400000 ms (24 saat) | Oturum penceresi uzunluğu |
| `RATE_LIMIT_WAIT` | 900000 ms (15 dk) | Hız limiti soğuma süresi |
| `PAUSE_CHECK_INTERVAL` | 1000 ms | Duraklatılmış döngünün state'i yeniden kontrol sıklığı |

### LIMITS

| Anahtar | Varsayılan | Açıklama |
|---|---|---|
| `MAX_SESSION` | 100 | Oturum başına maksimum takipten çıkarma |
| `BATCH_SIZE` | 50 | Onay gerektiren kilometre taşı |
| `MAX_UNDO_QUEUE` | 10 | Undo kuyruğundaki maksimum öğe sayısı |
| `HISTORY_RETENTION_DAYS` | 30 | Saklanan takipten çıkarma geçmişinin günü |
| `MAX_USER_LIST_DISPLAY` | 50 | Popup kullanıcı listesinde gösterilen maksimum satır |
| `SCAN_PAGE_SIZE` | 50 | API sayfa başına istenen öğe sayısı |
| `CHART_DAYS` | 30 | Aktivite grafiğinde gösterilen gün sayısı |
