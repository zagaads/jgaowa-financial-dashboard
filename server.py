import os
import sys
import json
import time
import socket
import webbrowser
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import urllib.parse

from excel_extractor import extract_and_update_all, FOLDER

PORT = 5050
WORKSPACE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(WORKSPACE, "public")
DATA_FILE = os.path.join(WORKSPACE, "financial_data.json")

CURRENT_VERSION = int(time.time())
LAST_UPDATE_STR = time.strftime("%Y-%m-%d %H:%M:%S")

# File Watcher State
file_timestamps = {}
subscribers = []
subscribers_lock = threading.Lock()

def get_janpriya_timestamps():
    ts_map = {}
    if os.path.exists(FOLDER):
        for fname in os.listdir(FOLDER):
            if fname.endswith(".xlsx") and not fname.startswith("~$"):
                fpath = os.path.join(FOLDER, fname)
                try:
                    ts_map[fname] = os.path.getmtime(fpath)
                except:
                    pass
    return ts_map

def notify_subscribers(version_num):
    with subscribers_lock:
        dead_subs = []
        for q in subscribers:
            try:
                q.put(f"data: {json.dumps({'version': version_num, 'time': time.strftime('%H:%M:%S')})}\n\n")
            except:
                dead_subs.append(q)
        for d in dead_subs:
            subscribers.remove(d)

def file_watcher_thread():
    global CURRENT_VERSION, LAST_UPDATE_STR, file_timestamps
    print(f"[WATCHER ACTIVE] Monitoring folder: {FOLDER}")
    file_timestamps = get_janpriya_timestamps()

    while True:
        try:
            time.sleep(1.5)
            current_ts = get_janpriya_timestamps()
            changed = False
            for fname, mtime in current_ts.items():
                if fname not in file_timestamps or mtime > file_timestamps[fname]:
                    changed = True
                    print(f"\n[EXCEL MODIFICATION DETECTED] File changed: {fname}")
                    break

            if changed:
                file_timestamps = current_ts
                # Wait 0.6s for Excel to finish writing
                time.sleep(0.6)
                res = extract_and_update_all()
                if res:
                    CURRENT_VERSION = res.get("version", int(time.time()))
                    LAST_UPDATE_STR = res.get("last_updated", time.strftime("%Y-%m-%d %H:%M:%S"))
                    print(f"[LIVE RELOAD BROADCAST] Pushing update to open browsers (v={CURRENT_VERSION})...\n")
                    notify_subscribers(CURRENT_VERSION)
        except Exception as e:
            print("[WATCHER EXCEPTION]:", e)

class LiveFinancialBoardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        global CURRENT_VERSION, LAST_UPDATE_STR
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == '/api/version':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            payload = json.dumps({
                "version": CURRENT_VERSION,
                "last_updated": LAST_UPDATE_STR,
                "watcher_active": True
            })
            self.wfile.write(payload.encode('utf-8'))
            return

        elif parsed.path == '/api/sync-now':
            res = extract_and_update_all()
            if res:
                CURRENT_VERSION = res.get("version", int(time.time()))
                LAST_UPDATE_STR = res.get("last_updated", time.strftime("%Y-%m-%d %H:%M:%S"))
                notify_subscribers(CURRENT_VERSION)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "version": CURRENT_VERSION}).encode('utf-8'))
            return

        elif parsed.path == '/api/financials' or parsed.path == '/financial_data.json':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.wfile.write(b'{}')
            return

        return super().do_GET()

def open_browser(port):
    time.sleep(1.2)
    url = f"http://localhost:{port}"
    print(f"\n=======================================================")
    print(f"  JGAOWA Desktop Financial Display Board (Auto-Sync)")
    print(f"  URL: {url}")
    print(f"  Auto File-Watcher: ACTIVE on Janpriya Folder")
    print(f"=======================================================\n")
    webbrowser.open(url)

def run():
    global PORT
    # Initial data parse on startup
    extract_and_update_all()

    # Start file watcher background thread
    threading.Thread(target=file_watcher_thread, daemon=True).start()

    while True:
        try:
            server = HTTPServer(('127.0.0.1', PORT), LiveFinancialBoardHandler)
            break
        except OSError:
            PORT += 1

    threading.Thread(target=open_browser, args=(PORT,), daemon=True).start()
    print(f"Server listening on http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")

if __name__ == '__main__':
    run()
