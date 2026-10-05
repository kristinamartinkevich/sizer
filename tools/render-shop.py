"""Builds a renderable copy of a saved shop page with Sizer injected, for store renders and eyeballing.

    python3 tools/render-shop.py zalando https://www.zalando.co.uk/

Reads tests/fixtures/shops/<name>.html, writes store/render/<name>.html, which the demo server serves
at http://localhost:8766/store/render/<name>.html. The stub profile is the demo one (Zara 38, jeans 27).
"""
import re, sys, pathlib
name, base = sys.argv[1], sys.argv[2]
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'tests/fixtures/shops' / f'{name}.html').read_text()
html = re.sub(r'<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>', '', html, flags=re.I)
html = re.sub(r'<head>', f'<head><base href="{base}">', html, count=1, flags=re.I)
stub = """<script>
window.chrome = { runtime: { getURL: (p) => 'http://localhost:8766/' + p, sendMessage: async () => ({}), onMessage: { addListener: () => {} } },
  storage: { sync: { get: (d, cb) => cb({ profile: { anchors: [{ brand: 'Zara', type: 'jeans', size: '38', fit: 'perfect' }, { brand: '', type: 'jeans', size: '27', fit: 'perfect' }], waist: '', hip: '', inseam: '', footLength: '', unit: 'cm', fitPreference: 'regular', theme: 'system' } }) },
    local: { get: (d, cb) => cb(typeof d === 'string' ? {} : d) }, onChanged: { addListener: () => {} } } };
</script>
""" + ''.join(f'<script src="http://localhost:8766/src/{f}.js"></script>\n' for f in ['brands', 'charts-store', 'charts', 'defaults', 'engine', 'extract', 'panel-style', 'content'])
# the shop's own scripts must not run again from a file: they would re-render and fight the snapshot
html = re.sub(r'<script\b(?![^>]*application/ld\+json)[^>]*>.*?</script>', '', html, flags=re.S | re.I)
html = html.replace('</body>', stub + '</body>', 1)
out = root / 'store/render' / f'{name}.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
print(out, len(html))
