// Uitbreidingen: net met meerdere bronnen (wind + zon + batterij), geld en scenario-vergelijking.
// Pure functies, geen Three.js. Eenheden: MW, MWh, uur, euro.
import { sunPosition, solarFieldMW, effectiveTilt } from './solar.js';

export const GRID = {
  demandBaseMW: 35, // verbruik van een regio (±30 000 woningen) rond de avondpiek
  batteryMWh: 80, // capaciteit
  batteryMW: 25, // maximaal laad- en ontlaadvermogen
  batteryEff: 0.9, // rendement heen en terug (per richting de wortel ervan)
};
export const MONEY = {
  priceDefault: 90, // €/MWh stroomprijs
  exportFactor: 0.5, // teruggeleverde stroom levert maar de helft op
  co2Price: 70, // €/ton CO2
};

// Verbruiksprofiel over de dag: lage basis 's nachts, ochtendpiek rond 8u en avondpiek rond 19u.
export function demandMW(hour) {
  const bump = (h, mu, s) => Math.exp(-(((h - mu) / s) ** 2));
  return GRID.demandBaseMW * (0.62 + 0.28 * bump(hour, 8, 2) + 0.38 * bump(hour, 19, 2.5));
}

export function createGridState() {
  return { soc: GRID.batteryMWh * 0.3, windMWh: 0, solarMWh: 0, demandMWh: 0, importMWh: 0, exportMWh: 0 };
}

// Eén tijdstap van dtH uur. Productie wordt eerst aan het verbruik gekoppeld:
//   overschot -> batterij laden (als aan) -> rest exporteren
//   tekort    -> batterij ontladen (als aan) -> rest importeren
// Geeft de vermogens van dit moment terug (MW). Pas ook de energieteller en de lading in 'state' aan.
export function stepGrid(state, { windMW, solarMW, demandMW: demand }, dtH, battery) {
  const eta = Math.sqrt(GRID.batteryEff);
  const dtRef = dtH > 0 ? dtH : 0.25; // om de grenzen te bepalen ook als de tijd stilstaat
  const surplus = windMW + solarMW - demand;
  let charge = 0;
  let discharge = 0;
  let imp = 0;
  let exp = 0;
  if (surplus >= 0) {
    if (battery) charge = Math.min(surplus, GRID.batteryMW, (GRID.batteryMWh - state.soc) / (eta * dtRef));
    exp = surplus - charge;
  } else {
    const need = -surplus;
    if (battery) discharge = Math.min(need, GRID.batteryMW, (state.soc * eta) / dtRef);
    imp = need - discharge;
  }
  state.soc = Math.min(GRID.batteryMWh, Math.max(0, state.soc + (charge * eta - discharge / eta) * dtH));
  state.windMWh += windMW * dtH;
  state.solarMWh += solarMW * dtH;
  state.demandMWh += demand * dtH;
  state.importMWh += imp * dtH;
  state.exportMWh += exp * dtH;
  return { chargeMW: charge, dischargeMW: discharge, importMW: imp, exportMW: exp, surplusMW: surplus };
}

// Geld: wat het net ons kost of oplevert, met de totalen uit de gridstate.
export function money(state, priceEurPerMWh) {
  const produced = state.windMWh + state.solarMWh;
  const selfUsed = Math.max(0, produced - state.exportMWh); // zelf verbruikt (ook via de batterij)
  return {
    savedEur: selfUsed * priceEurPerMWh, // stroom die we niet moesten kopen
    exportEur: state.exportMWh * priceEurPerMWh * MONEY.exportFactor,
    importEur: state.importMWh * priceEurPerMWh, // stroom die we toch moesten kopen
  };
}

// Simuleer een volledige dag (15-minutenstappen) voor een scenario met constante wind.
// We simuleren twee dagen na elkaar en rapporteren de tweede, zodat de batterij niet "gratis" begint.
export function simulateDay({ doy, tiltRad, orientation, cloudPct, windMW, battery, panelCount }) {
  const state = createGridState();
  const tilt = effectiveTilt(tiltRad, orientation);
  let curves;
  for (let pass = 0; pass < 2; pass++) {
    Object.assign(state, { windMWh: 0, solarMWh: 0, demandMWh: 0, importMWh: 0, exportMWh: 0 });
    curves = { hours: [], solar: [], production: [], demand: [] };
    for (let i = 0; i <= 96; i++) {
      const h = i / 4;
      const solarMW = solarFieldMW(sunPosition(doy, h), tilt, cloudPct, panelCount, orientation);
      const demand = demandMW(h);
      curves.hours.push(h);
      curves.solar.push(solarMW);
      curves.production.push(solarMW + windMW);
      curves.demand.push(demand);
      if (i < 96) stepGrid(state, { windMW, solarMW, demandMW: demand }, 0.25, battery);
    }
  }
  const produced = state.windMWh + state.solarMWh;
  return {
    ...curves,
    solarMWh: state.solarMWh,
    windMWh: state.windMWh,
    demandMWh: state.demandMWh,
    importMWh: state.importMWh,
    exportMWh: state.exportMWh,
    peakSolarMW: Math.max(...curves.solar),
    selfSufficiency: Math.min(1, (state.demandMWh - state.importMWh) / state.demandMWh), // aandeel verbruik uit eigen bronnen
    produced,
  };
}
