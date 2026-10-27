// Eenvoudige grafieken op een 2D-canvas (geen bibliotheek).

// Lopende grafiek: laatste N waarden, bv. vermogen over tijd van het windpark.
export function createChart(canvas, maxValue, unit = 'MW', maxPoints = 120) {
  const ctx = canvas.getContext('2d');
  const points = [];

  return {
    push(value) {
      points.push(value);
      if (points.length > maxPoints) points.shift();
      draw();
    },
    clear() {
      points.length = 0;
      draw();
    },
  };

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);

    // Lijn per punt: x = positie in de reeks, y = waarde (0 onderaan, maxValue bovenaan)
    ctx.strokeStyle = '#7CFC9A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((v, i) => {
      const x = (i / (maxPoints - 1)) * w;
      const y = h - (v / maxValue) * (h - 6) - 3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#ccc';
    ctx.font = '10px system-ui';
    ctx.fillText(`${maxValue} ${unit}`, 4, 11);
    ctx.fillText('0', 4, h - 4);
  }
}

// Dagcurve met meerdere reeksen over de 24 uur van de gekozen datum, met een streepje voor het huidige uur.
// series = [{ values: [...97 waarden], color: '#ffd640', fill: true }]
export function createDayChart(canvas, maxValue, unit = 'MW') {
  const ctx = canvas.getContext('2d');

  function line(values, w, h, max) {
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - (Math.min(v, max) / max) * (h - 6) - 3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }

  return {
    draw(series, hourFraction, max = maxValue) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, w, h);

      for (const s of series) {
        if (s.fill) {
          ctx.fillStyle = s.fillColor || 'rgba(255, 214, 64, 0.3)';
          ctx.beginPath();
          ctx.moveTo(0, h - 3);
          line(s.values, w, h, max);
          ctx.lineTo(w, h - 3);
          ctx.fill();
        }
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width || 2;
        ctx.setLineDash(s.dash || []);
        ctx.beginPath();
        line(s.values, w, h, max);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      if (hourFraction !== null && hourFraction !== undefined) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hourFraction * w, 0);
        ctx.lineTo(hourFraction * w, h);
        ctx.stroke();
      }

      ctx.fillStyle = '#ccc';
      ctx.font = '10px system-ui';
      ctx.fillText(`${Math.round(max)} ${unit}`, 4, 11);
      ctx.fillText('0u', 4, h - 4);
      ctx.fillText('12u', w / 2 - 8, h - 4);
      ctx.fillText('24u', w - 24, h - 4);
    },
  };
}
