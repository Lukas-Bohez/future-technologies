import { labels, TRAINING_MINIMUM } from './quest.mjs';
import { loadLibraries } from './model.mjs';

const localHeaders = { 'X-Handquest-Local': 'training' };

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
  const [tm, manifest] = await Promise.all([
    loadLibraries(),
    fetch('/api/training', { headers: localHeaders, signal }).then(checked).then(response => response.json()),
  ]);
  signal.throwIfAborted();
  const model = await tm.createTeachable({ modelName: 'Handgebaarquest', labels });
  model.setLabels(labels);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 224;
  const ctx = canvas.getContext('2d');
  for (const [index, label] of labels.entries()) {
    const all = manifest.files[label];
    if (all.length < TRAINING_MINIMUM) throw new Error('Te weinig trainingsfoto’s voor ' + label + '.');
    const files = Array.from({ length: TRAINING_MINIMUM }, (_, sample) =>
      all[Math.floor(sample * (all.length - 1) / (TRAINING_MINIMUM - 1))]);
    for (const [position, file] of files.entries()) {
      signal.throwIfAborted();
      report('Foto’s lezen · ' + label + ' ' + (position + 1) + '/' + TRAINING_MINIMUM);
      const url = '/api/training/photo?' + new URLSearchParams({ label, file });
      const photo = await fetch(url, { headers: localHeaders, signal }).then(checked).then(response => response.blob());
      const image = await createImageBitmap(photo);
      try {
        const crop = Math.min(image.width, image.height);
        ctx.drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop, 0, 0, 224, 224);
        await model.addExample(index, canvas);
      } finally {
        image.close();
        ctx.clearRect(0, 0, 224, 224);
      }
    }
  }
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
            metadata: model.getMetadata(),
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
