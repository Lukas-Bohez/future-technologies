# Week 2 – Energy Twin (Three.js)

Opdracht: een 3D-scène rond energie bouwen die een digital twin wordt (echte data/scan, spraak, simulatie).
De code en documentatie staan in [energy-twin/](energy-twin/README.md). **Om het project te leren en te kunnen uitleggen: lees [LEREN.md](LEREN.md)** (grote lijn, Three.js-begrippen, uitleg per bestand, de berekeningen, verwachte vragen, oefeningen en een demo-script).

## Gekozen thema's: wind én zon

We combineren windenergie en zonne-energie in één scène (zie [energy-twin/README.md](energy-twin/README.md)).

## Keuze framework: vanilla Three.js + Vite

- Opdracht staat vanilla + Vite toe; je leert de Three.js-basis zonder framework-laag erbovenop.
- Alle docs en voorbeelden op threejs.org zijn vanilla, dus je kan ze 1-op-1 volgen (belangrijk in fase 1, geen AI).
- Snelle dev-server, eenvoudige build voor GitHub Pages.

## Checklist

### Fase 1 – de scène (docs: https://threejs.org/docs, voorbeelden: https://threejs.org/examples; idee en eerste boot zelf, uitwerking met AI-hulp, zie AI-verantwoording)
- [x] Scène, camera, renderer, render loop *(staat klaar)*
- [x] Licht en OrbitControls *(staat klaar)*
- [x] Minstens 4 thema-objecten (huis, panelen, zon, ...)
- [x] Minstens 1 interactief of bewegend element
- [x] `git commit -m "fase-1-klaar"` **voor je AI gebruikt**

De losse, kale fase 1-scène staat in [Phase-1/](Phase-1/README.md): een eigen
Vite-project met één leesbaar `main.js` (scène, licht, 8 objecten, OrbitControls,
klikken om aan/uit te zetten, draaiende wieken, bewegende zon en vallende regen).
De code is manueel geschreven, met lichte AI-hulp (chatberichten) om slecht gedocumenteerde
Three.js-dingen duidelijker te maken; zie [Phase-1/README.md](Phase-1/README.md).
Live: https://lukas-bohez.github.io/future-technologies/phase-1/ (de link staat
ook in de HUD van de twin).

### Fase 2 – echte data of 3D-scan
- [x] Open-Meteo (live wind, richting, bewolking) en SunCalc (zonnestand)

### Fase 3 – spraak + simulatie
- [x] Web Speech API, minstens 3 commando's, feedback + knoppen
- [x] Simulatie met live waarde, grafiek, visuele aanwijzing en minstens 1 regelbare parameter
- [x] Uitbreidingen (alle zeven uit de opdracht): scenario's vergelijken, geld en CO₂-besparing, hardware/sensor (Web Serial), zonnestralen en schaduw, AI-assistent, net met meerdere bronnen en batterij, WebXR

### Inleveren
- [x] Repo-link + README (thema, starten, bronnen, formules, privacy: waar gaan spraak en data naartoe)
- [x] Live link: https://lukas-bohez.github.io/future-technologies/
- [x] Demo (max. 2 min), reflectie (max. 200 woorden), AI-verantwoording voor fase 2 en 3

## Nuttige links
- Docs: https://threejs.org/docs/ · Voorbeelden: https://threejs.org/examples/
- Zonnestand: https://github.com/mourner/suncalc · Weer: https://open-meteo.com/en/docs
- Gratis modellen (met bronvermelding): https://poly.pizza, https://sketchfab.com

## Hardware
Voorbeeldprogramma voor een ESP32-windsensor: [hardware/esp32-wind-sensor/](hardware/esp32-wind-sensor/esp32-wind-sensor.ino).
