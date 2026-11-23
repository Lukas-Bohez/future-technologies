import { labels } from './quest.mjs';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('De modelbibliotheek kon niet laden. Controleer je internet.'));
    };
    document.head.append(script);
  });
}

export async function loadLibraries() {
  if (!globalThis.tf) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js');
  if (!globalThis.tmImage) await loadScript('https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.3/dist/teachablemachine-image.min.js');
  return globalThis.tmImage;
}

export async function loadModel() {
  const resources = await Promise.all(['model.json', 'metadata.json'].map(name =>
    fetch('./model/' + name, { method: 'HEAD', cache: 'no-store' })));
  if (resources.some(result => !result.ok)) {
    throw new Error('Je model ontbreekt. Plaats de TensorFlow.js-export in public/model.');
  }
  await loadLibraries();
  try {
    const candidate = await globalThis.tmImage.load('./model/model.json', './model/metadata.json');
    const available = candidate.getClassLabels().map(label => label.trim().toLowerCase());
    if (available.length !== labels.length || !labels.every(label => available.includes(label.toLowerCase()))) {
      throw new Error('Andere labels');
    }
    return candidate;
  } catch {
    throw new Error('Controleer of de export compleet is en V, O, L en Overig als labels gebruikt.');
  }
}
