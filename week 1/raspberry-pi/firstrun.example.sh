#!/bin/bash
# Template voor de eerste start van een Raspberry Pi OS Lite image.
# Kopieer naar de bootpartitie als firstrun.sh (LF-regeleinden!) en zet in cmdline.txt:
#   systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target
# Het echte bestand hoort NIET in deze repo: het bevat wachtwoorden.
exec >> /boot/firmware/firstrun.log 2>&1
set -x
date

if [ -f /boot/firmware/firstrun.done ]; then
  sed -i 's| systemd\.run[^ ]*||g; s| systemd\.unit=kernel-command-line\.target||' /boot/firmware/cmdline.txt
  rm -f /boot/firmware/firstrun.sh
  exit 0
fi

U="__USER__"
P="__PASSWORD__"
KEY="__SSH_PUBKEY__"
WIFI_SSID="__SSID__"
WIFI_PSK="__WIFI_PASSWORD__"

add_user() {
  groups=""
  for g in sudo adm dialout audio video plugdev input netdev gpio spi i2c render users; do
    getent group "$g" >/dev/null 2>&1 && groups="${groups:+$groups,}$g"
  done
  if [ -n "$groups" ]; then
    useradd -m -s /bin/bash -G "$groups" "$1"
  else
    useradd -m -s /bin/bash "$1"
  fi
}

if ! id "$U" >/dev/null 2>&1; then
  add_user "$U" || { U=careroom; add_user "$U"; }
fi
echo "$U:$P" | chpasswd
usermod -aG sudo "$U" 2>/dev/null
echo "$U ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/010_$U"
chmod 440 "/etc/sudoers.d/010_$U"
chown -R "$U":"$U" "/home/$U"

mkdir -p "/home/$U/.ssh"
echo "$KEY" > "/home/$U/.ssh/authorized_keys"
chmod 700 "/home/$U/.ssh"
chmod 600 "/home/$U/.ssh/authorized_keys"
chown -R "$U":"$U" "/home/$U/.ssh"
systemctl enable ssh
systemctl start ssh || true

raspi-config nonint do_wifi_country BE 2>/dev/null || true
rfkill unblock wifi 2>/dev/null || true
mkdir -p /etc/NetworkManager/system-connections
f="/etc/NetworkManager/system-connections/$WIFI_SSID.nmconnection"
cat > "$f" <<NM
[connection]
id=$WIFI_SSID
uuid=$(cat /proc/sys/kernel/random/uuid)
type=wifi
interface-name=wlan0
autoconnect=true
autoconnect-priority=20

[wifi]
mode=infrastructure
ssid=$WIFI_SSID

[wifi-security]
key-mgmt=wpa-psk
psk=$WIFI_PSK

[ipv4]
method=auto

[ipv6]
method=auto
NM
chmod 600 "$f"
chown root:root "$f"
systemctl enable NetworkManager 2>/dev/null || true

hostnamectl set-hostname raspberrypi 2>/dev/null || echo raspberrypi > /etc/hostname
touch /boot/firmware/firstrun.done
sed -i 's| systemd\.run[^ ]*||g; s| systemd\.unit=kernel-command-line\.target||' /boot/firmware/cmdline.txt
rm -f /boot/firmware/firstrun.sh
sync
