const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// A browser script finds its dependencies on window (root.SizerX || require('./x.js')). In a page
// there is no require, so every file a script depends on has to be loaded before it, or the page
// stops at "require is not defined". 1.1.1 shipped the fit profile page without review-details.js,
// and nothing typed into it was saved.
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function deps(file) {
  return [...read(file).matchAll(/root\.Sizer\w+\s*\|\|[^;\n]*?require\('\.\/([\w-]+\.js)'\)/g)].map((m) => `src/${m[1]}`);
}

function checkOrder(where, scripts) {
  scripts.forEach((file, i) => {
    if (!file.startsWith('src/')) return;
    for (const dep of deps(file)) {
      const at = scripts.indexOf(dep);
      assert.ok(at !== -1 && at < i, `${where} loads ${file} but ${at === -1 ? 'never loads' : 'loads after it'} ${dep}`);
    }
  });
}

test('finds the dependencies the engine declares', () => {
  assert.deepStrictEqual(deps('src/engine.js'), ['src/brands.js', 'src/charts.js', 'src/review-details.js']);
});

for (const page of fs.readdirSync(path.join(ROOT, 'ui')).filter((f) => f.endsWith('.html'))) {
  test(`ui/${page} loads every script's dependencies before it`, () => {
    const scripts = [...read(`ui/${page}`).matchAll(/<script src="([^"]+)"/g)].map((m) => path.posix.normalize(path.posix.join('ui', m[1])));
    checkOrder(`ui/${page}`, scripts);
  });
}

test('the manifest content scripts load every dependency before the script that needs it', () => {
  const manifest = JSON.parse(read('manifest.json'));
  manifest.content_scripts.forEach((cs, n) => checkOrder(`content_scripts[${n}]`, cs.js || []));
});
