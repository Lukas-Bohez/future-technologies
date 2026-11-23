const mediapipe = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const models = 'https://storage.googleapis.com/mediapipe-models/';

export async function createHandFilter(runningMode = 'IMAGE') {
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import(mediapipe + '/vision_bundle.mjs');
  const wasm = await FilesetResolver.forVisionTasks(mediapipe + '/wasm');
  const [hands, faces] = await Promise.all([
    HandLandmarker.createFromOptions(wasm, {
      runningMode, numHands: 1, minHandDetectionConfidence: 0.45,
      baseOptions: { modelAssetPath: models + 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
    }),
    FaceLandmarker.createFromOptions(wasm, {
      runningMode, numFaces: 3, minFacePresenceConfidence: 0.6,
      baseOptions: { modelAssetPath: models + 'face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
    }),
  ]);
  let lastTimestamp = -1;
  return {
    crop(source, canvas, timestamp, preview) {
      const width = source.videoWidth || source.width;
      const height = source.videoHeight || source.height;
      if (timestamp !== undefined) {
        timestamp = Math.max(timestamp, lastTimestamp + 0.1);
        lastTimestamp = timestamp;
      }
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#141b29';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const result = timestamp === undefined ? hands.detect(source) : hands.detectForVideo(source, timestamp);
      const points = result.landmarks[0];
      const hand = points && handBounds(points, width, height);
      if (!hand && !preview) return { status: points ? 'clipped' : 'no-hand' };
      const facesResult = timestamp === undefined ? faces.detect(source) : faces.detectForVideo(source, timestamp);
      const detectedFaces = facesResult.faceLandmarks.map(face => faceBounds(face, width, height));
      const visibleFaces = hand ? detectedFaces.filter(face => overlapsFace(hand, face)) : [];
      const faceOverlap = visibleFaces.some(face => points.some(point => pointInFace(point, face, width, height)));
      if (preview) drawFramingPreview(source, preview, width, height, detectedFaces, hand, faceOverlap);
      if (!hand) return { status: points ? 'clipped' : 'no-hand' };
      if (faceOverlap) return { status: 'face' };
      ctx.drawImage(source, hand.x, hand.y, hand.side, hand.side, 0, 0, canvas.width, canvas.height);
      for (const face of visibleFaces) {
        const pad = face.width * 0.1;
        ctx.fillRect((face.originX - pad - hand.x) * canvas.width / hand.side,
          (face.originY - pad - hand.y) * canvas.height / hand.side,
          (face.width + 2 * pad) * canvas.width / hand.side,
          (face.height + 2 * pad) * canvas.height / hand.side);
      }
      return { status: 'hand', points: result.worldLandmarks[0] ?? points };
    },
    close() { hands.close(); faces.close(); },
  };
}

function faceBounds(points, width, height) {
  const xs = points.map(point => point.x * width);
  const ys = points.map(point => point.y * height);
  const originX = Math.min(...xs);
  const originY = Math.min(...ys);
  return { originX, originY, width: Math.max(...xs) - originX, height: Math.max(...ys) - originY };
}

function drawFramingPreview(source, canvas, width, height, faces, hand, faceOverlap) {
  const ctx = canvas.getContext('2d');
  const scale = Math.min(canvas.width / width, canvas.height / height);
  const x = (canvas.width - width * scale) / 2;
  const y = (canvas.height - height * scale) / 2;
  ctx.fillStyle = '#141b29';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, x, y, width * scale, height * scale);
  for (const face of faces) {
    const pad = face.width * 0.15;
    ctx.fillRect(x + (face.originX - pad) * scale, y + (face.originY - pad) * scale,
      (face.width + 2 * pad) * scale, (face.height + 2 * pad) * scale);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = hand && !faceOverlap ? '#dcfa7c' : '#f5f7ff';
  ctx.setLineDash(hand && !faceOverlap ? [] : [8, 6]);
  if (hand && !faceOverlap) ctx.strokeRect(x + hand.x * scale, y + hand.y * scale, hand.side * scale, hand.side * scale);
  else ctx.strokeRect(x + width * scale * 0.18, y + height * scale * 0.33, width * scale * 0.64, height * scale * 0.59);
  ctx.setLineDash([]);
}

export function framingMessage(status) {
  if (status === 'hand') return 'Hand in beeld.';
  if (status === 'face') return 'Breng je hand naast of onder je gezicht.';
  if (status === 'clipped') return 'Zet je hele hand in het kader.';
  return 'Hou je hand in het stippelkader.';
}

export function handBounds(points, width, height) {
  const left = Math.min(...points.map(point => point.x)) * width;
  const right = Math.max(...points.map(point => point.x)) * width;
  const top = Math.min(...points.map(point => point.y)) * height;
  const bottom = Math.max(...points.map(point => point.y)) * height;
  if (left < 2 || right > width - 2 || top < 2 || bottom > height - 2) return;
  const span = Math.max(right - left, bottom - top);
  if (span < Math.min(width, height) * 0.075) return;
  const side = Math.min(Math.ceil(span * 1.30), width, height);
  const x = Math.max(0, Math.min((left + right - side) / 2, width - side));
  const y = Math.max(0, Math.min((top + bottom - side) / 2, height - side));
  return { x, y, side };
}

export function overlapsFace(hand, face) {
  const pad = face.width * 0.1;
  return hand.x < face.originX + face.width + pad && hand.x + hand.side > face.originX - pad &&
    hand.y < face.originY + face.height + pad && hand.y + hand.side > face.originY - pad;
}

export function pointInFace(point, face, width, height) {
  const pad = face.width * 0.1;
  return point.x * width >= face.originX - pad && point.x * width <= face.originX + face.width + pad &&
    point.y * height >= face.originY - pad && point.y * height <= face.originY + face.height + pad;
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)); }
function finger(points, base) {
  const [mcp, pip, dip, tip] = points.slice(base, base + 4);
  const path = distance(mcp, pip) + distance(pip, dip) + distance(dip, tip);
  return path ? distance(mcp, tip) / path : 0;
}
function ramp(value, from, to) { return Math.max(0, Math.min(1, (value - from) / (to - from))); }

