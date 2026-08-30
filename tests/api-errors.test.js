const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadAPI(fetchImpl) {
    const context = vm.createContext({
        Constants: {
            API: {
                APP_ID: 'app',
                FOLLOWING: id => `https://instagram.test/${id}/following`,
                FOLLOWERS: id => `https://instagram.test/${id}/followers`,
                DESTROY: id => `https://instagram.test/${id}/destroy`,
                CREATE: id => `https://instagram.test/${id}/create`,
                WEB_PROFILE_INFO: username => `https://instagram.test/${username}/profile`
            },
            LIMITS: { SCAN_PAGE_SIZE: 50 }
        },
        URLSearchParams,
        document: { cookie: 'ds_user_id=self; csrftoken=csrf' },
        fetch: fetchImpl
    });
    const source = fs.readFileSync(path.join(root, 'src/content/api.js'), 'utf8');
    vm.runInContext(source, context);
    return vm.runInContext('IGRadarAPI', context);
}

function response(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => body
    };
}

test('HTTP failures are classified by actionable Instagram error type', async () => {
    const cases = [
        [429, '', 'rate_limit', true],
        [401, '', 'auth_required', false],
        [403, '{"message":"challenge_required"}', 'challenge_required', false],
        [403, '{"message":"feedback_required"}', 'rate_limit', true],
        [503, '', 'server_error', true]
    ];

    for (const [status, body, code, retriable] of cases) {
        const api = loadAPI(async () => response(status, body));
        await assert.rejects(
            () => api.fetchFollowersPage('self', null),
            err => err.code === code && err.retriable === retriable
        );
    }
});

test('network and invalid JSON responses remain distinct', async () => {
    const offline = loadAPI(async () => { throw new TypeError('offline'); });
    const invalid = loadAPI(async () => response(200, '<html>login</html>'));

    await assert.rejects(
        () => offline.fetchFollowersPage('self', null),
        err => err.code === 'network_error' && err.retriable === true
    );
    await assert.rejects(
        () => invalid.fetchFollowersPage('self', null),
        err => err.code === 'invalid_response' && err.retriable === false
    );
});

test('successful HTTP responses with Instagram failure payloads are classified', async () => {
    const api = loadAPI(async () => response(200, JSON.stringify({
        status: 'fail',
        message: 'feedback_required: Please wait a few minutes'
    })));

    await assert.rejects(
        () => api.unfollowUser('42'),
        err => err.code === 'rate_limit'
    );
});

test('pagination rejects structurally incomplete success payloads', async () => {
    const api = loadAPI(async () => response(200, JSON.stringify({ status: 'ok' })));

    await assert.rejects(
        () => api.fetchFollowingPage('self', null),
        err => err.code === 'invalid_response'
    );
});
