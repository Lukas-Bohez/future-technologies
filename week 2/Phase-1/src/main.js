import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const GROUND = 0.4;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc4e8);
scene.fog = new THREE.Fog(0x8fc4e8, 35, 110);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(17, 12, 19);
camera.lookAt(0, 3, 0);

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

const sunLight = new THREE.DirectionalLight(0xfff3d0, 2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -20;
sunLight.shadow.camera.right = 20;
sunLight.shadow.camera.top = 20;
sunLight.shadow.camera.bottom = -20;
scene.add(sunLight);

const matWit = new THREE.MeshStandardMaterial({ color: 0xe8eef2 });
const matGrijs = new THREE.MeshStandardMaterial({ color: 0x9aa4ad });
const matMuur = new THREE.MeshStandardMaterial({ color: 0xd9c7a7 });
const matDak = new THREE.MeshStandardMaterial({ color: 0x8c3b2f });
const matPaneel = new THREE.MeshStandardMaterial({ color: 0x16324f, emissive: 0x0a3f6b, emissiveIntensity: 0 });

const zee = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x1b4f72, roughness: 0.4, metalness: 0.2 })
);
zee.rotation.x = -Math.PI / 2;
zee.receiveShadow = true;
scene.add(zee);

const eiland = new THREE.Mesh(
  new THREE.CylinderGeometry(7, 7.6, 0.6, 48),
  new THREE.MeshStandardMaterial({ color: 0x6f7d4a })
);
eiland.position.y = GROUND - 0.3;
eiland.receiveShadow = true;
scene.add(eiland);

const windmolen = new THREE.Group();

const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 7, 16), matWit);
mast.position.y = 3.5;
mast.castShadow = true;
windmolen.add(mast);

const gondel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.6), matWit);
gondel.position.set(0, 7.1, 0.2);
gondel.castShadow = true;
windmolen.add(gondel);

const rotor = new THREE.Group();
rotor.position.set(0, 7.1, 1.0);
windmolen.add(rotor);

const naaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), matGrijs);
naaf.castShadow = true;
rotor.add(naaf);

for (let i = 0; i < 3; i++) {
  const arm = new THREE.Group();
  arm.rotation.z = (i * Math.PI * 2) / 3;

  const wiek = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.08), matWit);
  wiek.position.y = 1.5;
  wiek.castShadow = true;

  arm.add(wiek);
  rotor.add(arm);
}

windmolen.position.set(-4.5, GROUND, -1.5);
scene.add(windmolen);

const huis = new THREE.Group();

const muren = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 3), matMuur);
muren.position.y = 1.1;
muren.castShadow = true;
muren.receiveShadow = true;
huis.add(muren);

const dak = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.4, 4), matDak);
dak.position.y = 2.9;
dak.rotation.y = Math.PI / 4;
dak.castShadow = true;
huis.add(dak);

const raam = new THREE.Mesh(
  new THREE.BoxGeometry(0.9, 0.9, 0.1),
  new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0xffcc66, emissiveIntensity: 0 })
);
raam.position.set(0, 1.3, 1.52);
huis.add(raam);

huis.position.set(5, GROUND, 2);
scene.add(huis);

const panelen = new THREE.Group();

for (let i = 0; i < 3; i++) {
  const paneel = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1.3), matPaneel);
  paneel.position.set(i * 1.3 - 1.3, 0.5, 0);
  paneel.rotation.x = -0.45;
  paneel.castShadow = true;
  panelen.add(paneel);
}

panelen.position.set(4.5, GROUND, -3.2);
scene.add(panelen);

const regenput = new THREE.Group();

const kuip = new THREE.Mesh(
  new THREE.CylinderGeometry(0.9, 0.9, 1, 20, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x8fa0b0, side: THREE.DoubleSide })
);
kuip.position.y = 0.5;
kuip.castShadow = true;
kuip.receiveShadow = true;
regenput.add(kuip);

const water = new THREE.Mesh(
  new THREE.CircleGeometry(0.86, 20),
  new THREE.MeshStandardMaterial({ color: 0x3f8fd0 })
);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.85;
regenput.add(water);

regenput.position.set(-2.2, GROUND, 3.2);
scene.add(regenput);

const zon = new THREE.Mesh(
  new THREE.SphereGeometry(1.6, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xffd24a })
);
scene.add(zon);

const wolk = new THREE.Group();
const matWolk = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 1 });

const bollen = [
  [0, 0, 0, 1.1],
  [1.2, 0.25, 0.2, 0.85],
  [-1.2, 0.15, -0.2, 0.9],
  [0.4, 0.6, -0.3, 0.7],
];
for (const [x, y, z, r] of bollen) {
  const bol = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), matWolk);
  bol.position.set(x, y, z);
  wolk.add(bol);
}
wolk.position.set(0, 9, -5);
scene.add(wolk);

