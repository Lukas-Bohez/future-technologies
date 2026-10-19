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

from sdwrite import RawDisk

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


def table_empty(head):
    return len(head) >= 512 and not any(head[446:510])


def clear_disk(num, dev):
    """Wist de partitietabel met diskpart en controleert de partitietabel zelf."""
    remove_access_paths(num)
    script = os.path.join(tempfile.gettempdir(), "sd_clean.txt")
    with open(script, "w") as f:
        f.write(f"select disk {num}\nattributes disk clear readonly\nclean\nexit\n")
    r = subprocess.run(["diskpart", "/s", script], capture_output=True, text=True)
    print((r.stdout + r.stderr).strip()[-500:])
    ps(f"Update-Disk -Number {num} | Out-Null")
    time.sleep(2)
    disk = ps_json(f"Get-Disk -Number {num} | Select IsReadOnly | ConvertTo-Json")
    if disk.get("IsReadOnly"):
        sys.exit("De kaart staat op alleen-lezen. Kaart of kaartlezer is waarschijnlijk defect.")

    probe = SharedDisk(dev, writable=False)
    head = probe.read_at(0, 512)
    probe.close()
    if not table_empty(head):
        print("Partitietabel staat er nog; sector 0 zelf wissen...")
        try:
            d = open_disk(dev)
            d.write_at(0, bytes(512))
            d.flush()
            d.close()
        except OSError as e:
            sys.exit(f"Kan sector 0 niet schrijven ({e}). De kaart staat waarschijnlijk op "
                     "alleen-lezen: haal de kaart eruit, steek ze opnieuw in en probeer opnieuw.")
        probe = SharedDisk(dev, writable=False)
        head = probe.read_at(0, 512)
        probe.close()
    if not table_empty(head):
        sys.exit("De kaart weigert schrijven (partitietabel blijft staan). Haal de kaart eruit "
                 "en steek ze opnieuw in; lukt het nog niet, gebruik een andere SD-kaart.")
    print("Partitietabel gewist.")


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


class SharedDisk:
    """Terugvaloptie als een exclusieve handle niet lukt."""

    def __init__(self, path, writable=True):
        self.f = open(path, "r+b" if writable else "rb", buffering=0)

    def write_at(self, offset, data):
        self.f.seek(offset)
        self.f.write(data)

    def read_at(self, offset, size):
        self.f.seek(offset)
        return self.f.read(size)

    def flush(self):
        self.f.flush()

    def close(self):
        self.f.close()


def open_disk(dev, writable=True):
    try:
        disk = RawDisk(dev, writable=writable)
        print("exclusieve handle")
        return disk
    except OSError as e:
        print(f"exclusief openen lukte niet ({e}); gedeelde handle proberen")
        return SharedDisk(dev, writable=writable)


GUARD = 8 * 1024 * 1024  # de partitietabel staat in sector 0; p1 begint op 8 MiB


def segments_for(size):
    """Schrijfvolgorde: eerst alles, de MBR (sector 0) als laatste.

    Zolang sector 0 leeg is, ziet Windows geen partities, mount het niets en
    blijven raw writes toegestaan. Zo voorkom je 'Access denied' halverwege.
    """
    if size > GUARD:
        return [(GUARD, size - GUARD), (512, GUARD - 512), (0, 512)]
    return [(512, size - 512), (0, 512)]


def write_chunk(disk, dev, num, offset, data, state):
    while True:
        try:
            disk.write_at(offset, data)
            return disk
        except OSError as e:
            state["failures"] += 1
            print(f"\nschrijffout bij {offset / 1e6:.0f} MB ({e}); herstel {state['failures']}")
            if state["failures"] > 25:
                sys.exit("Te veel schrijffouten: SD-kaart of kaartlezer is waarschijnlijk defect.")
            try:
                disk.close()
            except OSError:
                pass
            ps("mountvol /N")
            remove_access_paths(num)
            time.sleep(2)
            disk = open_disk(dev)


def compare_range(disk, img, offset, length):
    with open(img, "rb") as src:
        src.seek(offset)
        pos = 0
        while pos < length:
            want = min(CHUNK, length - pos)
            if disk.read_at(offset + pos, want) != src.read(want):
                return False
            pos += want
    return True


def write_image(dev, img, num):
    size = os.path.getsize(img)
    segments = segments_for(size)
    state = {"failures": 0}
    disk = open_disk(dev)
    disk = write_chunk(disk, dev, num, 0, bytes(512), state)  # oude partitietabel weg

    done = 0
    for offset, length in segments[:-1]:
        pos = 0
        with open(img, "rb") as src:
            src.seek(offset)
            while pos < length:
                chunk = src.read(min(CHUNK, length - pos))
                if not chunk:
                    break
                disk = write_chunk(disk, dev, num, offset + pos, chunk, state)
                pos += len(chunk)
                done += len(chunk)
                print(f"\r{done / 1e6:.0f} / {size / 1e6:.0f} MB", end="")
    disk.flush()
    print("\nVerifieren voor de partitietabel...")
    for offset, length in segments[:-1]:
        if not compare_range(disk, img, offset, length):
            sys.exit("VERIFICATIE MISLUKT: het image staat niet correct op de kaart.")
    print("  ok")

    mbr_offset, mbr_len = segments[-1]
    with open(img, "rb") as src:
        src.seek(mbr_offset)
        mbr = src.read(mbr_len)
    disk = write_chunk(disk, dev, num, mbr_offset, mbr, state)
    disk.flush()
    disk.close()
    print(f"Klaar met schrijven: {done / 1e6:.0f} MB")


def verify(dev, img):
    print("Verifieren van de partitietabel...")
    with open(img, "rb") as src:
        expected = src.read(512)
    disk = SharedDisk(dev, writable=False)
    actual = disk.read_at(0, 512)
    disk.close()
    if actual != expected:
        sys.exit("VERIFICATIE MISLUKT: de partitietabel op de kaart wijkt af.")
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

        dev = DEV_PREFIX + str(num)
        print("Schijf wissen...")
        clear_disk(num, dev)
        time.sleep(3)

        print("Schrijven...")
        write_image(dev, img, num)
        verify(dev, img)
    finally:
        ps("mountvol /E")

    print("Bootpartitie klaarzetten...")
    ps(f"Update-Disk -Number {num} -ErrorAction SilentlyContinue | Out-Null")
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

