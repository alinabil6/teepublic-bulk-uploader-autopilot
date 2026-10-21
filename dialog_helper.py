"""Standalone native dialog helper running on main thread."""
import sys
import tkinter as tk
from tkinter import filedialog

def pick_folder():
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askdirectory(title="Select Artwork Folder (Desktop, Downloads, etc.)")
    root.destroy()
    if path:
        print(path)

def pick_file():
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Select Listings CSV File",
        filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")]
    )
    root.destroy()
    if path:
        print(path)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "file":
        pick_file()
    else:
        pick_folder()
