// Simulatie: zonnestand en zonne-energie. Pure functies (geen Three.js), zodat je ze apart kan testen.
import { getPosition } from 'suncalc';

export const SITE = { lat: 51.2, lon: 2.9 }; // Belgische kust
// Elk paneeltje in de scène stelt een veld voor van areaPerModel m² (2,5 ha), anders is de schaal te klein om
// naast een windpark van 64 MW iets te betekenen. 12 paneeltjes = 30 ha = 60 MW piek.
export const PANEL = { efficiency: 0.2, areaPerModel: 25000 }; // rendement ±20%, zoals in de opdracht
export const SOLAR_CO2 = 41; // g CO2/kWh, zonnepanelen, levenscyclus (IPCC AR5 mediaan)
const GAS_CO2 = 490;

// Datum uit dagnummer (1-365) en uur (0-24). We rekenen met UTC+1 (zomertijd genegeerd).
export function toDate(dayOfYear, hour) {
  return new Date(Date.UTC(2026, 0, dayOfYear) + (hour - 1) * 3600 * 1000);
}

// Zonnestand in radialen: altitude (hoogte boven de horizon), bearing (kompasrichting, 0 = noord, kloksgewijs).
// SunCalc (v2) geeft beide hoeken in graden, azimut kloksgewijs vanaf noord; wij rekenen verder in radialen.
export function sunPosition(dayOfYear, hour) {
  const p = getPosition(toDate(dayOfYear, hour), SITE.lat, SITE.lon);
  const rad = Math.PI / 180;
  return { altitude: p.altitude * rad, bearing: p.azimuth * rad };
}

// Eenheidsvector naar de zon in scène-coördinaten: x = oost, y = omhoog, -z = noord.
export function sunDirection({ altitude, bearing }) {
  return {
    x: Math.sin(bearing) * Math.cos(altitude),
    y: Math.sin(altitude),
    z: -Math.cos(bearing) * Math.cos(altitude),
  };
}

// Directe straling bij heldere hemel (W/m²), Meinel-benadering: I = 1353 · 0,7^(AM^0,678), AM = 1/sin(hoogte).
export function clearSkyDNI(altitude) {
  if (altitude <= 0.01) return 0;
  const airMass = 1 / Math.sin(altitude);
  return 1353 * 0.7 ** airMass ** 0.678;
}

// Bewolking (0-100 %) vermindert de straling: Kasten-Czeplak, factor = 1 - 0,75 · (bewolking)^3,4.
export function cloudFactor(cloudPct) {
  return 1 - 0.75 * (cloudPct / 100) ** 3.4;
}

// Vermogen (kW) van panelCount modelpanelen met helling tiltRad (vanaf horizontaal) die gericht zijn
// volgens yawRad (0 = zuid, +π/2 = oost, -π/2 = west):
// P = aantal · oppervlak · rendement · straling · cos(hoek tussen zon en paneelnormaal)
export function panelPowerKW(sun, tiltRad, cloudPct, panelCount, yawRad = 0) {
  const d = sunDirection(sun);
  // Paneelnormaal: eerst kantelen naar het zuiden (+z), daarna draaien rond de verticale as.
  const n = {
    x: Math.sin(yawRad) * Math.sin(tiltRad),
    y: Math.cos(tiltRad),
    z: Math.cos(yawRad) * Math.sin(tiltRad),
  };
  const cosInc = Math.max(0, d.x * n.x + d.y * n.y + d.z * n.z);
  const irradiance = clearSkyDNI(sun.altitude) * cloudFactor(cloudPct); // W/m²
  return (panelCount * PANEL.areaPerModel * PANEL.efficiency * irradiance * cosInc) / 1000;
}

// Vermogen van het hele zonneveld in MW voor een oriëntatie: 'south' (alles naar het zuiden)
// of 'ew' (helft naar het oosten, helft naar het westen).
export function solarFieldMW(sun, tiltRad, cloudPct, panelCount, orientation = 'south') {
  if (orientation === 'ew') {
    const east = panelPowerKW(sun, tiltRad, cloudPct, Math.ceil(panelCount / 2), Math.PI / 2);
    const west = panelPowerKW(sun, tiltRad, cloudPct, Math.floor(panelCount / 2), -Math.PI / 2);
    return (east + west) / 1000;
  }
  return panelPowerKW(sun, tiltRad, cloudPct, panelCount, 0) / 1000;
}

// Oost-west-opstellingen liggen bijna vlak (lage helling); zuid mag steiler. We gebruiken voor oost-west maximaal 15°.
export const EW_MAX_TILT = (15 * Math.PI) / 180;
export function effectiveTilt(tiltRad, orientation) {
  return orientation === 'ew' ? Math.min(tiltRad, EW_MAX_TILT) : tiltRad;
}

export function solarCo2SavedTonnes(energyMWh) {
  return (energyMWh * 1000 * (GAS_CO2 - SOLAR_CO2)) / 1e6;
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export function dayLabel(dayOfYear) {
  const d = toDate(dayOfYear, 12);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
