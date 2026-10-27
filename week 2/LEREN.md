# Leerdocument: Energy Twin begrijpen en kunnen uitleggen

Doel: tegen woensdag het project kunnen uitleggen en verdedigen. Lees in deze volgorde: 1 (grote lijn), 2 (Three.js-basis), 3 (per bestand), 4 (de berekeningen), 5 (verwachte vragen), 6 (oefeningen), 7 (demo van 2 minuten).

Alle codeverwijzingen zijn bestanden in [energy-twin/src/](energy-twin/src/). Zoek de genoemde functies op in je editor (Ctrl+F) en lees ze zelf na. De commentaren in de code zijn in het Nederlands en leggen het "waarom" uit.

---

## 1. De grote lijn

Wat het is: een **digital twin** van een offshore windpark. Een digital twin is een virtueel model dat reageert op data en simulatie. Hier reageert de 3D-wereld op:
- **echte data** (Open-Meteo: wind, richting, bewolking; SunCalc: zonnestand),
- **je stem** (Web Speech API),
- **een simulatie** (wind- en zonnevermogen, net, batterij, geld).

Bovenop zit een **spel** (whack-a-mole) dat de CO₂-cijfers van energiebronnen toont.

```
                    main.js  (koppelt alles, render loop)
   ┌───────────┬───────────┼──────────────┬───────────────┐
 world.js    game.js    turret.js     rekenmodellen     invoer/uitleg
 (3D-scène)  (spel)    (kanon)        wind.js            data.js      (Open-Meteo)
                          │           solar.js           voice.js     (spraak)
                       radar.js       grid.js            hardware.js  (sensor)
                                                         assistant.js (vragen)
```

Elk frame (±60× per seconde) doet `animate()` in `main.js` dit, in volgorde:
1. **Klok**: de gesimuleerde tijd loopt door (1 echte seconde = 10 gesimuleerde minuten).
2. **Zon**: positie uit SunCalc → licht, schaduw, luchtkleur, stralen, paneelhoek.
3. **Wind**: turbines draaien naar de wind; vermogen per turbine.
4. **Net**: wind + zon tegenover verbruik, batterij, import/export, geld.
5. **HUD en grafieken** bijwerken.
6. **Spel, kanon, radar**, daarna `renderer.render(scene, camera)`.

Dit patroon (invoer → berekening → scène aanpassen → tekenen) is de kern van elke real-time 3D-toepassing.

---

## 2. Three.js-basis (de dingen die je moet kunnen uitleggen)

| Begrip | Wat het is | Waar in de code |
| --- | --- | --- |
| **Scene** | de wereld; alleen wat je met `scene.add(...)` toevoegt bestaat | `createWorld()` in `world.js` |
| **Mesh** | `Geometry` (vorm) + `Material` (uiterlijk) = zichtbaar object | overal, bv. `new THREE.Mesh(new THREE.BoxGeometry(...), new THREE.MeshStandardMaterial(...))` |
| **Group** | een "mapje" van objecten die samen bewegen; kinderen erven positie/rotatie van de ouder | windmolen (`createTurbine`), boot (`createBoat`), kanon (`yawGroup` > `pitchGroup`) |
| **Camera** | je oog (`PerspectiveCamera`: gezichtsveld, beeldverhouding, dichtbij, ver) | `main.js`; de camera zit als **kind** in `yawGroup`, daarom draait hij mee met de kanon |
| **Renderer** | tekent de scène vanuit de camera op het `<canvas>` | `new THREE.WebGLRenderer(...)` in `main.js` |
| **Licht** | zonder licht zijn `MeshStandardMaterial`-objecten zwart. `AmbientLight` = overal wat licht, `DirectionalLight` = parallelle zonnestralen met schaduw | `createWorld()`: `ambient` en `sun` |
| **Schaduw** | drie dingen: `renderer.shadowMap.enabled`, licht `castShadow`, meshes `castShadow`/`receiveShadow` | `world.js`, `main.js` |
| **Render loop** | functie die elk frame draait; beweging = elk frame een klein beetje veranderen | `renderer.setAnimationLoop(animate)` |
| **dt (delta)** | seconden sinds het vorige frame; `positie += snelheid * dt` maakt beweging onafhankelijk van de framerate | `animate(now)` |
| **Coördinaten** | x = oost (rechts), y = omhoog, z naar jou toe; **-z = noord** in onze wereld | `ringPosition()` in `world.js` |
| **Rotatievolgorde** | `rotation.order = 'YXZ'`: eerst draaien rond y, dan kantelen | boten en zonnepanelen |
| **Raycaster** | onzichtbare lijn om te testen wat je raakt (in fase 1 gebruikt voor klikken) | vervangen door `findHit` in `game.js` |

