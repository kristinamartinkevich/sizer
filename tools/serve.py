"""Static server for the demo pages, store frames and shop captures, with no caching.

    python3 tools/serve.py 8766

The stock http.server sends Last-Modified, so Chrome keeps serving yesterday's content.js on the
demo shop page after an edit. This one tells it not to. It also answers with CORS headers, so a
script injected into a live shop page can fetch Sizer's sources from here, and accepts
`POST /save?name=<shop>` with a page's HTML, which lands in tests/fixtures/shops/<shop>.html.
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOPS = os.path.join(ROOT, "tests", "fixtures", "shops")


class NoCacheHandler(SimpleHTTPRequestHandler):
    # HTTP/1.1 keeps a page's eight script loads on open connections; 1.0 reset them now and then.
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        url = urlsplit(self.path)
        name = parse_qs(url.query).get("name", [""])[0]
        if url.path != "/save" or not re.fullmatch(r"[a-z0-9-]{1,40}", name):
            self.send_response(400)
            self.end_headers()
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        os.makedirs(SHOPS, exist_ok=True)
        with open(os.path.join(SHOPS, f"{name}.html"), "wb") as f:
            f.write(body)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(f"saved {len(body)} bytes".encode())

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
