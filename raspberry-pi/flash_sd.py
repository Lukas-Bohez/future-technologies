"""Schrijft een Raspberry Pi OS image naar een SD-kaart (Windows, als administrator).

Gebruik (admin):
    python flash_sd.py <schijfnummer> <image.img|.img.xz> <gebruiker> <wachtwoord> [firstrun.sh]

Wat het doet:
 1. .xz uitpakken naar .img, zodat we kunnen herstarten en verifieren.
 2. Automatisch mounten tijdelijk uitzetten. Zonder dat mount Windows de nieuwe
    FAT-bootpartitie tijdens het schrijven, wordt de raw handle ongeldig en
    stopt het schrijven met "Bad file descriptor" (dat gebeurde op 19/10).
 3. Image raw wegschrijven met herstel per chunk (schijf heropenen en herhalen).
 4. Teruglezen van de kaart en SHA256 vergelijken met het image.
 5. Bootpartitie een letter geven, 'ssh' + firstrun.sh plaatsen en cmdline.txt patchen.

Veiligheid: weigert systeem-/bootschijven, NVMe en schijven groter dan 64 GB.
"""
import hashlib
import json
import lzma
import os
import subprocess
import sys
import tempfile
import time

CHUNK = 4 * 1024 * 1024
BS = chr(92)
DEV_PREFIX = BS + BS + "." + BS + "PhysicalDrive"

sys.stdout.reconfigure(line_buffering=True)


def ps(cmd):
    r = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


def ps_json(cmd):
    return json.loads(ps(cmd))


def remove_access_paths(num):
    ps(
        f"Get-Partition -DiskNumber {num} -ErrorAction SilentlyContinue | "
        f"ForEach-Object {{ if ($_.DriveLetter) {{ "
        f"Remove-PartitionAccessPath -DiskNumber {num} -PartitionNumber $_.PartitionNumber "
        f"-AccessPath ($_.DriveLetter + ':\\') -ErrorAction SilentlyContinue }} }}"
    )


def clear_disk(num):
    remove_access_paths(num)
    out = ps(f"Clear-Disk -Number {num} -RemoveData -RemoveOEM -Confirm:$false -ErrorAction SilentlyContinue")
    disk = ps_json(f"Get-Disk -Number {num} | Select PartitionStyle,Size | ConvertTo-Json")
    if disk.get("PartitionStyle") not in (None, "RAW"):
        print("Clear-Disk lukte niet, diskpart clean gebruiken...")
        script = os.path.join(tempfile.gettempdir(), "sd_clean.txt")
        with open(script, "w") as f:
            f.write(f"select disk {num}\nclean\nexit\n")
        r = subprocess.run(["diskpart", "/s", script], capture_output=True, text=True)
        print((r.stdout + r.stderr).strip()[-400:])
    return out