**Waarom geen framework?** De opdracht staat vanilla + Vite toe. Alle voorbeelden en documentatie op threejs.org zijn vanilla, dus je leert Three.js zelf zonder extra laag. Vite geeft een snelle dev-server en een simpele build voor GitHub Pages.

**Waarom `three/addons/webxr/VRButton.js`?** Three.js bevat de WebXR-ondersteuning; `renderer.xr.enabled = true` en `setAnimationLoop` (in plaats van `requestAnimationFrame`) zijn genoeg om dezelfde scène in een VR-headset te tonen.

---

## 3. Per bestand: wat doet het en welke functies zijn belangrijk

### `world.js`: de wereld in cirkels
- `RING` bepaalt de afstanden: batterij 8, boten 12/17/22, eilanden 33, windmolens 45.
- `ringPosition(kompasgraden, straal)`: zet "richting + afstand" om naar een punt (`x = straal·sin(hoek)`, `z = -straal·cos(hoek)`). 0° = noord = -z, 90° = oost = +x. Zo staat alles in een cirkel rond de speler.
- `createTurbine`: toren, gondel, naaf (`hub`) met 3 wieken (elk in een `pivot` die 120° verder staat) en een lampje. De hub en het lampje worden in `userData` bewaard zodat de render loop ze kan laten draaien/kleuren.
- `createSolarIsland`, `createVillage`, `createBattery`: eilanden met panelen, dorp met raampjes (lichten op bij verbruik), batterijstation met vulbalk.
- `createWorld`: zet licht, zee, zon en alles samen; geeft een object terug met wat `main.js` nodig heeft (`turbines`, `solarPanels`, `battery`, ...).

### `game.js`: het spel
- Boten (`createBoat`) varen een cirkel; in `update` wordt hun positie berekend uit een kompashoek die in de tijd groeit en hun boeg wijst langs de raaklijn van de baan.
- Elke boot heeft **3 slots**. Elk slot is een kleine **toestandsmachine** (`updateSlot`): `idle` (wachten) → `up` (zichtbaar) → `down` (terugzakken), of `up` → `hit` (geraakt). Dit is de standaardmanier om "dingen die opduiken" te programmeren.
- `findHit(punt)`: test of een punt iets raakt, met eenvoudige afstanden (horizontale afstand + hoogte). Geeft `target` (boef, visser, schone installatie), `block` (romp/stuurhut) of `sea`.
- `registerHit`: +10 voor een boef, −15 visser, −10 voor eigen schone energie.
- Moeilijkheid: `stay = 2.6 − voortgang` seconden zichtbaar (begint makkelijk, eindigt korter).

### `turret.js`: de boom-kanon
- Structuur: `platform` (vast) → `yawGroup` (draait links/rechts) → `pitchGroup` (kantelt omhoog/omlaag) met loop, stam en kroon. De camera zit in `yawGroup`.
- Invoer: `keys`-object met booleans; `keydown`/`keyup` zetten ze aan/uit; de render loop leest ze. (Zo vermijd je dat toetsherhaling de beweging hakkelig maakt.)
- Draaien met zachte versnelling: `yawVel += (gewenst − yawVel)·min(1, dt·10)`.
- `fire()`: berekent een **richtpunt** (waar het kruisje heen wijst, of een boef binnen ±5° = richthulp) en vuurt het blad vanaf de loop erheen.
- `updateBullets`: elk frame gaat een blad in **kleine stapjes van max. 0,3** vooruit en roept elke stap `findHit` aan. Dat voorkomt "tunneling" (een snel object dat dwars door een doel vliegt tussen twee frames). Bij een treffer, een romp of de zee stopt het blad: **schoten doorboren niets**.
- Bladerspoor: elke stap verschijnt een klein blad dat draait, valt en krimpt (`trail`).

### `radar.js`
Zet wereldpunten om naar een rond 2D-canvas met jouw kijkrichting naar boven. Formule: `vooruit = −x·sin(yaw) − z·cos(yaw)`, `rechts = x·cos(yaw) − z·sin(yaw)`.

### `wind.js`: windformules (pure functies, geen Three.js)
- `turbinePowerMW(v)`: 0 onder 3 m/s (cut-in) en vanaf 25 m/s (cut-out); tussen 3 en 12 m/s groeit het met v³; daarboven het nominale vermogen (8 MW).
- `rotorSpeed(v)`: draaisnelheid van de wieken voor de animatie.
- `compassName(graden)`: 225 → "ZW".