const REGEN_DRUPPELS = 400;
const regenPunten = new Float32Array(REGEN_DRUPPELS * 3);

for (let i = 0; i < REGEN_DRUPPELS; i++) {
  regenPunten[i * 3 + 0] = (Math.random() - 0.5) * 16;
  regenPunten[i * 3 + 1] = GROUND + Math.random() * 11;
  regenPunten[i * 3 + 2] = (Math.random() - 0.5) * 16;
}

const regenGeo = new THREE.BufferGeometry();
regenGeo.setAttribute('position', new THREE.BufferAttribute(regenPunten, 3));

const regen = new THREE.Points(
  regenGeo,
  new THREE.PointsMaterial({ color: 0x9fd4ff, size: 0.09, transparent: true, opacity: 0.8 })
);
regen.visible = false;
scene.add(regen);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3, 0);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 50;
controls.maxPolarAngle = Math.PI / 2.05;

const el = {
  klok: document.querySelector('#klok'),
  hint: document.querySelector('#hint'),
};

const raycaster = new THREE.Raycaster();
const muis = new THREE.Vector2();

const klikbareObjecten = [];

function klikbaar(object, actie) {
  object.traverse((kind) => {
    kind.userData.actie = actie;
  });
  klikbareObjecten.push(object);
}
klikbaar(windmolen, 'wieken');
klikbaar(huis, 'lamp');
klikbaar(panelen, 'panelen');
klikbaar(regenput, 'put');
klikbaar(zon, 'dag');
klikbaar(wolk, 'regen');

const state = { wieken: true, lamp: false, panelen: true, put: true, dag: true, regen: false };

const woorden = {
  wieken: ['De wieken draaien', 'De wieken staan stil'],
  lamp: ['De lamp in het raam is aan', 'De lamp in het raam is uit'],
  panelen: ['De panelen volgen de zon', 'De panelen staan plat'],
  put: ['De regenput is vol', 'De regenput is leeg'],
  dag: ['Dag en nacht lopen door', 'Dag en nacht staan stil'],
  regen: ['Het regent', 'Het is droog'],
};

let klikX = 0;
let klikY = 0;

canvas.addEventListener('pointerdown', (event) => {
  klikX = event.clientX;
  klikY = event.clientY;
});

canvas.addEventListener('pointerup', (event) => {
  if (Math.hypot(event.clientX - klikX, event.clientY - klikY) > 5) return;

  muis.x = (event.clientX / window.innerWidth) * 2 - 1;
  muis.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(muis, camera);

  const geraakt = raycaster.intersectObjects(klikbareObjecten, true);
  if (geraakt.length === 0) return;

  const actie = geraakt[0].object.userData.actie;
  if (!actie) return;

  state[actie] = !state[actie];
  el.hint.textContent = woorden[actie][state[actie] ? 0 : 1];
});

const klok = new THREE.Clock();

let zonHoek = Math.PI / 4;

const dagKleur = new THREE.Color(0x8fc4e8);
const nachtKleur = new THREE.Color(0x0a1030);
const hemel = new THREE.Color();

function animate() {
  const dt = Math.min(klok.getDelta(), 0.1);

  if (state.dag) zonHoek += 0.12 * dt;
  const hoogte = Math.sin(zonHoek);
  zon.position.set(Math.cos(zonHoek) * 24, 1.2 + hoogte * 14, -9);

  sunLight.position.copy(zon.position);

  const dag = THREE.MathUtils.clamp(hoogte * 1.6, 0, 1);
  sunLight.intensity = 0.15 + 2 * dag;
  ambient.intensity = 0.25 + 0.4 * dag;

  hemel.copy(nachtKleur).lerp(dagKleur, dag);
  scene.background.copy(hemel);
  scene.fog.color.copy(hemel);

  if (state.wieken) rotor.rotation.z += 1.6 * dt;

  const kantel = state.panelen ? -0.25 - 0.5 * (1 - dag) : 0;
  for (const paneel of panelen.children) paneel.rotation.x = kantel;
  matPaneel.emissiveIntensity = state.panelen ? 0.4 * dag : 0;

  raam.material.emissiveIntensity = state.lamp ? 1.4 : 0;

  water.visible = state.put;

  wolk.position.x += 0.6 * dt;
  if (wolk.position.x > 16) wolk.position.x = -16;

  regen.visible = state.regen;
  if (state.regen) {
    const posities = regen.geometry.attributes.position;
    for (let i = 0; i < posities.count; i++) {
      let y = posities.getY(i) - 9 * dt;
      if (y < GROUND) y += 11;
      posities.setY(i, y);
    }
    posities.needsUpdate = true;
  }

  const uur = ((zonHoek / (Math.PI * 2)) * 24 + 6 + 24) % 24;
  el.klok.textContent = `Gesimuleerd uur: ${uur.toFixed(1)} u`;

  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);


