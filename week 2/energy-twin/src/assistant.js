// Uitbreiding: een assistent die vragen beantwoordt op basis van de ACTUELE waarden in de scène.
// Twee modi:
//   1. Lokaal (standaard): regels die de vraag herkennen en de actuele waarden invullen. Geen cloud, geen sleutel.
//   2. Claude (optioneel): jij geeft zelf een API-sleutel; de vraag en de actuele waarden (JSON) gaan dan naar api.anthropic.com.
//      De sleutel blijft alleen in het geheugen van deze pagina en wordt nooit opgeslagen.
//
// Beide krijgen een 'snapshot': een object met de huidige waarden (zie snapshot() in main.js).

const f1 = (x) => Number(x).toFixed(1);
const f0 = (x) => Number(x).toFixed(0);

function windWhy(s) {
  const v = s.wind.speed;
  if (v < 3) return `De wind is maar ${f1(v)} m/s, onder de inschakelsnelheid van 3 m/s: de turbines staan stil.`;
  if (v >= 25) return `Met ${f1(v)} m/s staat het windpark stil om veiligheidsredenen (uitschakelsnelheid 25 m/s).`;
  if (s.windMW < 0.5 * s.windRatedMW) {
    const parts = [`de wind is ${f1(v)} m/s en het vermogen groeit met de derde macht van de snelheid, dus bij matige wind is het park ver van zijn maximum (${f1(s.windRatedMW)} MW)`];
    if (s.yawErrorDeg > 15) parts.push(`de turbines staan nog ${f0(s.yawErrorDeg)}° scheef t.o.v. de wind`);
    return `Het windpark levert ${f1(s.windMW)} MW omdat ${parts.join(' en ')}.`;
  }
  return `Het windpark levert ${f1(s.windMW)} MW bij ${f1(v)} m/s: dat is een goede opbrengst.`;
}

function solarWhy(s) {
  const z = s.solar;
  if (z.altitudeDeg <= 0) return `Het is nacht (zon ${f0(z.altitudeDeg)}° onder de horizon), dus de zonnepanelen leveren niets.`;
  const reasons = [];
  if (z.altitudeDeg < 20) reasons.push(`de zon staat laag (${f0(z.altitudeDeg)}°), zeker in ${s.date}`);
  if (z.cloudPct > 40) reasons.push(`er is ${f0(z.cloudPct)}% bewolking`);
  if (z.orientation === 'ew' && z.altitudeDeg > 35) reasons.push('de panelen staan oost-west en vangen rond de middag minder dan zuidgericht');
  if (z.tiltDeg < 15 && z.altitudeDeg < 40) reasons.push(`de panelen liggen bijna vlak (${f0(z.tiltDeg)}°)`);
  return reasons.length
    ? `De zonnepanelen leveren ${f1(z.MW)} MW omdat ${reasons.join(' en ')}.`
    : `De zonnepanelen leveren ${f1(z.MW)} MW, dat is dicht bij wat mogelijk is voor dit uur en deze datum.`;
}

function advice(s) {
  const tips = [];
  if (!s.grid.batteryOn && s.grid.exportMW > 5) tips.push(`zet de batterij aan: nu gaat ${f1(s.grid.exportMW)} MW naar het net, die je kan opslaan`);
  if (s.grid.importMW > 5) tips.push(`er wordt ${f1(s.grid.importMW)} MW geïmporteerd: meer opslag of productie op dit uur helpt`);
  if (s.solar.orientation === 'south' && s.solar.tiltDeg < 25) tips.push('kantel de panelen steiler (ongeveer 30-40°) voor meer opbrengst op onze breedtegraad');
  if (s.wind.speed < 3 && s.grid.batteryOn) tips.push('de wind valt weg: de batterij vangt het op zolang hij geladen is');
  return tips.length ? `Tips: ${tips.join('; ')}.` : 'Het systeem draait in balans, ik zie geen directe verbeterpunten.';
}