### `solar.js`: zon
- `sunPosition(dag, uur)`: SunCalc geeft hoogte en richting; wij rekenen verder in radialen.
- `clearSkyDNI(hoogte)`: straling bij heldere hemel (Meinel): `1353 · 0,7^(AM^0,678)`, met `AM = 1/sin(hoogte)` (hoe laag de zon, hoe dikker de luchtlaag).
- `cloudFactor(%)`: bewolking vermindert de straling.
- `panelPowerKW(...)`: `aantal · oppervlak · rendement · straling · cos(hoek zon-paneel)`. De cosinus is het inproduct van de zonrichting met de **paneelnormaal**.
- `solarFieldMW(..., orientation)`: 'south' of 'ew' (helft oost, helft west).
- `effectiveTilt`: oost-west staat in de praktijk vlak (max. 15°).

### `grid.js`: net, batterij, geld, scenario's
- `demandMW(uur)`: verbruiksprofiel (basis + piek om 8u + piek om 19u).
- `stepGrid(state, {wind, zon, verbruik}, dtUren, batterijAan)`: overschot → batterij laden → rest exporteren; tekort → batterij ontladen → rest importeren. Houdt de lading (`soc`) en alle totalen bij.
- `money(...)`: besparing, export-opbrengst, importkosten.
- `simulateDay(...)`: loopt 2× een dag in stappen van 15 minuten en geeft de tweede dag terug (zodat de batterij niet "gratis" begint). Wordt gebruikt voor de scenario-vergelijking.

### `data.js`, `voice.js`, `hardware.js`, `assistant.js`
- `data.js`: één `fetch` naar Open-Meteo, geeft `{speed, direction, cloud, time}`.
- `voice.js`: `parseCommand(zin)` zoekt sleutelwoorden met reguliere expressies en geeft een commando-object (`{name:'wind-set', value:12}`); `createRecognizer` is de Web Speech API (zit in Chrome/Edge); `speak` laat de browser antwoorden uitspreken.
- `hardware.js`: `parseSensorLine` leest `{"wind":7.5,"dir":220}` of `wind=7.5 dir=220`; `createSerialSensor` gebruikt Web Serial (de gebruiker kiest zelf het apparaat); `createSimulatedSensor` is een nepsensor voor tests.
- `assistant.js`: `localAnswer` herkent de vraag met regels en vult de actuele waarden in; `askClaude` is optioneel (eigen API-sleutel).

### `main.js`: de lijm
- **Windbron**: `source` is 'manual' (sliders), 'live' (Open-Meteo) of 'sensor'. `currentWind()`/`currentWindDir()` kiezen de juiste bron; de rest van de code kent maar één windwaarde.
- `runCommand(cmd)`: **één plek** waar commando's worden uitgevoerd; spraak én knoppen roepen die aan. Zo is er geen dubbele logica.
- `snapshot()`: een object met alle actuele waarden; de assistent antwoordt daarop.
- `runComparison()`: draait vier `simulateDay`-scenario's en vult de tabel en grafiek.
- `animate(now)`: de render loop (zie 1).

---

## 4. De berekeningen in gewone woorden

**Wind: waarom v³?** De energie in bewegende lucht is `½·ρ·A·v³`. Verdubbel je de wind, dan krijg je 8× zoveel energie. Daarom groeit het vermogen met v³ tussen inschakelsnelheid (3 m/s) en nominale snelheid (12 m/s). Boven nominaal regelt de turbine af (vast 8 MW), boven 25 m/s staat hij stil (veiligheid).

**Windrichting en opbrengst.** Een turbine draait zich traag naar de wind (`YAW_RATE`). Staat hij scheef met hoek `err`, dan vangt hij `wind · cos(err)` op. Bij 90° scheef is dat 0. Daardoor zie je de opbrengst zakken als de wind plots draait, en herstellen als de turbines zijn bijgedraaid.

**Zon: waarom cos(hoek)?** Een paneel vangt het meeste als de zon er loodrecht op staat. Staat de zon schuin, dan treft dezelfde straling een groter oppervlak: de vangst schaalt met `cos(hoek)`. Dat is het inproduct van de richting naar de zon en de normaal van het paneel.

