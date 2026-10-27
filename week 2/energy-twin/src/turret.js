import * as THREE from 'three';

// =====================================================================
// DE BOOM-KANON
// Opbouw (elk blok is een THREE.Group dat zijn kinderen meeneemt):
//   platform (vast, in het midden)
//     yawGroup    draait links/rechts (pijltjes ← →), de camera zit hier ook in
//       pitchGroup  kantelt omhoog/omlaag (pijltjes ↑ ↓): loop, stammetje en bladerkroon
// De camera staat vast achter de boom en draait mee. Er is geen vrije camerabeweging meer.
// Spatiebalk (of schermknop) schiet een blad af. Een blad stopt bij het EERSTE ding op zijn pad
// (boef, romp, eiland, molen of zee): schoten doorboren niets.
// =====================================================================
const YAW_SPEED = 1.8; // rad/s als je een pijltje ingedrukt houdt
const PITCH_SPEED = 1.0;
const PITCH_MIN = -0.4;
const PITCH_MAX = 0.6;
const BULLET_SPEED = 45;
const MAX_RANGE = 110;
const FIRE_COOLDOWN = 0.3;
const ASSIST_ANGLE = 0.09; // rad (±5°): richthulp, een boef zo dicht bij het kruisje wordt automatisch geraakt

export function createTurret({ scene, camera, game }) {
  // --- platform -------------------------------------------------------
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 1, 40), new THREE.MeshStandardMaterial({ color: 0x8a6d4b }));
  platform.position.y = 0.5;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(5.1, 0.08, 8, 64), new THREE.MeshStandardMaterial({ color: 0x555555 }));
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 1.4;
  scene.add(rail);

  // --- yaw (draaien) ---------------------------------------------------
  const yawGroup = new THREE.Group();
  yawGroup.position.y = 1; // bovenkant van het platform
  scene.add(yawGroup);

  // --- pitch (kantelen): jouw boom ------------------------------------
  const pitchGroup = new THREE.Group();
  pitchGroup.position.y = 0.9;
  yawGroup.add(pitchGroup);

  // Jouw zwarte cilinder ligt nu horizontaal als loop (cilinders staan standaard rechtop; 90° kantelen = naar voren).
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -1.2);
  barrel.castShadow = true;
  pitchGroup.add(barrel);
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x5b3a1e }));
  stump.position.set(0, -0.25, 0.5);
  stump.castShadow = true;
  pitchGroup.add(stump);
  const crown = new THREE.Group(); // bladerkroon: een paar groene bollen, laag genoeg om het kruisje vrij te laten
  for (const [x, y, z, r] of [[0, 0.1, 0.6, 0.45], [-0.4, -0.05, 0.7, 0.35], [0.4, -0.05, 0.7, 0.35], [0, -0.05, 0.4, 0.3]]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshStandardMaterial({ color: 0x2e8b2e }));
    leaf.position.set(x, y, z);
    leaf.castShadow = true;
    crown.add(leaf);
  }
  pitchGroup.add(crown);

  // De camera zit vast in yawGroup, achter en boven de boom ("over de schouder"), en kijkt mee omhoog/omlaag.
  camera.position.set(0, 2.2, 3.8);
  camera.rotation.set(0, 0, 0);
  yawGroup.add(camera);

  // --- invoer ----------------------------------------------------------
  const keys = { left: false, right: false, up: false, down: false, fire: false };
  const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Space: 'fire' };
  function setKey(e, down) {
    const k = KEYMAP[e.code];
    if (!k) return;
    // Niet storen als je in een invoerveld typt.
    if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
    if (e.target instanceof HTMLInputElement && e.target.type === 'password') return;
    e.preventDefault(); // geen scrollen, en geen sliders of knoppen bedienen met de pijltjes en de spatiebalk
    if (down && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    keys[k] = down;
  }
  window.addEventListener('keydown', (e) => setKey(e, true));
  window.addEventListener('keyup', (e) => setKey(e, false));

  // Schermknoppen (touch of geen toetsenbord): houd ingedrukt.
  function bindHold(selector, key) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.addEventListener('pointerdown', () => (keys[key] = true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => (keys[key] = false));
  }
  bindHold('#btnLeft', 'left');
  bindHold('#btnRight', 'right');
  bindHold('#btnUp', 'up');
  bindHold('#btnDown', 'down');
  bindHold('#btnFire', 'fire');

  // --- bladeren (kogels en spoor) --------------------------------------
  // Een blad is een afgeplatte octaëder. Eén geometry en een paar materialen worden door alle bladeren gedeeld.
  const leafGeo = new THREE.OctahedronGeometry(0.12).scale(1, 0.25, 1.6);
  const leafMats = [0x2e8b2e, 0x3fae3f, 0x7bc043, 0x9acd32].map((c) => new THREE.MeshStandardMaterial({ color: c }));
  const bullets = []; // bladeren die vliegen
  const trail = []; // bladeren die achterblijven en vallen (de bullet trail)

  function spawnTrailLeaf(pos, size = 1) {
    if (trail.length > 500) scene.remove(trail.shift().mesh); // niet eindeloos groeien
    const mesh = new THREE.Mesh(leafGeo, leafMats[Math.floor(Math.random() * leafMats.length)]);
    mesh.position.copy(pos);
    mesh.position.x += (Math.random() - 0.5) * 0.25;
    mesh.position.y += (Math.random() - 0.5) * 0.25;
    mesh.position.z += (Math.random() - 0.5) * 0.25;
    mesh.scale.setScalar(size * (0.6 + Math.random() * 0.6));
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    scene.add(mesh);
    trail.push({ mesh, life: 0.9, drift: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2), spin: (Math.random() - 0.5) * 8 });
  }

  // --- richten en schieten ----------------------------------------------
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let cooldown = 0;
  let recoil = 0;
  let yawVel = 0;
  let pitch = 0;

  // Wat zit er onder het kruisje? 'villain' (raak!), 'avoid' (niet raken!) of 'none'.
  function aimKind() {
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    for (let d = 2; d < 80; d += 1) {
      tmp.copy(camDir).multiplyScalar(d).add(camPos);
      const hit = game.findHit(tmp);
      if (!hit) continue;
      if (hit.type !== 'target') return 'none';
      return hit.obj.userData.kind === 'villain' ? 'villain' : 'avoid';
    }
    return 'none';
  }

  function fire() {
    if (!game.state.playing || cooldown > 0) return;
    cooldown = FIRE_COOLDOWN;
    recoil = 0.3;
    pitchGroup.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    muzzle.set(0, 0, -2.9);
    pitchGroup.localToWorld(muzzle); // voorkant van de loop

    // Richtpunt = waar het kruisje naar wijst; met richthulp: de dichtstbijzijnde boef binnen ±5° van het kruisje.
    aimPoint.copy(camDir).multiplyScalar(60).add(camPos);
    let best = ASSIST_ANGLE;
    for (const v of game.liveVillains()) {
      v.getWorldPosition(tmp);
      tmp.y += 0.8; // midden van het lijf
      const toTarget = tmp.clone().sub(camPos);
      const angle = camDir.angleTo(toTarget);
      if (angle < best) {
        best = angle;
        aimPoint.copy(tmp);
      }
    }
    const dir = aimPoint.clone().sub(muzzle).normalize();

    const mesh = new THREE.Mesh(leafGeo, leafMats[1]);
    mesh.scale.setScalar(2.4);
    mesh.position.copy(muzzle);
    scene.add(mesh);
    bullets.push({ mesh, vel: dir.multiplyScalar(BULLET_SPEED), travelled: 0 });
    for (let i = 0; i < 6; i++) spawnTrailLeaf(muzzle, 1.2); // mondingsvuur van bladeren
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      // Kleine stapjes (max 0,3 eenheden) zodat een snel blad niet dwars door een doel kan vliegen.
      const steps = Math.ceil((BULLET_SPEED * dt) / 0.3);
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        b.mesh.position.addScaledVector(b.vel, dt / steps);
        b.travelled += (BULLET_SPEED * dt) / steps;
        spawnTrailLeaf(b.mesh.position);
        const hit = game.findHit(b.mesh.position);
        if (hit) {
          if (hit.type === 'target') game.registerHit(hit.obj);
          for (let k = 0; k < 10; k++) spawnTrailLeaf(b.mesh.position, 1.5); // bladerenexplosie
          done = true;
        } else if (b.travelled > MAX_RANGE) {
          done = true;
        }
      }
      b.mesh.rotation.z += dt * 20;
      if (done) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
      }
    }
    // De achtergebleven bladeren draaien, vallen en krimpen tot ze verdwijnen.
    for (let i = trail.length - 1; i >= 0; i--) {
      const l = trail[i];
      l.life -= dt;
      l.mesh.position.y -= dt * 1.4;
      l.mesh.position.addScaledVector(l.drift, dt);
      l.mesh.rotation.x += l.spin * dt;
      l.mesh.scale.multiplyScalar(1 - dt * 1.3);
      if (l.life <= 0) {
        scene.remove(l.mesh);
        trail.splice(i, 1);
      }
    }
  }

  function update(dt, inXR = false) {
    // Draaien met zachte versnelling (geen ruk): de snelheid loopt naar de gewenste snelheid toe.
    const wantYaw = ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * YAW_SPEED; // links = tegen de klok in
    yawVel += (wantYaw - yawVel) * Math.min(1, dt * 10);
    yawGroup.rotation.y += yawVel * dt;
    if (inXR) {
      pitch = 0; // in VR bepaalt je hoofd de kijkrichting
    } else {
      pitch = THREE.MathUtils.clamp(pitch + ((keys.up ? 1 : 0) - (keys.down ? 1 : 0)) * PITCH_SPEED * dt, PITCH_MIN, PITCH_MAX);
      camera.rotation.x = pitch;
    }
    pitchGroup.rotation.x = pitch;

    cooldown -= dt;
    recoil = Math.max(0, recoil - dt * 2);
    barrel.position.z = -1.2 + recoil; // terugslag: de loop schuift even naar achteren
    if (keys.fire) fire();
    updateBullets(dt);
  }

  return {
    yawGroup,
    keys,
    fire,
    update,
    aimKind,
    get yaw() {
      return yawGroup.rotation.y;
    },
    get pitch() {
      return pitch;
    },
  };
}
