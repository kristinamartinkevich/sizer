"""Builds a renderable copy of a saved shop page with Sizer injected, for store renders and eyeballing.

    python3 tools/render-shop.py zalando https://www.zalando.co.uk/

Reads tests/fixtures/shops/<name>.html, writes store/render/<name>.html, which the demo server serves
at http://localhost:8766/store/render/<name>.html. The stub profile is the demo one (Zara 38, jeans 27).
The scripts are the manifest's own list for that kind of page (a Vinted listing gets the Vinted
reader), so a render never falls behind the extension. SIZER_PORT picks another demo server port.
"""
import json, os, re, sys, pathlib, time
name, base = sys.argv[1], sys.argv[2]
root = pathlib.Path(__file__).resolve().parent.parent
port = os.environ.get('SIZER_PORT', '8766')
manifest = json.loads((root / 'manifest.json').read_text())
vinted = name.startswith('vinted')
scripts = next(cs['js'] for cs in manifest['content_scripts'] if vinted == any('vinted' in m for m in cs['matches']))
html = (root / 'tests/fixtures/shops' / f'{name}.html').read_text()
html = re.sub(r'<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>', '', html, flags=re.I)
html = re.sub(r'<head>', f'<head><base href="{base}">', html, count=1, flags=re.I)
stub = """<script>
window.chrome = { runtime: { id: 'render', getURL: (p) => 'http://localhost:PORT/' + p, sendMessage: async () => ({}), onMessage: { addListener: () => {} } },
  storage: { sync: { get: (d, cb) => cb({ profile: { anchors: [{ brand: 'Zara', type: 'jeans', size: '38', fit: 'perfect' }, { brand: '', type: 'jeans', size: '27', fit: 'perfect' }], waist: '', hip: '', inseam: '', footLength: '', unit: 'cm', fitPreference: 'regular', theme: 'system' } }) },
    local: { get: (d, cb) => cb(typeof d === 'string' ? {} : d) }, onChanged: { addListener: () => {} } } };
</script>
""" + ''.join(f'<script src="http://localhost:{port}/{f}?v={int(time.time())}"></script>\n' for f in scripts)
stub = stub.replace('PORT', port)
# the shop's own scripts must not run again from a file: they would re-render and fight the snapshot
html = re.sub(r'<script\b(?![^>]*application/ld\+json)[^>]*>.*?</script>', '', html, flags=re.S | re.I)
# consent banners would sit on top of every render
html = re.sub(r'<div[^>]+id="onetrust-consent-sdk"[^>]*>.*?</div>\s*</div>\s*</div>\s*</div>', '', html, flags=re.S)
stub = '<style>#onetrust-consent-sdk, #onetrust-banner-sdk, [id^="onetrust"], [class*="cookie-banner" i], [class*="cookieBanner" i], [id*="cookie-banner" i], [class*="consent" i][role="dialog"], #tc-privacy-wrapper, #ca-cookie-overlay, [id^="footer_tc_privacy"], #chrome-welcome-mat, [data-testid="welcome-message"] { display: none !important }</style>\n' + stub
if vinted:
    # A listing is compared with a piece you measured flat, so the Vinted render owns one pair.
    stub = stub.replace("{ brand: '', type: 'jeans', size: '27', fit: 'perfect' }",
                        "{ brand: 'Levi\\'s', type: 'jeans', size: '27', fit: 'perfect', flat: { waist: 36, inseam: 78 } }")
html = html.replace('</body>', stub + '</body>', 1)
# the Vinted reader runs only on a listing path, so its renders live under items/
out = root / 'store/render' / ('items' if vinted else '') / f'{name}.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
print(out, len(html))