**Waarom is 's winters de opbrengst veel lager?** De zon staat lager (kleine hoek), dus (1) minder cos-factor, (2) een dikkere luchtlaag (`AM = 1/sin(hoogte)`), (3) kortere dagen.

**Zuid vs oost-west.** Zuid piekt hoog rond de middag. Oost-west heeft een lagere piek maar vangt ook de ochtend- en avondzon; de panelen staan bijna vlak (max. 15°). Welke wint hangt van de dag: in de zomer bijna gelijk, in de winter wint zuid duidelijk (het model laat dit zien).

**Net en batterij.** Productie (wind + zon) minus verbruik = overschot of tekort. Een batterij schuift energie door de tijd: overschot opslaan, tekort aanvullen. Rendement 90% heen en terug (√0,9 per richting). Zonder batterij moet je het tekort importeren en het overschot exporteren (dat levert de helft op).

**Geld.** Besparing = zelf gebruikte MWh × prijs. Export = MWh × prijs × 0,5. Import = MWh × prijs. De prijzen zijn aannames (regelbaar), geen echte marktdata.

**CO₂.** Besparing = opgewekte kWh × (490 − bronwaarde) g, met 490 g/kWh voor aardgas als referentie; wind 12 g/kWh, zon 41 g/kWh. De cijfers van de boeven komen uit IPCC AR5 (2014), afgerond.

**Simplificaties (zeg die zelf, dat telt positief):** geen windschaduw tussen turbines, vaste luchtdichtheid, geen netverliezen, benaderde vermogenscurve, alleen directe straling (geen diffuus licht), verbruiksprofiel en prijzen zijn aannames, scenario's rekenen met constante wind, elk paneeltje in de scène stelt 2,5 ha voor.

---

## 5. Verwachte vragen en antwoorden

1. **Wat is een digital twin?** Een virtueel model dat reageert op echte data en simulatie. Hier: echte wind en zon + berekeningen sturen de 3D-scène.
2. **Hoe werkt de render loop?** `setAnimationLoop(animate)` roept `animate` elk frame aan. We berekenen eerst alles (klok, zon, wind, net, spel) en roepen dan `renderer.render(scene, camera)` aan. `dt` maakt de snelheid onafhankelijk van de framerate.
3. **Waarom zit de camera in `yawGroup`?** De camera erft zo de rotatie van de kanon: draait de kanon, dan draait de camera mee. Daardoor is er geen aparte camerabesturing.
4. **Hoe weet het spel of je iets raakt?** Een blad is een punt dat in stapjes van max. 0,3 vooruitgaat; elke stap test `findHit` de afstand tot de doelen. Kleine stappen voorkomen dat een snel blad door een doel heen vliegt.
5. **Waarom stopt een schot bij de romp?** `findHit` geeft `block` terug voor romp en stuurhut: het blad wordt dan verwijderd, zonder punten.
6. **Hoe kom je aan de zonpositie?** SunCalc, op basis van datum, tijd en coördinaten. Die positie zet ik om naar een richting in onze scène (x = oost, -z = noord) en gebruik ik voor het licht, de schaduw, de stralen en de berekening.
7. **Hoe worden schaduwen gemaakt?** Met een shadow map: het licht "ziet" de scène en onthoudt wat dichtbij is; wat erachter ligt, staat in de schaduw. De zon (`DirectionalLight`) beweegt elk frame mee met SunCalc.
8. **Welke data is echt?** Wind, windrichting en bewolking (Open-Meteo) en de zonpositie (SunCalc). Verbruik, prijzen en schaal van de installaties zijn aannames.
9. **Waar gaan mijn spraak en data naartoe?** Spraak gaat in Chrome/Edge naar de cloud van de browser voor herkenning. Open-Meteo krijgt alleen de vaste coördinaten. De assistent is lokaal; alleen met je eigen API-sleutel gaan de vraag en de waarden naar Anthropic. Zie "Privacy" in [energy-twin/README.md](energy-twin/README.md).
10. **Wat is de grootste vereenvoudiging?** Zie 4: bv. de benaderde vermogenscurve zonder windschaduw, en alleen directe zonnestraling.
11. **Wat deed jij zelf en wat de AI?** Wees eerlijk (zie hieronder). Jij: het idee, de eerste boot en de boom, de keuze van thema's en wensen, testen. De AI: de uitwerking van de code. Je kan de code uitleggen met dit document.
12. **Wat werkte niet of is niet getest?** Zie "Wat is getest en wat niet" in de README: VR-headset en echte ESP32 niet getest.
13. **Hoe voeg je een commando toe?** In `voice.js` een regel in `parseCommand` (sleutelwoorden → `{name:'...'}`) en in `main.js` een `case` in `runCommand`. Eén plek, zowel voor spraak als knoppen.
14. **Hoe vergelijk je scenario's?** `simulateDay` loopt een volledige dag door in stappen van 15 minuten voor twee varianten met dezelfde omstandigheden; de tabel toont de verschillen.
15. **Waarom twee dagen simuleren?** De batterij begint op 30%. De tweede dag start met de lading van de eerste, zodat het resultaat niet vertekend wordt door de beginlading.