// Antwoord op basis van regels; altijd met de echte actuele waarden.
export function localAnswer(question, s) {
  const q = question.toLowerCase();
  const has = (re) => re.test(q);

  if (has(/waarom|hoe komt het/) && has(/opbrengst|laag|weinig|productie|energie|stroom|vermogen/) && !has(/wind|turbine|windmolen|windpark|zon|paneel|panelen/)) {
    return `${windWhy(s)} ${solarWhy(s)}`;
  }
  if (has(/waarom|hoe komt het/) && has(/wind|turbine|windmolen|windpark/)) return windWhy(s);
  if (has(/waarom|hoe komt het/) && has(/zon|paneel|panelen/)) return solarWhy(s);
  if (has(/tip|advies|verbeter|wat moet ik|wat kan ik/)) return advice(s);
  if (has(/hulp|help|wat kan je/)) return 'Vraag bv.: "hoeveel produceren we?", "waarom is de opbrengst laag?", "wat is de batterijlading?", "hoeveel geld besparen we?", "welk scenario is beter?" of "geef me een tip".';
  if (has(/scenario|vergelijk|oost.?west|beter/)) {
    const sc = s.scenario;
    if (!sc) return 'Open eerst het paneel "Scenario\'s" en klik op Vergelijk, dan kan ik de resultaten toelichten.';
    return (
      `Zonne-opstelling op ${s.date}: zuid levert ${f0(sc.south.solarMWh)} MWh (piek ${f1(sc.south.peakSolarMW)} MW), oost-west ${f0(sc.ew.solarMWh)} MWh (piek ${f1(sc.ew.peakSolarMW)} MW). ` +
      `Batterij: zonder import je ${f0(sc.noBattery.importMWh)} MWh per dag, met ${f0(sc.battery.importMWh)} MWh.`
    );
  }
  if (has(/batterij|accu|opslag|lading|opgeslagen/)) {
    const g = s.grid;
    return `De batterij is ${g.batteryOn ? 'aan' : 'uit'} en staat op ${f0(g.socPct)}% (${f1(g.socMWh)} MWh). ${g.chargeMW > 0.1 ? `Hij laadt nu met ${f1(g.chargeMW)} MW.` : g.dischargeMW > 0.1 ? `Hij ontlaadt nu met ${f1(g.dischargeMW)} MW.` : 'Hij doet nu niets.'}`;
  }
  if (has(/geld|euro|€|kost|bespaar|besparing|prijs|opbrengst in/)) {
    const t = s.totals;
    return `Bij ${f0(s.priceEurPerMWh)} €/MWh: zelf gebruikte stroom bespaart €${f0(t.savedEur)}, export levert €${f0(t.exportEur)} op en import kost €${f0(t.importEur)}. Netto ${t.savedEur + t.exportEur - t.importEur >= 0 ? '+' : '−'}€${f0(Math.abs(t.savedEur + t.exportEur - t.importEur))}.`;
  }
  if (has(/co2|co₂|uitstoot|klimaat/)) return `Tot nu toe sparen we ${f1(s.totals.co2Tonnes)} ton CO₂ uit tegenover aardgas (wind ${f0(s.totals.windMWh)} MWh, zon ${f0(s.totals.solarMWh)} MWh).`;
  if (has(/verbruik|vraag|net|balans|import|export|tekort|overschot|dekken/)) {
    const g = s.grid;
    const prod = s.windMW + s.solar.MW;
    return `Verbruik ${f1(g.demandMW)} MW, productie ${f1(prod)} MW (wind ${f1(s.windMW)} + zon ${f1(s.solar.MW)}). ${g.importMW > 0.1 ? `Er wordt ${f1(g.importMW)} MW geïmporteerd.` : g.exportMW > 0.1 ? `${f1(g.exportMW)} MW wordt geëxporteerd.` : 'Vraag en aanbod zijn in balans.'}`;
  }
  if (has(/zon|paneel|panelen|solar|straling/)) {
    const z = s.solar;
    return `De zonnepanelen produceren ${f1(z.MW)} MW. De zon staat ${f0(z.altitudeDeg)}° hoog, helling ${f0(z.tiltDeg)}°, oriëntatie ${z.orientation === 'ew' ? 'oost-west' : 'zuid'}, bewolking ${f0(z.cloudPct)}%.`;
  }
  if (has(/wind|windmolen|turbine|windpark|richting/)) {
    return `Het windpark produceert ${f1(s.windMW)} MW. De wind komt uit ${s.wind.dirName} (${f0(s.wind.dirDeg)}°) met ${f1(s.wind.speed)} m/s${s.wind.live ? ' (live gemeten)' : s.wind.source === 'sensor' ? ' (van de sensor)' : ' (handmatig)'}.`;
  }
  if (has(/hoe laat|tijd|datum|welke dag/)) return `Het is ${s.time} op ${s.date} in de simulatie.`;
  if (has(/hoeveel|produce|energie|stroom|vermogen/)) {
    return `Nu: wind ${f1(s.windMW)} MW + zon ${f1(s.solar.MW)} MW = ${f1(s.windMW + s.solar.MW)} MW, bij een verbruik van ${f1(s.grid.demandMW)} MW. Tot nu toe: ${f0(s.totals.windMWh + s.totals.solarMWh)} MWh opgewekt.`;
  }
  return `Dat snap ik niet helemaal. Nu produceren we ${f1(s.windMW + s.solar.MW)} MW bij ${f1(s.grid.demandMW)} MW verbruik. Typ "help" voor voorbeeldvragen.`;
}

// Optioneel: laat een Claude-model antwoorden. Alleen de vraag en de snapshot gaan naar de API.
export async function askClaude(question, snapshot, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true', // nodig om de API rechtstreeks vanuit een browser aan te roepen
    },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 400,
      system:
        'Je bent de assistent van een digital twin van een offshore windpark met zonne-eilanden, een dorp en een batterij. ' +
        'Antwoord in het Nederlands, in maximaal 4 korte zinnen, en uitsluitend op basis van de actuele waarden in de JSON hieronder. ' +
        'Eenheden: MW, MWh, m/s, graden, €. Staat iets niet in de data, zeg dat dan.\n\nActuele waarden:\n' +
        JSON.stringify(snapshot),
      messages: [{ role: 'user', content: question }],
    }),
  });
  if (!res.ok) throw new Error(`API antwoordde ${res.status}`);
  const json = await res.json();
  return json.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

// Kiest zelf: Claude als er een sleutel is (met terugval op lokaal bij een fout), anders lokaal.
export async function answer(question, snapshot, apiKey) {
  if (apiKey) {
    try {
      return { text: await askClaude(question, snapshot, apiKey), source: 'Claude' };
    } catch (err) {
      return { text: `${localAnswer(question, snapshot)} (Claude was niet bereikbaar: ${err.message}; lokaal antwoord)`, source: 'lokaal' };
    }
  }
  return { text: localAnswer(question, snapshot), source: 'lokaal' };
}
