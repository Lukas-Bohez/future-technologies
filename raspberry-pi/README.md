# Raspberry Pi

Doel: Raspberry Pi 3 Model B v1.2 (2015) als werkbak, met VS Code Remote-SSH.

## Waarom 64-bit

VS Code Server ondersteunt `linux-armhf` (32-bit) niet meer. De Pi 3 is 64-bit, dus gebruik
Raspberry Pi OS Lite **arm64** (`raspios_lite_arm64`). Met het 32-bit image krijg je
`Error installing server: platform not currently supported: LinuxARM32`.

## SD-kaart flashen (Windows, administrator)

```powershell
# in een elevated PowerShell
python raspberry-pi\flash_sd.py 1 <image.img of image.img.xz> <gebruiker> <wachtwoord> [firstrun.sh]
```

Het script:

1. pakt de `.xz` uit naar `.img` (herbruikt een bestaand `.img`);
2. zet tijdelijk `mountvol /N`, zodat Windows de nieuwe FAT-bootpartitie niet mount
   tijdens het schrijven. Zonder dat werd de raw handle ongeldig en stopte het schrijven
   met `Bad file descriptor` (os error 9);
3. schrijft raw naar `\\.\PhysicalDriveN` in chunks van 4 MB, met herstel per chunk;
4. leest de kaart terug en vergelijkt SHA256 met het image (verplicht, anders stopt het);
5. geeft de bootpartitie een letter en plaatst `ssh`, `firstrun.sh` en de `systemd.run=`-regel
   in `cmdline.txt`.

Veiligheid: het script weigert de systeemschijf, NVMe-schijven en schijven boven 64 GB.

## Eerste start

`firstrun.sh` draait eenmalig via `systemd.run=` in `cmdline.txt` en doet:

- gebruiker aanmaken (sudo, plus alle groepen die bestaan), wachtwoord zetten;
- SSH aanzetten en de publieke sleutel in `authorized_keys` zetten;
- wifi-profielen als NetworkManager-keyfiles schrijven (nmcli werkt op dat moment nog niet);
- hostname `raspberrypi`, daarna `cmdline.txt` opschonen en `firstrun.sh` verwijderen.

Log staat op de bootpartitie: `firstrun.log`. Een marker `firstrun.done` voorkomt een
oneindige herstart als het opschonen van `cmdline.txt` ooit misgaat.

Gebruik als template: `firstrun.example.sh` (vul eigen sleutel en wifi in). Zet nooit
echte wachtwoorden in deze publieke repo.

## Verbinden

```bash
ssh CareRoom@raspberrypi.local        # mDNS, of het IP uit de router
```

VS Code: Remote-SSH, host `pi` (zie `~/.ssh/config`). Zet in de VS Code-instellingen
`remote.SSH.remotePlatform` op `linux` voor die host, anders blijft hij naar het platform vragen.

## Problemen

- **`Bad file descriptor` tijdens schrijven**: opgelost door `mountvol /N` (zie boven).
  Blijft het terugkomen, dan is de kaart of de kaartlezer waarschijnlijk defect.
- **Kaart plots alleen-lezen**: klassiek teken van een versleten SD-kaart. Nieuwe kaart gebruiken.
- **`raspberrypi.local` werkt niet**: de Pi zit op een ander netwerk of mDNS is geblokkeerd.
  Zoek het IP in de router of via de ARP-tabel.
- **Pi 3 zonder wifi-verbinding**: het image gebruikt NetworkManager; controleer
  `nmcli device` en `/etc/NetworkManager/system-connections/`.

