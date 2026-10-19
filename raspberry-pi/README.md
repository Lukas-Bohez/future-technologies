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

### Direct aan de laptop (ethernet + ICS)

Hangt de Pi met een ethernetkabel aan de laptop, dan heeft de laptop-interface `192.168.137.1`.
ICS geeft in de praktijk **geen DHCP-lease** aan de Pi. Belangrijk: zet de verbinding dan op
`manual`. Met `ipv4.method auto` faalt de DHCP-transactie en zet NetworkManager eth0
**5 minuten uit** (`ip-config-unavailable`) — dat lijkt op een crash, maar is dit.

```bash
sudo nmcli con mod "Wired connection 1" ipv4.method manual ipv4.addresses 192.168.137.2/24 ipv4.gateway "" ipv4.dns "" connection.autoconnect-priority 10
sudo nmcli con up "Wired connection 1"
```

Voor andere netwerken (router op school/thuis) is er een tweede profiel met DHCP:

```bash
sudo nmcli con up "Wired DHCP"      # eenmalig kiezen; daarna autoconnect
sudo nmcli con up "Wired connection 1"   # terug naar de laptop
```

SSH-alias op de laptop (`~/.ssh/config`):

```
Host pi
    HostName 192.168.137.2
    User CareRoom
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 15
    ServerAliveCountMax 3
```

Noodroute als het IP opnieuw verandert: zoek de Pi met zijn MAC (`B8:27:EB:...`) in
`Get-NetNeighbor` of `arp -a`, of gebruik het IPv6 link-local adres:

```bash
ssh CareRoom@fe80::xxxx%15      # %15 = InterfaceIndex van de ethernetadapter
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

