// Fase 3A: spraakbesturing met de Web Speech API.
// Privacy: in Chrome/Edge wordt je audio naar de spraakdienst van de browser (cloud) gestuurd voor
// herkenning. Er wordt niets door ons opgeslagen. De antwoorden spreken we uit met speechSynthesis (lokaal).

const NUMBER_WORDS = {
  nul: 0, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
  elf: 11, twaalf: 12, dertien: 13, veertien: 14, vijftien: 15, zestien: 16, zeventien: 17,
  achttien: 18, negentien: 19, twintig: 20, vijfentwintig: 25, dertig: 30,
};

// Haal een getal uit de zin: "zet de wind op 12" of "zet de wind op twaalf".
export function extractNumber(text) {
  const digits = text.match(/\d+/);
  if (digits) return Number(digits[0]);
  for (const word of text.split(/\s+/)) {
    if (word in NUMBER_WORDS) return NUMBER_WORDS[word];
  }
  return null;
}

// Zet een zin om naar een commando-object. Eenvoudig: zoek sleutelwoorden.
// Geeft { name, value? } of null als we het niet begrijpen (dan krijgt de assistent de vraag).
export function parseCommand(raw) {
  const text = raw.toLowerCase().trim();
  const n = extractNumber(text);

  // Vragen over de waarden
  if (/hoeveel.*(geld|euro|kost|bespaar.*(geld|euro))/.test(text)) return { name: 'ask-money' };
  if (/hoeveel.*zon|zon.*(produc|opbrengst|kwh)/.test(text)) return { name: 'ask-solar' };
  if (/hoeveel.*(energie|stroom|produc)/.test(text)) return { name: 'ask-power' };
  if (/(co2|co 2|co₂|bespaar)/.test(text)) return { name: 'ask-co2' };

  // Batterij en scenario's
  if (/batterij.*(aan|in|activeer)|(zet|schakel).*batterij.*(aan|in)/.test(text)) return { name: 'battery', value: true };
  if (/batterij.*(uit|af)/.test(text)) return { name: 'battery', value: false };
  if (/oost.?west/.test(text) && /(panel|paneel|zon|opstelling)/.test(text)) return { name: 'orientation', value: 'ew' };
  if (/(panel|paneel|zuidgericht|naar het zuiden)/.test(text) && /zuid/.test(text)) return { name: 'orientation', value: 'south' };
  if (/(vergelijk|scenario)/.test(text)) return { name: 'compare' };

  // Spel en tijd
  if (/(live|echte|actuele)/.test(text)) return { name: 'live' };
  if (/(opnieuw|reset|herstart|start het spel|begin)/.test(text)) return { name: 'reset' };
  if (/(pauze|pauzeer|stop de tijd)/.test(text)) return { name: 'sim-pause' };
  if (/(speel af|start de tijd|versneld)/.test(text)) return { name: 'sim-play' };

  // Seizoen: "zet de zon op de zomer"
  const seasons = { lente: 80, zomer: 172, herfst: 266, winter: 355 };
  for (const [word, doy] of Object.entries(seasons)) if (text.includes(word)) return { name: 'sun-doy', value: doy };

  // Windrichting: "wind uit het zuidwesten" of "windrichting op 90 graden"
  if (/(wind|richting)/.test(text) && /(noord|oost|zuid|west)/.test(text)) {
    const east = (/oost/.test(text) ? 1 : 0) - (/west/.test(text) ? 1 : 0);
    const north = (/noord/.test(text) ? 1 : 0) - (/zuid/.test(text) ? 1 : 0);
    const deg = (Math.round((Math.atan2(east, north) * 180) / Math.PI) + 360) % 360;
    return { name: 'wind-dir', value: deg };
  }
  if (/richting/.test(text) && n !== null) return { name: 'wind-dir', value: n % 360 };

  // Tijd: "zet de zon op 15 uur"
  if (/(zon|tijd)/.test(text) && n !== null) return { name: 'sun-hour', value: Math.min(24, n) };

  // Windsnelheid
  if (/(meer|harder|sterker).*wind|wind.*(meer|harder|sterker)/.test(text)) return { name: 'wind-delta', value: 3 };
  if (/(minder|zachter|rustiger).*wind|wind.*(minder|zachter|rustiger)/.test(text)) return { name: 'wind-delta', value: -3 };
  if (/wind/.test(text) && n !== null) return { name: 'wind-set', value: n };
  return null;
}

// Start de herkenning. onResult(transcript) wordt aangeroepen met de verstane zin.
// Geeft een start-functie terug, of null als de browser het niet ondersteunt (bv. Firefox).
export function createRecognizer(onResult, onStatus) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'nl-BE';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onstart = () => onStatus('Luisteren…');
  rec.onend = () => onStatus('');
  rec.onerror = (e) => onStatus(`Spraakfout: ${e.error}`);
  rec.onresult = (e) => onResult(e.results[0][0].transcript);
  return () => rec.start();
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'nl-BE';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