**Over de AI-verantwoording.** Zeg wat waar is: het idee en de eerste boot/boom waren van jou, de uitwerking schreef de AI, en je hebt het daarna doorgenomen (dit document) en getest. Een eerlijke verantwoording, ook als de AI veel deed, weegt zwaarder dan een mooier verhaal.

---

## 6. Oefeningen (doe er minstens twee, dan snap je het echt)

1. **Boten sneller of trager.** In `game.js`, `createGame`: de tweede parameter van `createBoat` (`0.1`) is de hoeksnelheid in rad/s. Verander hem en kijk wat er gebeurt.
2. **Makkelijker of moeilijker.** In `turret.js`: `ASSIST_ANGLE` (richthulp) en `FIRE_COOLDOWN`. In `game.js`: de `0.8` in `findHit` (hitbox) en `stay = 2.6 − ...`.
3. **Een extra windmolen.** `TURBINE_COUNT` in `wind.js` van 8 naar 12. Waarom staan ze dan nog netjes in een cirkel? (`ringPosition` met `i·360/TURBINE_COUNT`.)
4. **Andere locatie.** `SITE` in `solar.js` en `LAT/LON` in `data.js` (bv. Zuid-Spanje). Wat gebeurt er met de zonproductie in de winter?
5. **Nieuwe boef.** Voeg een regel toe aan `VILLAINS` in `game.js` (naam, CO₂, kleur).
6. **Nieuw commando.** Bv. "zet de prijs op 150" → regel in `parseCommand` en `case` in `runCommand` die `el.price.value` zet.
7. **Berekening controleren.** Open de scenario-tabel en reken één cijfer na met de formules uit 4 (bv. het zonvermogen bij 60° zonhoogte en 35° paneelhoek).
8. **Meten zonder de code.** Zet de batterij uit en dan aan op een zonnige dag; kijk naar import/export en de netto €. Leg uit waarom.

---

## 7. Demo van 2 minuten (script)

1. (10 s) Wat het is: digital twin van een offshore windpark met zonne-eilanden; echte data, stem, simulatie; bediend met een boom-kanon.
2. (25 s) Klik **Start**. Draai met ← →, kijk met ↑ ↓, schiet met de spatiebalk. Raak een boef (CO₂-cijfer verschijnt). Raak bewust één windmolen: strafpunten. Wijs de radar aan.
3. (25 s) **Wind**: sleep de windsnelheid, en zeg "wind uit het noorden": de turbines draaien bij en de opbrengst zakt even. Klik **Live wind** voor echte data.
4. (25 s) **Zon**: schuif de datum van zomer naar winter en kijk naar de dagcurve en de schaduwen. Zet de opstelling op oost-west.
5. (20 s) **Net/Scenario's**: batterij aan/uit en klik **Vergelijk**: lees één verschil voor (bv. MWh import).
6. (10 s) **Assistent**: vraag "waarom is de opbrengst laag?".
7. (5 s) Sluit af: wat de grootste vereenvoudiging is en wat je geleerd hebt.

**Spraak werkt alleen in Chrome of Edge** en vraagt toestemming voor de microfoon. Test dit vóór de demo.

---

## 8. Problemen oplossen

| Probleem | Oplossing |
| --- | --- |
| Pagina blijft leeg | open de browserconsole (F12); draai `npm install` en `npm run dev` in `week 2/energy-twin` |
| Geen spraak | gebruik Chrome of Edge, geef microfoontoestemming, https of localhost |
| "Live wind" mislukt | geen internet of Open-Meteo onbereikbaar; de sliders blijven werken |
| Niets gebeurt bij schieten | druk eerst op **Start**: buiten een ronde kan je niet schieten |
| Pijltjes bewegen een slider | klik buiten het paneel; de kanon neemt de focus af van het paneel bij de eerste pijltjestoets |
| GitHub Pages toont niets | repo → Settings → Pages → Source = GitHub Actions, daarna de workflow opnieuw draaien |
