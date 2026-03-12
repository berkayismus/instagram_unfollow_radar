# Chrome Web Store — Extension Description

## Short Description

> Max 132 characters — paste this into the "Short description" field on the Store dashboard and into `manifest.json`.

```
Automatically find and unfollow Instagram accounts that don't follow you back. Safe delays, whitelist, dry-run mode & stats included.
```

---

## Detailed Description

> Paste everything below the horizontal rule into the "Detailed description" field on the Store dashboard (plain text, no Markdown rendering).

---

**Instagram Unfollow Radar** scans your Instagram following list and automatically unfollows accounts that don't follow you back — all without leaving your browser.

Unlike browser scripts or third-party websites that require your password, this extension works entirely through Instagram's own internal web API inside your existing logged-in session. Your credentials are never touched.

---

**HOW IT WORKS**

The extension runs a two-phase scan entirely within instagram.com:

1. Downloads your complete followers list and stores it locally in memory
2. Pages through your following list and compares — anyone not in your followers list is queued for unfollowing

Each action includes a randomised 5–10 second delay to mimic natural behaviour and reduce the risk of hitting Instagram's rate limits.

---

**FEATURES**

✅ Automatic non-follower detection via Instagram's internal API (no DOM scraping)
✅ Safe random delays (5–10 sec) between every action
✅ Session limit: max 100 unfollows per 24-hour window
✅ Batch mode: pauses after the first 50 unfollows and asks for confirmation
✅ Dry-run mode: preview who would be unfollowed without making any changes
✅ Whitelist: protect specific accounts from ever being unfollowed
✅ Keyword filter: skip accounts whose name or username contains certain words
✅ Undo system: re-follow up to 10 recently unfollowed accounts with one click
✅ 30-day activity chart and CSV export of your unfollow history
✅ Dark mode
✅ Turkish and English UI — language is auto-detected from your browser settings

---

**PRIVACY & PERMISSIONS**

The extension requires the following permissions:

• **activeTab / tabs** — to communicate with the instagram.com page that is already open in your browser
• **storage** — to save your settings (whitelist, keywords, stats) locally on your device
• **host permission for instagram.com** — to make API requests to Instagram using your existing session cookies

No data is sent to any external server. Everything runs locally in your browser. No account credentials are ever read or stored.

---

**USAGE**

1. Go to instagram.com and make sure you are logged in
2. Click the extension icon in the toolbar
3. (Optional) Add keywords or whitelist entries in the Filters tab
4. (Optional) Toggle Dry-run mode to do a safe test run first
5. Click Start — the extension will scan and process automatically
6. After the first 50 users it pauses and waits for your confirmation before continuing
7. Click Stop at any time to pause

---

**IMPORTANT NOTES**

• You must be logged in to instagram.com for the extension to work
• Instagram enforces rate limits on its API. Exceeding them may result in a temporary cooldown — the extension handles this automatically and resumes after 15 minutes
• Instagram's internal API can change without notice, which may temporarily affect the extension's functionality
• Use responsibly and at your own risk
