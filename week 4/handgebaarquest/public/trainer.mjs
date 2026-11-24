import { labels, TRAINING_MINIMUM } from './quest.mjs';
import { loadLibraries } from './model.mjs';
import { createHandFilter } from './hands.mjs';

const localHeaders = { 'X-Handquest-Local': 'training' };

export async function readTrainingPhotos(visit, signal) {
  const manifest = await fetch('/api/training', { headers: localHeaders, signal }).then(checked).then(response => response.json());
  for (const [index, label] of labels.entries()) {
    const files = manifest.files[label];
    for (const [position, file] of files.entries()) {
      signal?.throwIfAborted();
      const url = '/api/training/photo?' + new URLSearchParams({ label, file });
      const photo = await fetch(url, { headers: localHeaders, signal }).then(checked).then(response => response.blob());
      const image = await createImageBitmap(photo);
      try {
        if (await visit({ label, index, file, position, count: files.length, image }) === false) break;
      } finally {
        image.close();
      }
    }
  }
}

async function checked(response) {
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'De lokale trainingsserver reageert niet.');
  return response;
}

function asBase64(data) {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export async function trainLocal(report, signal) {
  report('Mobiel startmodel en trainingslijst laden…');
  const [tm, filter] = await Promise.all([loadLibraries(), createHandFilter()]);
  signal.throwIfAborted();
  const model = await tm.createTeachable({ modelName: 'Handgebaarquest', labels });
  model.setLabels(labels);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 224;
  const accepted = Object.fromEntries(labels.map(label => [label, 0]));
  try {
    await readTrainingPhotos(async ({ label, index, file, position, count, image }) => {
      report('Handfilter · ' + label + ' ' + (position + 1) + '/' + count);
      const alreadyCropped = file.startsWith('hand-');
      if (alreadyCropped) canvas.getContext('2d').drawImage(image, 0, 0, 224, 224);
      if (alreadyCropped || filter.crop(image, canvas).status === 'hand') {
        await model.addExample(index, canvas);
        accepted[label]++;
        if (accepted[label] >= TRAINING_MINIMUM) return false;
      }
    }, signal);
  } finally {
    filter.close();
  }
  const missing = labels.filter(label => accepted[label] < TRAINING_MINIMUM);
  if (missing.length) throw new Error('Te weinig foto’s met vrije hand en zonder gezicht: ' +
    missing.map(label => label + ' ' + accepted[label] + '/' + TRAINING_MINIMUM).join(', ') + '. Maak extra foto’s.');
  signal.throwIfAborted();
  const epochs = 35;
  report('Model trainen…');
  await model.train({ denseUnits: 64, epochs, learningRate: 0.001, batchSize: 16 }, {
    onEpochEnd(epoch) {
      report('Model trainen · ronde ' + (epoch + 1) + '/' + epochs);
      if (signal.aborted) void model.stopTraining();
    },
  });
  try {
    signal.throwIfAborted();
    report('TensorFlow.js-model opslaan…');
    let folder;
    await model.save({
      async save(artifacts) {
        const response = await checked(await fetch('/api/training', {
          method: 'POST',
          headers: { ...localHeaders, 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            topology: artifacts.modelTopology,
            specs: artifacts.weightSpecs,
            weights: asBase64(artifacts.weightData),
            metadata: { ...model.getMetadata(), userMetadata: { preprocessing: 'hand-crop-v1' } },
          }),
        }));
        ({ folder } = await response.json());
        return { modelArtifactsInfo: globalThis.tf.io.getModelArtifactsInfoForJSON(artifacts) };
      },
    });
    return folder;
  } finally {
    model.dispose();
  }
}
