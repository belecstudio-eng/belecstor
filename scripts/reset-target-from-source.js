const SOURCE_BASE_URL = process.env.SOURCE_BASE_URL || 'https://belecstorrz.onrender.com';
const TARGET_BASE_URL = process.env.TARGET_BASE_URL || 'https://belecstorz.onrender.com';

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} - ${payload.error || 'Requete invalide.'}`);
  }

  return payload;
}

async function downloadAsFile(url, fileName, fallbackType) {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Telechargement impossible pour ${url} (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new File([Buffer.from(arrayBuffer)], fileName, {
    type: response.headers.get('content-type') || fallbackType
  });
}

async function uploadBeat(beat) {
  const [coverFile, audioFile] = await Promise.all([
    downloadAsFile(`${SOURCE_BASE_URL}/covers/${encodeURIComponent(beat.cover)}`, beat.cover, 'image/png'),
    downloadAsFile(`${SOURCE_BASE_URL}/sons/${encodeURIComponent(beat.fichier)}`, beat.fichier, 'audio/mpeg')
  ]);

  const formData = new FormData();
  formData.append('nom', String(beat.nom || ''));
  formData.append('prix', String(Number(beat.prix) || 0));
  formData.append('bpm', String(Number(beat.bpm) || 0));
  formData.append('style', String(beat.style || ''));
  formData.append('producteur', String(beat.producteur || 'STUDIO BELEC'));
  formData.append('cover', coverFile, coverFile.name);
  formData.append('audio', audioFile, audioFile.name);

  return fetchJson(`${TARGET_BASE_URL}/api/beats`, {
    method: 'POST',
    body: formData
  });
}

async function deleteBeat(beatId) {
  return fetchJson(`${TARGET_BASE_URL}/api/beats/${beatId}`, {
    method: 'DELETE'
  });
}

async function main() {
  console.log(`Source: ${SOURCE_BASE_URL}`);
  console.log(`Target: ${TARGET_BASE_URL}`);

  const [sourcePayload, targetPayload] = await Promise.all([
    fetchJson(`${SOURCE_BASE_URL}/api/beats`),
    fetchJson(`${TARGET_BASE_URL}/api/beats`)
  ]);

  const sourceBeats = Array.isArray(sourcePayload.beats) ? sourcePayload.beats : [];
  const targetBeats = Array.isArray(targetPayload.beats) ? targetPayload.beats : [];

  console.log(`Beats source: ${sourceBeats.length}`);
  console.log(`Beats cible avant reset: ${targetBeats.length}`);

  for (const beat of targetBeats) {
    await deleteBeat(beat.id);
    console.log(`SUPPRIME ${beat.id} ${beat.nom}`);
  }

  let uploaded = 0;
  for (const [index, beat] of sourceBeats.entries()) {
    await uploadBeat(beat);
    uploaded += 1;
    console.log(`IMPORTE ${index + 1}/${sourceBeats.length} ${beat.nom}`);
  }

  const finalPayload = await fetchJson(`${TARGET_BASE_URL}/api/beats`);
  const finalBeats = Array.isArray(finalPayload.beats) ? finalPayload.beats : [];

  console.log(`Reset termine. Beats importes: ${uploaded}.`);
  console.log(`Beats cible apres reset: ${finalBeats.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});