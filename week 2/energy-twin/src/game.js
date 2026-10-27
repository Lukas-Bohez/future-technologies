import * as THREE from 'three';
import { RING, ringPosition } from './world.js';

// =====================================================================
// HET SPEL: whack-a-mole rond de speler.
// Boten varen in cirkels rond het platform. Elke boot heeft 3 "slots" (gaatjes) waaruit personages opduiken:
//   boeven (rode hoed = vervuilende energiebron): raak ze, +10 en je ziet hun CO2-cijfer
//   vissers (geel): NIET raken, -15
// Ook de windmolens, zonne-eilanden, het dorp en de batterij mag je niet raken (-10).
// Elk slot doorloopt de toestanden  idle (wachten) -> up (zichtbaar) -> down (terugzakken)  of  up -> hit.
// =====================================================================
export const ROUND_SECONDS = 60;
const HIDDEN_Y = -0.9; // onder het dek: de romp bedekt het personage
const UP_Y = 0.6; // bovenkant van de romp

// CO2-uitstoot over de hele levensduur in gram per kWh (mediaanwaarden, IPCC AR5 2014, bijlage III), afgerond.
export const VILLAINS = [
  { name: 'Steenkool', co2: 820, color: 0x222222 },
  { name: 'Stookolie', co2: 650, color: 0x6b2d12 },
  { name: 'Aardgas', co2: 490, color: 0x3b5b8c },
  { name: 'Biomassa', co2: 230, color: 0x6f5a1f },
];

// Personage: lijf + hoofd + hoed. userData is een vrij vak op elk object waar je eigen gegevens in kan bewaren.
function createCharacter(kind, info) {
  const group = new THREE.Group();
  const isVillain = kind === 'villain';
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.9),
    new THREE.MeshStandardMaterial({ color: isVillain ? info.color : 0xffcc00 }), // visser = geel regenpak
  );
  body.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22), new THREE.MeshStandardMaterial({ color: 0xf0c8a0 }));
  head.position.y = 1.1;
  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(isVillain ? 0.24 : 0.34, 0.24, 0.1),
    new THREE.MeshStandardMaterial({ color: isVillain ? 0xcc2222 : 0xffcc00 }), // boef = rode hoed
  );
  hat.position.y = 1.3;
  for (const part of [body, head, hat]) {
    part.castShadow = true;
    group.add(part);
  }
  group.userData = { kind, info };
  return group;
}

// Boot: romp + stuurhut + 3 slots. Hij vaart een cirkel rond de speler met kompashoek 'phase' en hoeksnelheid 'omega'.
function createBoat(radius, omega, phase) {
  const boat = new THREE.Group();
  boat.rotation.order = 'YXZ'; // eerst draaien (y), dan rollen/stampen in de eigen as
  const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 2), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
  hull.position.y = 0.3;
  hull.castShadow = true;
  boat.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
  cabin.position.set(-3, 1.2, 0);
  cabin.castShadow = true;
  boat.add(cabin);

  boat.userData = { radius, omega, phase, slots: [] };
  for (const x of [-1.2, 0.8, 2.8]) {
    boat.userData.slots.push({ boat, x, state: 'idle', t: 0, wait: 0.5 + Math.random() * 2, stay: 2, occupant: null });
  }
  return boat;
}

