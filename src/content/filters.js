/**
 * @fileoverview Instagram Unfollow Radar - Filter Helpers
 * @description Pure, stateless functions for deciding whether a user
 *   should be skipped during the unfollow sweep.
 *   No fetch calls, no DOM access, no chrome.* APIs.
 * @version 2.0.0
 */

const IGRadarFilters = (function() {
    'use strict';

    /**
     * Determines whether a given user should be skipped based on
     * the caller-supplied whitelist and keyword rules.
     *
     * @param {string}   username    - the account's username (without @)
     * @param {string}   displayText - combined "username full_name" for keyword matching
     * @param {Object}   whitelist   - { [username]: { addedDate } } map
     * @param {string[]} keywords    - list of lowercase keyword strings
     * @returns {{ skip: boolean, reason: string|null }}
     */
    function shouldSkipUser(username, displayText, whitelist, keywords) {
        const normalized = username.toLowerCase().replace('@', '');

        if (whitelist[normalized]) {
            return { skip: true, reason: 'whitelist' };
        }

        const text = displayText.toLowerCase();
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                return { skip: true, reason: `keyword:${keyword}` };
            }
        }

        return { skip: false, reason: null };
    }

    return { shouldSkipUser };
})();
