const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function flatten(value, prefix = '', output = {}) {
    for (const [key, item] of Object.entries(value)) {
        const full = prefix ? `${prefix}.${key}` : key;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
            flatten(item, full, output);
        } else {
            output[full] = item;
        }
    }
    return output;
}

test('package and manifest versions stay aligned', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    assert.equal(packageJson.version, manifest.version);
});

test('every file referenced directly by the manifest exists', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const references = [
        manifest.action.default_popup,
        manifest.background.service_worker,
        ...Object.values(manifest.icons),
        ...Object.values(manifest.action.default_icon),
        ...manifest.content_scripts.flatMap(script => script.js)
    ];

    for (const reference of references) {
        assert.equal(fs.existsSync(path.join(root, reference)), true, `Missing ${reference}`);
    }
});

test('popup local script and stylesheet references resolve inside the extension', () => {
    const popupPath = path.join(root, 'src/popup/popup.html');
    const html = fs.readFileSync(popupPath, 'utf8');
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(match => match[1])
        .filter(reference => !reference.startsWith('http') && !reference.startsWith('#'));

    for (const reference of references) {
        const resolved = path.resolve(path.dirname(popupPath), reference);
        assert.equal(fs.existsSync(resolved), true, `Missing popup asset ${reference}`);
        assert.equal(resolved.startsWith(root + path.sep), true, `Asset escapes root: ${reference}`);
    }
});

test('all locales expose the same translation keys', () => {
    const languages = ['tr', 'en', 'de'];
    const translations = Object.fromEntries(languages.map(language => [
        language,
        flatten(JSON.parse(fs.readFileSync(path.join(root, `locales/${language}.json`), 'utf8')))
    ]));
    const expected = Object.keys(translations.tr).sort();

    for (const language of languages.slice(1)) {
        assert.deepEqual(Object.keys(translations[language]).sort(), expected);
    }
});

test('legacy batch pause controls are absent from the shipped extension', () => {
    const shippedText = [
        'src/shared/constants.js',
        'src/content/automation.js',
        'src/content/index.js',
        'src/popup/popup.html',
        'src/popup/popup.js',
        'src/popup/events.js',
        'src/popup/ui.js',
        'locales/tr.json',
        'locales/en.json',
        'locales/de.json'
    ].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

    assert.doesNotMatch(shippedText, /TEST_COMPLETE|CONTINUE_TEST|BATCH_SIZE|testModeAlert|continueBtn/);
});

test('release ZIP output is deterministic', t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-radar-release-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const first = path.join(temporary, 'first.zip');
    const second = path.join(temporary, 'second.zip');
    const script = path.join(root, 'scripts/build_extension.py');

    for (const output of [first, second]) {
        const result = spawnSync('python3', [script, '--output', output], {
            cwd: root,
            encoding: 'utf8'
        });
        assert.equal(result.status, 0, result.stderr || result.stdout);
    }

    const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(digest(first), digest(second));
});
