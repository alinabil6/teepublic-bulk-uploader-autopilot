"""Entry point for TeePublic Bulk Uploader (Flask + Browser Desktop Automation)."""
import os
import sys
import webbrowser
import threading
import argparse

from server import app, load_csv_data, state


def parse_arguments():
    parser = argparse.ArgumentParser(description="TeePublic Bulk Uploader")
    parser.add_argument("--csv", help="Path to initial CSV file to load", default=None)
    parser.add_argument("--folder", help="Path to initial artwork folder", default=None)
    parser.add_argument("--port", help="Port to run Flask server on", type=int, default=int(os.environ.get("PORT", 5050)))
    parser.add_argument("--no-browser", help="Do not open browser automatically", action="store_true")
    return parser.parse_known_args()


def main():
    args, _ = parse_arguments()
    curr_dir = os.path.abspath(os.getcwd())

    # Pre-load files only if explicitly passed via CLI arguments
    if args.csv and os.path.exists(args.csv):
        load_csv_data(args.csv, args.folder or "", source="CLI Arguments")

    url = f"http://127.0.0.1:{args.port}"
    state.add_log("INFO", f"TeePublic Bulk Uploader initialized cleanly at {url}")

    if not args.no_browser:
        # Automatically launch default browser after 0.8s
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    print(f"\n=======================================================")
    print(f"  TeePublic Bulk Uploader is running at:")
    print(f"  {url}")
    print(f"=======================================================\n")

    app.run(host="127.0.0.1", port=args.port, debug=False)


if __name__ == "__main__":
    main()
