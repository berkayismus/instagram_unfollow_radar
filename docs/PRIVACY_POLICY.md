# Privacy Policy — Instagram Unfollow Radar

**Last updated: March 2026**

---

## Overview

Instagram Unfollow Radar ("the Extension") is a Chrome browser extension that helps users identify and unfollow Instagram accounts that do not follow them back. This Privacy Policy explains what data the Extension accesses, how it is used, and what it does not do.

**Short version:** The Extension collects no personal data, sends no data to any external server, and stores only your own preferences locally on your device.

---

## 1. Data We Do NOT Collect

The Extension does **not** collect, transmit, store on any server, or share any of the following:

- Personal information (name, email address, phone number, age, etc.)
- Authentication credentials (passwords, tokens, cookies)
- Instagram account content (posts, messages, stories, comments)
- Browsing history or activity on any website other than instagram.com
- Location data
- Financial or payment information
- Device identifiers

---

## 2. How the Extension Works

When you click Start, the Extension:

1. Reads your Instagram user ID from the `ds_user_id` cookie that Instagram has already set in your browser during your normal login.
2. Uses that ID to call Instagram's own internal API — the same API Instagram's website uses — to fetch your followers and following lists as JSON data.
3. Compares the two lists **entirely in your browser's memory** to identify accounts that do not follow you back.
4. Optionally sends unfollow requests to Instagram's API on your behalf, again using your existing authenticated session.

At no point does any data leave your browser except to instagram.com directly.

---

## 3. Data Stored Locally

The Extension stores the following data **exclusively on your local device** using the browser's built-in `chrome.storage.local` API. This data never leaves your device.

| Data | Purpose |
|---|---|
| Whitelist (list of usernames) | Users you have chosen to protect from being unfollowed |
| Keyword filters | Words used to skip matching accounts |
| Theme preference (light/dark) | UI appearance setting |
| Language preference (TR/EN) | UI language setting |
| Session statistics | Unfollow count, last-run timestamp, rate-limit state |
| Unfollow history | Log of recently unfollowed accounts (retained for 30 days) |
| Undo queue | Up to 10 recently unfollowed accounts for the undo feature |

All of this data can be cleared at any time by clicking the Reset button in the Extension or by removing the Extension from Chrome.

---

## 4. Permissions Used

The Extension requests only the minimum permissions necessary:

| Permission | Why it is needed |
|---|---|
| `storage` | To save your settings and statistics locally on your device |
| Host access to `https://www.instagram.com/*` | To inject the automation script into instagram.com and to call Instagram's internal API using your existing logged-in session |

The Extension does **not** request access to your tabs, browsing history, clipboard, camera, microphone, or any other sensitive browser capability.

---

## 5. Third-Party Services

The Extension does **not** use any third-party analytics, advertising, tracking, or crash-reporting services.

The only external communication is with `instagram.com`, using your own authenticated session, solely to perform the follower/following comparison you explicitly requested.

The charting library (Chartist.js) is bundled within the Extension package and makes no network requests.

---

## 6. Remote Code

The Extension does **not** load or execute any code from external URLs. All scripts are included within the Extension package that you installed. No remote scripts are fetched or executed at runtime.

---

## 7. Children's Privacy

The Extension is not directed at children under the age of 13. It does not knowingly collect any information from children.

---

## 8. Changes to This Policy

If this Privacy Policy is updated, the new version will be published in the Extension's GitHub repository and the "Last updated" date at the top of this document will be revised.

---

## 9. Contact

If you have questions about this Privacy Policy, please open an issue in the GitHub repository:

**https://github.com/berkayismus/instagram_unfollow_radar**

---

*This extension is an independent tool and is not affiliated with, endorsed by, or sponsored by Instagram or Meta Platforms, Inc.*
