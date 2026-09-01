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
                WEB_DESTROY: id => `https://instagram.test/${id}/web-unfollow`,
                WEB_CREATE: id => `https://instagram.test/${id}/web-follow`,
                FRIENDSHIP_STATUS: id => `https://instagram.test/${id}/friendship-status`,
                WEB_PROFILE_INFO: username => `https://instagram.test/${username}/profile`
            },
            LIMITS: { SCAN_PAGE_SIZE: 50, API_READ_MAX_ATTEMPTS: 2 },
            TIMING: { API_READ_RETRY_DELAY: 0 }
        },
        URLSearchParams,
        document: { cookie: 'ds_user_id=self; csrftoken=csrf' },
        fetch: fetchImpl,
        setTimeout: callback => callback(),
        console
    });
    const source = fs.readFileSync(path.join(root, 'src/content/api.js'), 'utf8');
    vm.runInContext(source, context);
    return vm.runInContext('IGRadarAPI', context);
}

function response(status, body, extra = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => body,
        ...extra
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
        err => err.code === 'invalid_response' &&
            err.reason === 'html_response' &&
            err.retriable === false
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

test('successful empty unfollow responses are accepted without a duplicate request', async () => {
    let calls = 0;
    const api = loadAPI(async () => {
        calls++;
        return response(204, '');
    });

    assert.equal(await api.unfollowUser('42'), true);
    assert.equal(calls, 1);
});

test('explicit plain-text ok unfollow responses are accepted', async () => {
    const api = loadAPI(async () => response(200, 'ok'));

    assert.equal(await api.unfollowUser('42'), true);
});

test('HTML unfollow responses use the web fallback once', async () => {
    const urls = [];
    const api = loadAPI(async url => {
        urls.push(url);
        if (url.endsWith('/destroy')) return response(200, '<html>not found</html>');
        if (url.endsWith('/web-unfollow')) {
            return response(200, JSON.stringify({ status: 'ok' }));
        }
        const statusCalls = urls.filter(item => item.endsWith('/friendship-status')).length;
        return response(200, JSON.stringify({ following: statusCalls === 1 }));
    });

    assert.equal(await api.unfollowUser('42'), true);
    assert.deepEqual(urls, [
        'https://instagram.test/42/destroy',
        'https://instagram.test/42/friendship-status',
        'https://instagram.test/42/web-unfollow',
        'https://instagram.test/42/friendship-status'
    ]);
});

test('fallback is skipped when the primary HTML response already changed the relationship', async () => {
    const urls = [];
    const api = loadAPI(async url => {
        urls.push(url);
        return url.endsWith('/destroy')
            ? response(200, '<html>response</html>')
            : response(200, JSON.stringify({ following: false }));
    });

    assert.equal(await api.unfollowUser('42'), true);
    assert.deepEqual(urls, [
        'https://instagram.test/42/destroy',
        'https://instagram.test/42/friendship-status'
    ]);
});

test('failed web fallback is reported without another write attempt', async () => {
    let calls = 0;
    const api = loadAPI(async url => {
        calls++;
        if (url.endsWith('/friendship-status')) {
            return response(200, JSON.stringify({ following: true }));
        }
        return response(200, '<html>not found</html>');
    });

    await assert.rejects(
        () => api.unfollowUser('42'),
        err => err.code === 'invalid_response' && err.endpoint === 'unfollow_fallback'
    );
    assert.equal(calls, 3);
});

test('unverifiable relationship state prevents a second write request', async () => {
    const urls = [];
    const api = loadAPI(async url => {
        urls.push(url);
        return url.endsWith('/destroy')
            ? response(200, '<html>not found</html>')
            : response(200, JSON.stringify({ status: 'ok' }));
    });

    await assert.rejects(
        () => api.unfollowUser('42'),
        err => err.code === 'invalid_response' &&
            err.reason === 'missing_friendship_status' &&
            err.endpoint === 'friendship_status'
    );
    assert.equal(urls.some(url => url.endsWith('/web-unfollow')), false);
});

test('fallback success is rejected when the relationship did not change', async () => {
    const api = loadAPI(async url => {
        if (url.endsWith('/destroy')) return response(200, '<html>not found</html>');
        if (url.endsWith('/friendship-status')) {
            return response(200, JSON.stringify({ following: true }));
        }
        return response(200, JSON.stringify({ status: 'ok' }));
    });

    await assert.rejects(
        () => api.unfollowUser('42'),
        err => err.code === 'api_error' &&
            err.reason === 'relationship_change_not_applied' &&
            err.endpoint === 'unfollow_fallback'
    );
});

test('login redirects do not trigger the unfollow fallback', async () => {
    let calls = 0;
    const api = loadAPI(async () => {
        calls++;
        return response(200, '<html>login</html>', {
            redirected: true,
            url: 'https://www.instagram.com/accounts/login/'
        });
    });

    await assert.rejects(
        () => api.unfollowUser('42'),
        err => err.code === 'auth_required'
    );
    assert.equal(calls, 1);
});

test('pagination rejects structurally incomplete success payloads', async () => {
    const api = loadAPI(async () => response(200, JSON.stringify({ status: 'ok' })));

    await assert.rejects(
        () => api.fetchFollowingPage('self', null),
        err => err.code === 'invalid_response'
    );
});

test('safe list reads retry one transient invalid response', async () => {
    let calls = 0;
    const api = loadAPI(async () => {
        calls++;
        return calls === 1
            ? response(200, '')
            : response(200, JSON.stringify({ users: [{ id: '1' }], next_max_id: 'next' }));
    });

    const page = await api.fetchFollowingPage('self', null);

    assert.equal(calls, 2);
    assert.equal(page.users.length, 1);
    assert.equal(page.nextCursor, 'next');
});

test('wrapped Instagram list payloads are normalized', async () => {
    const api = loadAPI(async () => response(200, JSON.stringify({
        data: { users: [{ id: '1' }], next_cursor: 'wrapped-next' }
    })));

    const page = await api.fetchFollowersPage('self', null);

    assert.equal(page.users.length, 1);
    assert.equal(page.nextCursor, 'wrapped-next');
});
