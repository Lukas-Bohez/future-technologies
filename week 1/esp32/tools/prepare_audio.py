"""Zet de mp3's uit music/ om naar kleine mono-mp3's in data/ (past in de ESP32-flash).

Gebruik:  python tools/prepare_audio.py
Vereist ffmpeg (winget install Gyan.FFmpeg).
Daarna uploaden met:  python -m platformio run -t uploadfs
"""
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / "data"
out.mkdir(exist_ok=True)

if not shutil.which("ffmpeg"):
    sys.exit("ffmpeg niet gevonden. Installeer met: winget install Gyan.FFmpeg")

for old in out.glob("*.mp3"):
    old.unlink()

tracks = sorted((root.parent / "music").glob("*.mp3"))
if not tracks:
    sys.exit("Geen mp3's in music/ gevonden.")

for i, src in enumerate(tracks, 1):
    dst = out / f"track{i}.mp3"
    # mono, 22.05 kHz, 32 kbps => ~1 MB per 4,5 minuten
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
         "-vn", "-ac", "1", "-ar", "22050", "-b:a", "32k", str(dst)],
        check=True,
    )
    print(f"{src.name} -> {dst.name} ({dst.stat().st_size / 1e6:.2f} MB)")
