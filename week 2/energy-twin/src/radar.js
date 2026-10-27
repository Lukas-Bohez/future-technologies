import { Vector3 } from 'three';

const tmpVec = new Vector3();

// Radar: bovenaanzicht rond de speler, met de kijkrichting naar boven. Handig omdat het spel 360° is.
// Wereld: x = oost, -z = noord. De speler staat in het midden (0,0).
export function createRadar(canvas, range = 50) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const c = size / 2;
  const scale = (c - 6) / range; // pixels per eenheid

  // Wereldpunt -> radarpunt voor een speler die yaw radialen gedraaid is (yaw 0 = kijkt naar het noorden).
  function toRadar(x, z, yaw) {
    const forward = -x * Math.sin(yaw) - z * Math.cos(yaw);
    const right = x * Math.cos(yaw) - z * Math.sin(yaw);
    return [c + right * scale, c - forward * scale];
  }

  function dot(x, z, yaw, r, color) {
    const [sx, sy] = toRadar(x, z, yaw);
    if (Math.hypot(sx - c, sy - c) > c - 3) return; // buiten de radar
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    // data: { yaw, world, game, windFromDeg, sun: { altitude, bearing } }
    draw({ yaw, world, game, windFromDeg, sun }) {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, c - 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(5, 20, 40, 0.65)';
      ctx.fill();
      ctx.clip();

      // Afstandsringen
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      for (const r of [15, 30, 45]) {
        ctx.beginPath();
        ctx.arc(c, c, r * scale, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Eilanden en installaties
      for (const isl of world.solarIslands) dot(isl.position.x, isl.position.z, yaw, 9, '#d8c27a');
      dot(world.village.position.x, world.village.position.z, yaw, 9, '#7fae5a');
      dot(world.battery.position.x, world.battery.position.z, yaw, 4, '#9ab');
      for (const t of world.turbines) dot(t.position.x, t.position.z, yaw, 3, '#fff');

      // Boten (bruin) en wie er nu opduikt: boef = rood, visser = geel
      for (const b of game.boats) {
        dot(b.position.x, b.position.z, yaw, 5, '#8b5a2b');
      }
      for (const slot of game.slots) {
        if (slot.state !== 'up') continue;
        slot.occupant.getWorldPosition(tmpVec);
        dot(tmpVec.x, tmpVec.z, yaw, 3.5, slot.occupant.userData.kind === 'villain' ? '#ff3b3b' : '#ffd200');
      }

      // Zon (alleen als hij boven de horizon staat), aan de rand in zijn kompasrichting
      if (sun && sun.altitude > 0) {
        const [sx, sy] = toRadar(Math.sin(sun.bearing) * range, -Math.cos(sun.bearing) * range, yaw);
        const ang = Math.atan2(sy - c, sx - c);
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(c + Math.cos(ang) * (c - 9), c + Math.sin(ang) * (c - 9), 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Windpijl in het midden: wijst waarheen de wind waait
      const blowX = -Math.sin((windFromDeg * Math.PI) / 180);
      const blowZ = Math.cos((windFromDeg * Math.PI) / 180);
      const [wx, wy] = toRadar(blowX * 12, blowZ * 12, yaw);
      ctx.strokeStyle = '#66ccff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(wx, wy);
      ctx.stroke();
      const a = Math.atan2(wy - c, wx - c);
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx - Math.cos(a - 0.5) * 5, wy - Math.sin(a - 0.5) * 5);
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx - Math.cos(a + 0.5) * 5, wy - Math.sin(a + 0.5) * 5);
      ctx.stroke();
      ctx.lineWidth = 1;

      // Speler (driehoek, kijkt omhoog) en noordteken
      ctx.fillStyle = '#7CFC9A';
      ctx.beginPath();
      ctx.moveTo(c, c - 6);
      ctx.lineTo(c - 4, c + 4);
      ctx.lineTo(c + 4, c + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const [nx, ny] = toRadar(0, -range, yaw);
      const na = Math.atan2(ny - c, nx - c);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', c + Math.cos(na) * (c - 11), c + Math.sin(na) * (c - 11));
    },
  };
}
