const mediapipe = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const models = 'https://storage.googleapis.com/mediapipe-models/';

export async function createHandFilter(runningMode = 'IMAGE') {
  const { FilesetResolver, HandLandmarker, FaceDetector } = await import(mediapipe + '/vision_bundle.mjs');
  const wasm = await FilesetResolver.forVisionTasks(mediapipe + '/wasm');
  const [hands, faces] = await Promise.all([
    HandLandmarker.createFromOptions(wasm, {
      runningMode, numHands: 1, minHandDetectionConfidence: 0.45,
      baseOptions: { modelAssetPath: models + 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
    }),
    FaceDetector.createFromOptions(wasm, {
      runningMode, minDetectionConfidence: 0.4,
      baseOptions: { modelAssetPath: models + 'face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' },
    }),
  ]);
  return {
    crop(source, canvas, timestamp) {
      const width = source.videoWidth || source.width;
      const height = source.videoHeight || source.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#141b29';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const result = timestamp === undefined ? hands.detect(source) : hands.detectForVideo(source, timestamp);
      if (!result.landmarks.length) return { status: 'no-hand' };
      const points = result.landmarks[0];
      const hand = handBounds(points, width, height);
      if (!hand) return { status: 'clipped' };
      const facesResult = timestamp === undefined ? faces.detect(source) : faces.detectForVideo(source, timestamp);
      const visibleFaces = facesResult.detections.map(face => face.boundingBox).filter(face => face && overlapsFace(hand, face));
      if (visibleFaces.some(face => points.some(point => pointInFace(point, face, width, height)))) return { status: 'face' };
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
