"""Entry point for TeePublic Bulk Uploader (Flask + Browser Desktop Automation)."""
import os
import sys
import socket
import webbrowser
import threading
import argparse

from server import app, load_csv_data, state


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def parse_arguments():
    parser = argparse.ArgumentParser(description="TeePublic Bulk Uploader")
    parser.add_argument("--csv", help="Path to initial CSV file to load", default=None)
    parser.add_argument("--folder", help="Path to initial artwork folder", default=None)
    parser.add_argument("--host", help="Host interface to bind to (0.0.0.0 for all)", default="0.0.0.0")
    parser.add_argument("--port", help="Port to run Flask server on", type=int, default=int(os.environ.get("PORT", 5050)))
    parser.add_argument("--no-browser", help="Do not open browser automatically", action="store_true")
    return parser.parse_known_args()


def main():
    args, _ = parse_arguments()
    curr_dir = os.path.abspath(os.getcwd())

    # Pre-load files only if explicitly passed via CLI arguments
    if args.csv and os.path.exists(args.csv):
        load_csv_data(args.csv, args.folder or "", source="CLI Arguments")

    lan_ip = get_lan_ip()
    local_url = f"http://127.0.0.1:{args.port}"
    network_url = f"http://{lan_ip}:{args.port}"

    state.add_log("INFO", f"TeePublic Bulk Uploader initialized cleanly at {local_url}")

    if not args.no_browser:
        # Automatically launch default browser after 0.8s
        threading.Timer(0.8, lambda: webbrowser.open(local_url)).start()

    print(f"\n=======================================================")
    print(f"  Magic Fabrica - TeePublic Studio is LIVE!")
    print(f"  • Local Computer:   {local_url}")
    print(f"  • Same Wi-Fi / LAN: {network_url}")
    print(f"=======================================================\n")

    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
