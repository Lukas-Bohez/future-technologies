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
2. wist de partitietabel met `diskpart clean` en controleert de partitietabel echt;
3. schrijft raw met een **exclusieve** handle (`sdwrite.RawDisk`, share mode 0) in blokken
   van 4 MB, met herstel per blok;
4. schrijft de MBR (sector 0) **als allerlaatste**. Zolang er geen partitietabel staat,
   mount Windows niets en blijven raw writes toegestaan. Zonder dit gaf Windows
   `Access denied` of `Bad file descriptor` zodra het de FAT-bootpartitie herkende;
5. leest alle geschreven blokken terug en vergelijkt ze met het image (verplicht);
6. geeft de bootpartitie een letter en plaatst `ssh`, `firstrun.sh` en de `systemd.run=`-regel
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

- **`Access denied` / `Bad file descriptor` tijdens schrijven**: Windows mount de nieuwe
  FAT-bootpartitie en blokkeert dan raw writes. Opgelost door de MBR als laatste te schrijven
  en een exclusieve handle te gebruiken (zie boven).
- **Kaart springt op alleen-lezen**: een SD-controller doet dat na schrijffouten. Kaart eruit
  en erin (power cycle) helpt tijdelijk. Komt het terug, gebruik een nieuwe kaart.
- **`raspberrypi.local` werkt niet**: de Pi zit op een ander netwerk of mDNS is geblokkeerd.
  Zoek het IP in de router of via de ARP-tabel.
- **Pi 3 zonder wifi-verbinding**: het image gebruikt NetworkManager; controleer
  `nmcli device` en `/etc/NetworkManager/system-connections/`.