def decompress(image):
    """Geeft het pad naar een ongecomprimeerd .img-bestand."""
    if not image.lower().endswith(".xz"):
        return image
    img = image[:-3]
    if os.path.exists(img) and os.path.getsize(img) > 100 * 1024 * 1024:
        print(f"Gebruik bestaand {img} ({os.path.getsize(img) / 1e9:.2f} GB)")
        return img
    print(f"Uitpakken naar {img} ...")
    start = time.time()
    with lzma.open(image, "rb") as src, open(img, "wb") as dst:
        while True:
            chunk = src.read(16 * 1024 * 1024)
            if not chunk:
                break
            dst.write(chunk)
    print(f"Uitgepakt: {os.path.getsize(img) / 1e9:.2f} GB in {time.time() - start:.0f} s")
    return img


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(16 * 1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def open_dev(dev):
    for _ in range(30):
        try:
            return open(dev, "r+b", buffering=0)
        except OSError as e:
            print(f"wachten op {dev}: {e}")
            time.sleep(2)
    sys.exit(f"Kon {dev} niet openen.")


def write_image(dev, img, num):
    size = os.path.getsize(img)
    written = 0
    failures = 0
    handle = open_dev(dev)
    with open(img, "rb") as src:
        while True:
            chunk = src.read(CHUNK)
            if not chunk:
                break
            while True:
                try:
                    handle.seek(written)
                    handle.write(chunk)
                    break
                except OSError as e:
                    failures += 1
                    print(f"\nschrijffout bij {written / 1e6:.0f} MB ({e}); herstel {failures}")
                    if failures > 25:
                        sys.exit("Te veel schrijffouten: SD-kaart of kaartlezer is waarschijnlijk defect.")
                    try:
                        handle.close()
                    except OSError:
                        pass
                    # Een stiekem gemounte partitie kan de handle blokkeren.
                    ps("mountvol /N")
                    remove_access_paths(num)
                    time.sleep(2)
                    handle = open_dev(dev)
            written += len(chunk)
            pct = written * 100 // size
            print(f"\r{written / 1e6:.0f} / {size / 1e6:.0f} MB ({pct}%)", end="")
    handle.close()
    print(f"\nKlaar met schrijven: {written / 1e6:.0f} MB")


def verify(dev, img):
    print("Verifieren (teruglezen + SHA256)...")
    expected = sha256_file(img)
    size = os.path.getsize(img)
    h = hashlib.sha256()
    read = 0
    with open(dev, "rb", buffering=0) as handle:
        while read < size:
            chunk = handle.read(min(CHUNK, size - read))
            if not chunk:
                break
            h.update(chunk)
            read += len(chunk)
    actual = h.hexdigest()
    ok = read == size and actual == expected
    print(f"  verwacht {expected}")
    print(f"  gelezen  {actual}  ({read / 1e6:.0f} MB)")
    if not ok:
        sys.exit("VERIFICATIE MISLUKT: het image staat niet correct op de kaart.")
    print("Verificatie ok.")


def boot_letter(num):
    out = ps(
        f"Update-HostStorageCache; "
        f"$p = Get-Partition -DiskNumber {num} -ErrorAction SilentlyContinue | "
        f"Where-Object {{ $_.Size -gt 100MB -and $_.Size -lt 1GB }} | Select-Object -First 1; "
        f"if ($p -and -not $p.DriveLetter) {{ "
        f"Add-PartitionAccessPath -DiskNumber {num} -PartitionNumber $p.PartitionNumber -AssignDriveLetter }}; "
        f"(Get-Partition -DiskNumber {num} -PartitionNumber $p.PartitionNumber).DriveLetter"
    )
    for line in reversed(out.splitlines()):
        line = line.strip()
        if len(line) == 1 and line.isalpha():
            return line.upper()
    return ""


def install_firstrun(boot, firstrun):
    open(boot + "ssh", "w").close()
    with open(firstrun, "rb") as f:
        data = f.read().replace(bytes([13, 10]), bytes([10]))
    with open(boot + "firstrun.sh", "wb") as f:
        f.write(data)
    cmdline = boot + "cmdline.txt"
    with open(cmdline, "r") as f:
        cmd = f.read().strip()
    if "systemd.run=" not in cmd:
        cmd += (
            " systemd.run=/boot/firmware/firstrun.sh"
            " systemd.run_success_action=reboot"
            " systemd.unit=kernel-command-line.target"
        )
    with open(cmdline, "wb") as f:
        f.write(cmd.encode() + bytes([10]))
    print("firstrun.sh, ssh en cmdline.txt geplaatst.")


def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    num, image, user, password = sys.argv[1:5]
    firstrun = sys.argv[5] if len(sys.argv) > 5 else None

    d = ps_json(f"Get-Disk -Number {num} | Select Number,Size,IsBoot,IsSystem,BusType | ConvertTo-Json")
    if d["IsBoot"] or d["IsSystem"] or d["BusType"] == "NVMe" or d["Size"] > 64 * 1024**3:
        sys.exit(f"Weiger: schijf {num} ziet er niet uit als een SD-kaart: {d}")
    print(f"Schijf {num}: {d['Size'] / 1e9:.1f} GB, {d['BusType']}")

    img = decompress(image)

    try:
        print("Automatisch mounten uitzetten (voorkomt een kapotte schrijfhandle)...")
        print(" " + ps("mountvol /N"))

        print("Schijf wissen...")
        clear_disk(num)
        time.sleep(3)

        dev = DEV_PREFIX + str(num)
        print("Schrijven...")
        write_image(dev, img, num)
        verify(dev, img)
    finally:
        ps("mountvol /E")

    print("Bootpartitie klaarzetten...")
    ps("Update-Disk -ErrorAction SilentlyContinue | Out-Null")
    letter = boot_letter(num)
    if not letter:
        time.sleep(4)
        letter = boot_letter(num)
    if not letter:
        sys.exit("Bootpartitie niet gevonden; zet 'ssh' en firstrun.sh zelf op de boot-partitie.")
    boot = f"{letter}:{BS}"
    print(f"Bootpartitie: {letter}:")

    if firstrun:
        install_firstrun(boot, firstrun)
    else:
        open(boot + "ssh", "w").close()
        print("ssh-bestand geplaatst (geen firstrun.sh opgegeven).")

    ps(f"Write-VolumeCache -DriveLetter {letter} | Out-Null")
    print("KLAAR. Haal de SD-kaart veilig uit (Veilig verwijderen) en steek hem in de Pi.")


if __name__ == "__main__":
    main()

