const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const SK = {
    IS_PREMIUM: 'igIsPremium',
    LICENSE_KEY: 'igLicenseKey',
    LICENSE_EMAIL: 'igLicenseEmail',
    LICENSE_LAST_CHECK: 'igLicenseLastCheck',
    LICENSE_GRACE_UNTIL: 'igLicenseGraceUntil',
    LICENSE_STATUS: 'igLicenseStatus'
};

function loadLicenseService({ initial = {}, fetchImpl, now = 1000000 }) {
    const stored = structuredClone(initial);
    const context = vm.createContext({
        Constants: {
            STORAGE_KEYS: SK,
            GUMROAD: {
                PRODUCT_PERMALINK: 'product',
                VERIFY_URL: 'https://api.gumroad.test/verify',
                REVALIDATE_INTERVAL: 12 * 60 * 60 * 1000,
                OFFLINE_GRACE_PERIOD: 72 * 60 * 60 * 1000
            }
        },
        Date: { now: () => now },
        URLSearchParams,
        fetch: fetchImpl,
        chrome: {
            storage: {
                local: {
                    async get(keys) {
                        return Object.fromEntries(keys
                            .filter(key => stored[key] !== undefined)
                            .map(key => [key, structuredClone(stored[key])]));
                    },
                    async set(values) {
                        Object.assign(stored, structuredClone(values));
                    }
                }
            }
        }
    });
    const source = fs.readFileSync(path.join(root, 'src/shared/gumroadLicense.js'), 'utf8');
    vm.runInContext(source, context);
    return { service: vm.runInContext('IGRadarGumroadLicense', context), stored };
}

function response(json, status = 200) {
    return { status, json: async () => json };
}

test('refunds, disputes, chargebacks, and ended subscriptions revoke Premium', () => {
    const { service } = loadLicenseService({ fetchImpl: async () => response({}) });
    const fields = [
        'refunded',
        'disputed',
        'chargebacked',
        'subscription_ended_at',
        'subscription_cancelled_at',
        'subscription_failed_at'
    ];

    for (const field of fields) {
        const value = field.startsWith('subscription_') ? '2026-08-30T00:00:00Z' : true;
        const result = service.evaluateResponse({ success: true, purchase: { [field]: value } });
        assert.equal(result.valid, false, field);
    }
});

test('successful activation stores a fresh validation window', async () => {
    const { service, stored } = loadLicenseService({
        fetchImpl: async () => response({
            success: true,
            purchase: { email: 'buyer@example.com' }
        })
    });

    const result = await service.activate('valid-key');

    assert.equal(result.valid, true);
    assert.equal(stored[SK.IS_PREMIUM], true);
    assert.equal(stored[SK.LICENSE_KEY], 'valid-key');
    assert.equal(stored[SK.LICENSE_EMAIL], 'buyer@example.com');
    assert.equal(stored[SK.LICENSE_LAST_CHECK], 1000000);
    assert.ok(stored[SK.LICENSE_GRACE_UNTIL] > stored[SK.LICENSE_LAST_CHECK]);
});

test('a revoked license is downgraded immediately after a successful API response', async () => {
    const { service, stored } = loadLicenseService({
        initial: {
            [SK.IS_PREMIUM]: true,
            [SK.LICENSE_KEY]: 'revoked-key',
            [SK.LICENSE_GRACE_UNTIL]: 999999999
        },
        fetchImpl: async () => response({
            success: true,
            purchase: { refunded: true }
        })
    });

    const result = await service.revalidate({ force: true });

    assert.equal(result.isPremium, false);
    assert.equal(result.reason, 'refunded');
    assert.equal(stored[SK.IS_PREMIUM], false);
});

test('an invalid-license HTTP response bypasses offline grace', async () => {
    const { service } = loadLicenseService({
        initial: {
            [SK.IS_PREMIUM]: true,
            [SK.LICENSE_KEY]: 'invalid-key',
            [SK.LICENSE_GRACE_UNTIL]: 999999999
        },
        fetchImpl: async () => response({}, 404)
    });

    const result = await service.revalidate({ force: true });

    assert.equal(result.isPremium, false);
    assert.equal(result.reason, 'invalid');
});

test('network failure keeps Premium only inside the offline grace period', async () => {
    const networkFailure = async () => { throw new Error('offline'); };
    const active = loadLicenseService({
        initial: {
            [SK.IS_PREMIUM]: true,
            [SK.LICENSE_KEY]: 'offline-key'
        },
        fetchImpl: networkFailure
    });
    const expired = loadLicenseService({
        initial: {
            [SK.IS_PREMIUM]: true,
            [SK.LICENSE_KEY]: 'offline-key',
            [SK.LICENSE_GRACE_UNTIL]: 999999
        },
        fetchImpl: networkFailure
    });

    const activeResult = await active.service.revalidate({ force: true });
    const expiredResult = await expired.service.revalidate({ force: true });

    assert.equal(activeResult.isPremium, true);
    assert.equal(activeResult.reason, 'offline_grace');
    assert.equal(expiredResult.isPremium, false);
    assert.equal(expiredResult.reason, 'offline_grace_expired');
});
