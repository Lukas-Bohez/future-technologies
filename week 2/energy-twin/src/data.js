// Fase 2: echte data. Open-Meteo geeft gratis (zonder API-sleutel) actuele weerdata.
// Locatie: Noordzee voor de Belgische kust, waar echte windparken staan.
// Privacy: de browser stuurt alleen deze coördinaten naar api.open-meteo.com.
const LAT = 51.55;
const LON = 2.8;

const URL =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${LAT}&longitude=${LON}` +
  '&current=wind_speed_100m,wind_direction_100m,cloud_cover' + // 100 m = ongeveer de hoogte van de naaf
  '&wind_speed_unit=ms&timezone=auto';

// Geeft { speed (m/s), direction (graden, waar de wind VANDAAN komt, 0 = noord), cloud (% bewolking), time } of gooit een fout.
export async function fetchLiveWind() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Open-Meteo antwoordde ${res.status}`);
  const json = await res.json();
  return {
    speed: json.current.wind_speed_100m,
    direction: json.current.wind_direction_100m,
    cloud: json.current.cloud_cover,
    time: json.current.time,
  };
}
