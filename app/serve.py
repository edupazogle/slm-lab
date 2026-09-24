#!/usr/bin/env python3
"""Static server for the SLM Lab web app.

Why not `python -m http.server`: the multi-threaded wllama build needs SharedArrayBuffer, which the
browser only grants to a cross-origin-isolated page, i.e. one served with COOP + COEP headers. This
sets them, serves .wasm with the right MIME type, and collects benchmark results.

  serve.py [--port 8097] [--dir web/dist] [--lan | --public]

Binds 127.0.0.1 unless --lan or --public is given (this repo's convention: everything is loopback by default).
--lan is for a phone on the same network, but be warned: a phone reaching this over plain
http://<lan-ip> is NOT a secure context, and the app then does not merely run single-threaded — it
does not start at all. `new Wllama()` throws "No supported storage backend found", because the OPFS
backend needs navigator.storage, which a non-secure context does not expose (measured in Chromium
153 on 2026-09-21; the earlier version of this comment claimed single-threaded operation, and was
wrong). For a phone use HTTPS (tunnel or static host), or `adb reverse tcp:8097 tcp:8097` and open
http://localhost:8097 on the device — localhost IS a secure origin.

POST /api/bench  (application/json, same-origin only) appends one line to bench_results.jsonl.

--public is for a hosted deploy (Railway, see the Dockerfile at the repo root): binds 0.0.0.0 on $PORT, and turns
POST /api/bench off, because on the open internet it would let anyone append to a file on the server's disk. The bench
page keeps its results in the browser either way. Directory listings are off in every mode.
"""
import argparse, json, os, sys, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_BODY = 256 * 1024


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "text/javascript",
                      ".mjs": "text/javascript", ".webmanifest": "application/manifest+json", ".gguf": "application/octet-stream"}

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        # pages and service workers revalidate on every load, so a redeploy is picked up; `self.path` carries the query
        # string, and a service worker can sit under a sub-path (/second-look/sw.js)
        path = urlsplit(self.path).path
        if path.endswith((".html", "/", "sw.js", ".webmanifest")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def list_directory(self, path):
        # no directory listings: a folder without an index.html is a 404, not an index of the files in it
        self.send_error(404)
        return None

    def do_POST(self):
        if self.path != "/api/bench" or not self.server.bench:
            return self.send_error(404)
        # refuse anything a foreign web page could send: wrong content type, or a cross-site Origin
        if (self.headers.get("Content-Type") or "").split(";")[0].strip() != "application/json":
            return self.send_error(415, "application/json only")
        origin, host = self.headers.get("Origin"), self.headers.get("Host")
        if origin and origin.split("://", 1)[-1] != host:
            return self.send_error(403, "cross-origin POST refused")
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= MAX_BODY:
            return self.send_error(413)
        try:
            doc = json.loads(self.rfile.read(n))
        except ValueError:
            return self.send_error(400, "bad json")
        doc["_received"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        doc["_client"] = self.client_address[0]
        with open(self.server.results_path, "a") as f:
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")
        self.send_response(204); self.end_headers()

    def log_message(self, fmt, *args):
        # quiet by default; log only errors and benchmark posts. args may be ints (send_error), so format first.
        line = fmt % args if args else fmt
        if "/api/bench" in line or line.startswith("code "):
            sys.stderr.write("%s %s\n" % (self.client_address[0], line))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT") or 8097), help="default: $PORT, else 8097")
    ap.add_argument("--dir", default=os.path.join(HERE, "web", "dist"))
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--lan", action="store_true", help="bind 0.0.0.0 so a phone on the LAN can reach it")
    mode.add_argument("--public", action="store_true", help="hosted deploy: bind 0.0.0.0, POST /api/bench off")
    ap.add_argument("--results", default=os.path.join(HERE, "bench_results.jsonl"))
    a = ap.parse_args()
    if not os.path.isdir(a.dir):
        sys.exit(f"no such directory: {a.dir}  (run `npm run build` in web/ first)")
    os.chdir(a.dir)
    host = "0.0.0.0" if a.lan or a.public else "127.0.0.1"
    srv = ThreadingHTTPServer((host, a.port), Handler)
    srv.results_path, srv.bench = a.results, not a.public
    results = "off" if a.public else f"-> {a.results}"
    print(f"serving {a.dir} on http://{host}:{a.port}  (COOP/COEP on; bench results {results})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
