export async function openCamera(video, facingMode) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open de lokale link op je pc of gebruik HTTPS op je smartphone.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    video.hidden = false;
  } catch {
    stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    throw new Error('De webcam kon niet starten. Controleer de cameratoestemming en sluit andere apps die de webcam gebruiken.');
  }
}

export function closeCamera(video) {
  video.srcObject?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
  video.hidden = true;
}

export function captureSquare(video, canvas) {
  const { videoWidth: width, videoHeight: height } = video;
  if (!width || video.readyState < 2) throw new Error('Wacht tot je camerabeeld verschijnt en probeer opnieuw.');
  const side = Math.min(width, height);
  canvas.getContext('2d').drawImage(video, (width - side) / 2, (height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
}
