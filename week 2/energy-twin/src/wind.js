// Simulatie: windvermogen van één turbine. Pure functies, zonder Three.js, zodat je ze apart kan testen.
//
// Vereenvoudigd model (grootste vereenvoudiging van de simulatie, zie README):
//   - onder de inschakelsnelheid (cut-in) draait niets
//   - daartussen en de nominale windsnelheid (rated) groeit het vermogen met v³
//   - tussen nominaal en uitschakelsnelheid (cut-out) levert de turbine het nominale vermogen
//   - boven cut-out staat de turbine stil (veiligheid)
// Waarom v³? Kinetische energie van lucht = ½ · ρ · A · v³. Verdubbel de wind, 8× meer energie.
export const TURBINE = {
  ratedMW: 8, // nominaal vermogen per turbine (typische offshore turbine: 8-15 MW)
  cutIn: 3, // m/s
  rated: 12, // m/s
  cutOut: 25, // m/s
};
export const TURBINE_COUNT = 8;

// Vermogen van één turbine in MW bij windsnelheid v (m/s).
export function turbinePowerMW(v) {
  const { ratedMW, cutIn, rated, cutOut } = TURBINE;
  if (v < cutIn || v >= cutOut) return 0;
  if (v >= rated) return ratedMW;
  // Schaal v³ zodat het 0 is bij cut-in en ratedMW bij rated.
  return (ratedMW * (v ** 3 - cutIn ** 3)) / (rated ** 3 - cutIn ** 3);
}

// Rotatiesnelheid in rad/s voor de animatie (niet fysisch exact, wel evenredig met de wind
// tot nominaal; boven cut-out stilstaan).
export function rotorSpeed(v) {
  const { rated, cutIn, cutOut } = TURBINE;
  if (v < cutIn || v >= cutOut) return 0;
  return Math.min(v, rated) * 0.3;
}

// CO2 die we besparen tegenover aardgascentrales (g CO2/kWh, IPCC AR5), minus die van wind zelf.
export const GAS_CO2 = 490;
export const WIND_CO2 = 12;
export function co2SavedTonnes(energyMWh) {
  // MWh = 1000 kWh; g -> ton: / 1e6
  return (energyMWh * 1000 * (GAS_CO2 - WIND_CO2)) / 1e6;
}

// Windrichting als kompasletters (Nederlands), bv. 225 -> 'ZW'.
export function compassName(deg) {
  const names = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
