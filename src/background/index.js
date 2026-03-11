/**
 * @fileoverview Instagram Unfollow Radar - Background Service Worker
 * @description Handles message relay between content script and popup
 * @version 1.0.0
 */

const IGUnfollowRadarBackground = (function () {
    'use strict';

    function relayMessage(message) {
        try {
            chrome.runtime.sendMessage(message);
        } catch (error) {
            if (!error.message?.includes('Could not establish connection')) {
                console.error('Error relaying message:', error);
            }
        }
    }

    function handleMessage(message, sender, sendResponse) {
        switch (message.type) {
            case 'TEST_COMPLETE':
            case 'STATUS_UPDATE':
            case 'RATE_LIMIT_HIT':
            case 'USER_PROCESSED':
                relayMessage(message);
                break;
            default:
                if (message.type) console.log('Unknown message type:', message.type);
        }
        return true;
    }

    function init() {
        console.log('🟣 Instagram Unfollow Radar - Background Service Worker initialized');
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    return { init };
})();

IGUnfollowRadarBackground.init();
