import os
import sys
import json
import time
import socket
import webbrowser
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import urllib.parse

PORT = 5051
WORKSPACE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(WORKSPACE, "public")
DATA_FILE = os.path.join(WORKSPACE, "personal_finance_data.json")

class PersonalFinanceHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/financials':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.wfile.write(b'{}')
            return
        elif parsed.path == '/personal_finance_data.json':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
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
    print(f"  Personal Wealth & Financial Terminal is LIVE!")
    print(f"  URL: {url}")
    print(f"=======================================================\n")
    
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    launched = False
    for path in chrome_paths:
        if os.path.exists(path):
            try:
                os.system(f'start "" "{path}" --app={url}')
                launched = True
                break
            except:
                pass
    if not launched:
        webbrowser.open(url)

def run():
    global PORT
    while True:
        try:
            server = HTTPServer(('127.0.0.1', PORT), PersonalFinanceHandler)
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
