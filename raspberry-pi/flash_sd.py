"""Flasht een Raspberry Pi OS .img.xz naar een SD-kaart (Windows, als administrator) en zet SSH + gebruiker klaar.

Gebruik (admin):  python flash_sd.py <disknummer> <image.img.xz> <gebruiker> <wachtwoord>
Veiligheid: weigert systeem-/bootschijven, schijven > 64 GB en niet-verwisselbare NVMe-schijven.
"""
import json
import lzma
import subprocess
import sys
import time


def ps(cmd):
    r = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
    return r.stdout.strip()


num, image, user, password = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
d = json.loads(ps(f"Get-Disk -Number {num} | Select Number,Size,IsBoot,IsSystem,BusType | ConvertTo-Json"))
if d["IsBoot"] or d["IsSystem"] or d["BusType"] == "NVMe" or d["Size"] > 64 * 1024**3:
    sys.exit(f"Weiger: schijf {num} ziet er niet uit als een SD-kaart: {d}")
print(f"Schijf {num}: {d['Size'] / 1e9:.1f} GB, {d['BusType']}")

print("Schijf wissen...")
ps(f"Clear-Disk -Number {num} -RemoveData -RemoveOEM -Confirm:$false")
time.sleep(5)

print("Schrijven (kan enkele minuten duren)...")
written = 0
BS = chr(92)
dev = BS + BS + "." + BS + "PhysicalDrive" + str(num)
for attempt in range(15):  # de kaartlezer her-enumereert na Clear-Disk
    try:
        dst = open(dev, "r+b", buffering=0)
        break
    except OSError as e:
        print(f"wachten op {dev}: {e}")
        time.sleep(2)
else:
    sys.exit("Kon de schijf niet openen.")
with lzma.open(image, "rb") as src, dst:
    while True:
        chunk = src.read(4 * 1024 * 1024)
        if not chunk:
            break
        if len(chunk) % 512:
            chunk += b"\0" * (512 - len(chunk) % 512)
        dst.write(chunk)
        written += len(chunk)
        print(f"\r{written / 1e6:.0f} MB", end="", flush=True)
print("\nKlaar met schrijven.")

ps(f"Update-Disk -Number {num}")
time.sleep(3)
letter = ps(f"(Get-Partition -DiskNumber {num} | Where-Object {{ $_.Size -lt 1GB -and $_.Size -gt 100MB }} | Select -First 1 | ForEach-Object {{ if (-not $_.DriveLetter) {{ $_ | Add-PartitionAccessPath -AssignDriveLetter }}; (Get-Partition -DiskNumber {num} -PartitionNumber $_.PartitionNumber).DriveLetter }})")
print(f"Boot-partitie: {letter}:")
if not letter:
    sys.exit("Boot-partitie niet gevonden; zet 'ssh' en userconfig.txt zelf op de boot-partitie.")
boot = f"{letter}:\\"
hashed = subprocess.run(["openssl", "passwd", "-6", password], capture_output=True, text=True).stdout.strip()
open(boot + "ssh", "w").close()
with open(boot + "userconfig.txt", "w", newline="\n") as f:
    f.write(f"{user}:{hashed}\n")
print("SSH aan en gebruiker ingesteld. Haal de kaart er veilig uit.")
