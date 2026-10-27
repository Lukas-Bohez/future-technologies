import * as THREE from 'three';
import { TURBINE_COUNT } from './wind.js';

// =====================================================================
// DE WERELD: alles staat in cirkels rond de speler (de boom-kanon op het platform in het midden).
//   straal  8: batterijstation
//   straal 12-22: drie ringen boten die rond de speler varen (zie game.js)
//   straal 33: eilanden (2x zonnepanelen, 1x dorp)
//   straal 45: ring van windmolens
// Posities worden gegeven als kompasrichting (0 = noord = -z, 90 = oost = +x) en afstand.
// =====================================================================
export const RING = { battery: 8, boats: [12, 17, 22], islands: 33, turbines: 45 };

export function ringPosition(bearingDeg, radius, y = 0) {
  const b = THREE.MathUtils.degToRad(bearingDeg);
  return new THREE.Vector3(Math.sin(b) * radius, y, -Math.cos(b) * radius);
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, ...extra });

// Windmolen: toren + gondel + naaf met 3 wieken. We bewaren de naaf (hub) en het lampje in userData
// zodat de render loop ze kan laten draaien en kleuren.
function createTurbine(position) {
  const turbine = new THREE.Group();
  const white = mat(0xf2f2f2);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 8), white);
  tower.position.y = 4; // de hoogte is 8, dus het midden op 4 laat hem op y=0 staan
  tower.castShadow = true;
  turbine.add(tower);

  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1), white);
  nacelle.position.y = 8;
  nacelle.castShadow = true;
  turbine.add(nacelle);

  // De hub is een lege group in het midden van de wieken; roteren we hem, dan draaien alle wieken mee.
  const hub = new THREE.Group();
  hub.position.set(0, 8, 0.6);
  for (let i = 0; i < 3; i++) {
    // Elke wiek zit in zijn eigen pivot-group, 120 graden (2π/3) gedraaid ten opzichte van de vorige.
    const pivot = new THREE.Group();
    pivot.rotation.z = (i * 2 * Math.PI) / 3;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 0.05), white);
    blade.position.y = 1.75;
    blade.castShadow = true;
    pivot.add(blade);
    hub.add(pivot);
  }
  turbine.add(hub);

  // Statuslampje: de kleur toont hoeveel de turbine produceert.
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.18),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 1.5 }),
  );
  lamp.position.y = 8.45;
  turbine.add(lamp);

  turbine.position.copy(position);
  turbine.userData = { kind: 'clean', label: 'windmolen', hub, lamp };
  return turbine;
}

// Zonne-eiland met 6 paneeltjes op paaltjes. Panelen gebruiken rotatievolgorde 'YXZ': eerst kantelen (x),
// daarna draaien naar oost of west (y). main.js zet hun hoek elk frame uit de sliders.
function createSolarIsland(position, panels) {
  const island = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.6, 20), mat(0xc2b280));
  base.position.y = 0.1;
  base.receiveShadow = true;
  island.add(base);
  for (let i = 0; i < 6; i++) {
    const px = -2 + (i % 3) * 2;
    const pz = i < 3 ? -1.2 : 1.2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), mat(0x888888));
    post.position.set(px, 0.7, pz);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.0), mat(0x14307a, { metalness: 0.6, roughness: 0.3 }));
    panel.rotation.order = 'YXZ';
    panel.position.set(px, 1.05, pz);
    panel.castShadow = true;
    island.add(post, panel);
    panels.push(panel);
  }
  island.position.copy(position);
  island.userData = { kind: 'clean', label: 'zonne-eiland' };
  return island;
}

// Dorp: huisjes waarvan de raampjes oplichten naarmate het verbruik hoger is (de vraagkant van het net).
function createVillage(position, windows) {
  const village = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.6, 20), mat(0x6b8e4e));
  base.position.y = 0.1;
  base.receiveShadow = true;
  village.add(base);
  const spots = [[-2.5, -1.5], [0, -2], [2.5, -1.5], [-2.5, 1.5], [0, 2], [2.5, 1.5]];
  for (const [x, z] of spots) {
    const house = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.2), mat(0xe8d9b5));
    wall.position.y = 0.9;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.7, 4), mat(0xa0522d));
    roof.position.y = 1.75;
    roof.rotation.y = Math.PI / 4;
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0xffd36b, emissiveIntensity: 0 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), windowMat);
    win.position.set(0, 0.95, 0.61);
    wall.castShadow = true;
    roof.castShadow = true;
    house.add(wall, roof, win);
    house.position.set(x, 0, z);
    house.rotation.y = Math.atan2(-x, -z); // het raampje kijkt naar het midden van het eiland
    village.add(house);
    windows.push(windowMat);
  }
  village.position.copy(position);
  village.userData = { kind: 'clean', label: 'dorp' };
  return village;
}

// Batterijstation: een container met een vulbalk die de lading toont.
function createBattery(position) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.2), mat(0x607080));
  box.position.y = 1.5;
  box.castShadow = true;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.5, 12), mat(0x444444));
  stand.position.y = 0.25;
  // Vulbalk: schaalt in hoogte met de lading, kleurt van rood naar groen.
  const fill = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.3, 0.1), new THREE.MeshStandardMaterial({ color: 0x22ff55, emissive: 0x115522 }));
  fill.position.set(0, 1.5, 0.65);
  group.add(stand, box, fill);
  group.position.copy(position);
  group.userData = { kind: 'clean', label: 'batterij', fill };
  return group;
}

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 45, 130); // verre dingen vervagen in de lucht

  // Licht. Zonder licht zijn MeshStandardMaterials zwart.
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  // Schaduwgebied en kwaliteit afgestemd op de ring: straal 50 rond de speler.
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 170 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // De zon zelf (een gele bol ver weg).
  const sunSphere = new THREE.Mesh(new THREE.SphereGeometry(4), new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false }));
  scene.add(sunSphere);

  // Zee: een groot plat vlak. PlaneGeometry staat standaard rechtop, dus we kantelen het 90 graden.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mat(0x1e6fa8, { roughness: 0.4 }));
  sea.rotation.x = -Math.PI / 2;
  sea.receiveShadow = true;
  scene.add(sea);

  // Windmolens: gelijkmatig verdeeld op een ring rond de speler.
  const turbines = [];
  for (let i = 0; i < TURBINE_COUNT; i++) {
    const t = createTurbine(ringPosition((i * 360) / TURBINE_COUNT + 10, RING.turbines));
    scene.add(t);
    turbines.push(t);
  }

  // Eilanden op de middelste ring: zonne-eilanden en een dorp.
  const solarPanels = [];
  const solarIslands = [
    createSolarIsland(ringPosition(60, RING.islands), solarPanels),
    createSolarIsland(ringPosition(180, RING.islands), solarPanels),
  ];
  const villageWindows = [];
  const village = createVillage(ringPosition(300, RING.islands), villageWindows);
  scene.add(...solarIslands, village);

  const battery = createBattery(ringPosition(135, RING.battery));
  scene.add(battery);

  // Zonnestralen: één lijn per paneel richting de zon.
  const rays = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(solarPanels.length * 6), 3)),
    new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.35 }),
  );
  rays.frustumCulled = false; // de posities veranderen elk frame
  scene.add(rays);

  // Alles wat de speler NIET mag raken (schone energie).
  const cleanTargets = [...turbines, ...solarIslands, village, battery];

  return { scene, ambient, sun, sunSphere, sea, turbines, solarIslands, solarPanels, village, villageWindows, battery, rays, cleanTargets };
}