function shapeFeatures(points) {
  const palm = Math.max(0.00001, distance(points[0], points[9]));
  const between = (a, b) => distance(points[a], points[b]) / palm;
  return {
    index: finger(points, 5), middle: finger(points, 9), ring: finger(points, 13), pinky: finger(points, 17),
    vGap: between(8, 12), thumbGap: between(4, 8), thumbSpread: between(4, 5),
  };
}

// These scores express similarity to a hand shape, rather than calibrated probabilities.
export function rankShapes(points) {
  const { index, middle, ring, pinky, vGap, thumbGap, thumbSpread } = shapeFeatures(points);
  const straight = value => ramp(value, 0.77, 0.92);
  const bent = value => 1 - ramp(value, 0.68, 0.88);
  const scores = [
    ['V', Math.min(straight(index), straight(middle), bent(ring), bent(pinky), ramp(vGap, 0.28, 0.54))],
    ['L', Math.min(straight(index), bent(middle), bent(ring), bent(pinky),
      ramp(thumbGap, 0.58, 0.94), ramp(thumbSpread, 0.28, 0.58))],
    ['O', Math.min(1 - ramp(vGap, 0.285, 0.42), 1 - ramp(index, 0.845, 0.95),
      1 - ramp(middle, 0.83, 0.96), 1 - ramp(thumbGap, 0.74, 0.94), ramp(thumbSpread, 0.36, 0.45))],
  ];
  const best = Math.max(...scores.map(([, score]) => score));
  scores.push(['Overig', 1 - best]);
  return scores.map(([className, probability]) => ({ className, probability }));
}