export function createGame(world, ui) {
  const { scene, turbines, solarIslands, cleanTargets } = world;
  const state = { score: 0, kills: 0, timeLeft: 0, playing: false };

  // Drie ringen boten; de middelste vaart de andere kant op, dat houdt het spannend.
  const boats = [
    createBoat(RING.boats[0], 0.1, 0),
    createBoat(RING.boats[1], -0.08, 120),
    createBoat(RING.boats[2], 0.06, 240),
  ];
  const slots = [];
  for (const b of boats) {
    scene.add(b);
    slots.push(...b.userData.slots);
  }

  // Alle boeven die nu boven het dek staan, voor het richthulpje van de kanon.
  const liveVillains = () => slots.filter((s) => s.state === 'up' && s.occupant.userData.kind === 'villain').map((s) => s.occupant);

  // Wat raakt dit punt? Eenvoudige afstandstests (horizontaal + hoogte). Resultaat:
  //   { type: 'target', obj }  een boef, visser of schone installatie (met punten of strafpunten)
  //   { type: 'block' }        een romp of stuurhut: het blad stopt, maar je krijgt niets
  //   { type: 'sea' }          het water: het blad stopt met een plons
  // Zo "penetreert" een schot niets: het stopt bij het eerste ding op zijn pad.
  const tmp = new THREE.Vector3();
  function findHit(p) {
    for (const slot of slots) {
      if (slot.state !== 'up') continue; // alleen wie nu boven het dek staat is raakbaar
      slot.occupant.getWorldPosition(tmp);
      // Royale hitbox (0,8 breed): het spel is bedoeld om leuk te zijn, niet om te kwellen.
      if (Math.hypot(tmp.x - p.x, tmp.z - p.z) < 0.8 && p.y > tmp.y - 0.2 && p.y < tmp.y + 1.8) return { type: 'target', obj: slot.occupant };
    }
    for (const t of turbines) {
      if (Math.hypot(t.position.x - p.x, t.position.z - p.z) < 0.9 && p.y < 8.5) return { type: 'target', obj: t };
    }
    for (const obj of [...solarIslands, world.village]) {
      if (Math.hypot(obj.position.x - p.x, obj.position.z - p.z) < 4.2 && p.y < 2.6) return { type: 'target', obj };
    }
    if (Math.hypot(world.battery.position.x - p.x, world.battery.position.z - p.z) < 1.6 && p.y < 2.5) return { type: 'target', obj: world.battery };
    for (const b of boats) {
      // Romp en stuurhut in de lokale coördinaten van de boot (de boot is gedraaid).
      tmp.copy(p);
      b.worldToLocal(tmp);
      if (Math.abs(tmp.x) < 4 && Math.abs(tmp.z) < 1 && tmp.y > -0.1 && tmp.y < 0.65) return { type: 'block' };
      if (Math.abs(tmp.x + 3) < 0.7 && Math.abs(tmp.z) < 0.7 && tmp.y > 0.6 && tmp.y < 1.8) return { type: 'block' };
    }
    if (p.y < 0.02) return { type: 'sea' };
    return null;
  }

  // Punten en meldingen als iets geraakt is.
  function registerHit(obj) {
    const { kind, info, label } = obj.userData;
    if (kind === 'villain') {
      state.score += 10;
      state.kills++;
      ui.villain(info);
      const slot = slots.find((s) => s.occupant === obj);
      slot.state = 'hit';
      slot.t = 0;
    } else if (kind === 'civilian') {
      state.score -= 15;
      ui.warning('Niet raken! Dat is een visser. −15');
      const slot = slots.find((s) => s.occupant === obj);
      slot.state = 'hit';
      slot.t = 0;
    } else {
      state.score -= 10;
      ui.warning(`Je schoot je eigen ${label} neer! −10`);
    }
    ui.score();
  }

  // Eén slot per frame bijwerken (de toestandsmachine uit de uitleg bovenaan).
  function updateSlot(slot, dt) {
    slot.t += dt;
    const o = slot.occupant;
    switch (slot.state) {
      case 'idle':
        if (state.playing && slot.t > slot.wait) {
          // Nieuw personage: 70% boef, 30% visser. Verwijder het vorige.
          if (o) slot.boat.remove(o);
          const isVillain = Math.random() < 0.7;
          const info = VILLAINS[Math.floor(Math.random() * VILLAINS.length)];
          slot.occupant = createCharacter(isVillain ? 'villain' : 'civilian', info);
          slot.occupant.position.set(slot.x, HIDDEN_Y, 0);
          slot.boat.add(slot.occupant);
          // Makkelijk starten: eerst lang zichtbaar (2,6 s), aan het eind korter (1,6 s).
          const progress = 1 - state.timeLeft / ROUND_SECONDS;
          slot.stay = 2.6 - progress;
          slot.state = 'up';
          slot.t = 0;
        }
        break;
      case 'up':
        o.position.y = HIDDEN_Y + (UP_Y - HIDDEN_Y) * Math.min(1, slot.t / 0.2);
        if (slot.t > slot.stay || !state.playing) {
          slot.state = 'down';
          slot.t = 0;
        }
        break;
      case 'down': {
        const k = Math.min(1, slot.t / 0.25);
        o.position.y = UP_Y + (HIDDEN_Y - UP_Y) * k;
        if (k >= 1) {
          slot.state = 'idle';
          slot.t = 0;
          slot.wait = 0.5 + Math.random() * 1.8;
        }
        break;
      }
      case 'hit':
        // Geraakt: achterover kantelen en wegzinken.
        o.rotation.x = Math.max(-Math.PI / 2, -slot.t * 6);
        o.position.y = UP_Y - Math.max(0, slot.t - 0.2) * 2;
        if (slot.t > 0.6) {
          slot.boat.remove(o);
          slot.occupant = null;
          slot.state = 'idle';
          slot.t = 0;
          slot.wait = 0.5 + Math.random() * 1.8;
        }
        break;
    }
  }

  function start() {
    state.score = 0;
    state.kills = 0;
    state.timeLeft = ROUND_SECONDS;
    state.playing = true;
    ui.reset();
    ui.score();
  }

  function update(dt, t) {
    // Boten: cirkelbaan rond de speler. Positie uit kompashoek en straal; de boeg wijst langs de baan.
    for (const b of boats) {
      const { radius, omega, phase } = b.userData;
      const bearing = phase + THREE.MathUtils.radToDeg(omega * t);
      b.position.copy(ringPosition(bearing, radius));
      const rad = THREE.MathUtils.degToRad(bearing);
      const sign = Math.sign(omega);
      // Raaklijn van de baan: afgeleide van (sin b, -cos b) is (cos b, sin b), in de draairichting.
      const dx = Math.cos(rad) * sign;
      const dz = Math.sin(rad) * sign;
      b.rotation.y = Math.atan2(-dz, dx);
      b.position.y = Math.sin(t * 1.5 + phase) * 0.08;
      b.rotation.x = Math.sin(t * 1.2 + phase) * 0.03; // rollen
      b.rotation.z = Math.sin(t * 0.9 + phase) * 0.02; // stampen
    }
    if (state.playing) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.playing = false;
        ui.warning(`Tijd om! Score: ${state.score} (${state.kills} boeven uitgeschakeld). Klik op Start voor een nieuwe ronde.`);
      }
      ui.score();
    }
    for (const slot of slots) updateSlot(slot, dt);
  }

  return { state, boats, slots, liveVillains, findHit, registerHit, start, update, cleanTargets };
}
