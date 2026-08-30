# Privacy Policy — Instagram Unfollow Radar

Last updated: August 30, 2026

## Overview

Instagram Unfollow Radar processes follower and following information inside the browser. The developer does not operate a server that receives this Instagram data. Premium activation uses Gumroad as described below.

## Data accessed

While you are signed in to Instagram, the extension:

- reads the `ds_user_id` and CSRF cookies needed for authenticated requests;
- requests follower, following, profile, follow, and unfollow data from `instagram.com`;
- compares account lists in browser memory.

The extension does not request your Instagram password, messages, posts, camera, microphone, location, or general browsing history.

## Data stored locally

The following may be stored in `chrome.storage.local`:

- whitelist and keyword filters;
- theme, language, active tab, and dry-run preferences;
- unfollow counters, timestamps, statistics, history, and undo queue;
- watched usernames, account IDs, following snapshots, and detected changes;
- Premium status, license key, and purchase email;
- temporary rate-limit, automation-lock, scan cursor, follower ID, and pending-queue state.

The statistics reset button clears statistics and history only. Other data can be removed through the relevant controls or by uninstalling the extension/clearing its storage.

Instagram-dependent data is stored in separate namespaces for each Instagram account ID used in the browser. Extension-wide preferences and Premium license state remain shared.

## External communication

The extension communicates with:

- `instagram.com` for the requested Instagram operations;
- `api.gumroad.com` when a user submits a Premium license for verification.

The Gumroad request includes the product identifier and license key. Gumroad may return purchase information such as the buyer email. Refer to Gumroad’s privacy policy for its processing practices.

The extension includes no analytics, advertising, tracking, or crash-reporting SDK.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Store settings and operational data locally |
| `https://www.instagram.com/*` | Run the content script and call Instagram APIs |
| `https://api.gumroad.com/*` | Verify an optional Premium license |

## Data control

Removing the extension clears its local storage under normal Chrome behavior. Users may also clear extension data from Chrome settings. Billing and purchase records held by Gumroad must be managed through Gumroad.

## Contact

Questions can be submitted at [github.com/berkayismus/instagram_unfollow_radar/issues](https://github.com/berkayismus/instagram_unfollow_radar/issues).

This extension is independent and is not affiliated with Instagram or Meta Platforms, Inc.
