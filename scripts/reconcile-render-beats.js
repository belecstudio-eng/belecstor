const SOURCE_BASE_URL = process.env.SOURCE_BASE_URL || 'https://belecstorrz.onrender.com';
const TARGET_BASE_URL = process.env.TARGET_BASE_URL || 'https://belecstorz.onrender.com';

function buildBeatKey(beat) {
  return [
    String(beat.nom || '').trim().toLowerCase(),
    Number(beat.prix) || 0,
    Number(beat.bpm) || 0,
    String(beat.style || '').trim().toLowerCase(),
    String(beat.producteur || '').trim().toLowerCase()
  ].join('|');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} - ${payload.error || 'Requete invalide.'}`);
  }

  return payload;
}

async function deleteBeat(targetBaseUrl, beatId) {
  return fetchJson(`${targetBaseUrl}/api/beats/${beatId}`, {
    method: 'DELETE'
  });
}

function groupByKey(beats) {
  const groups = new Map();

  beats.forEach((beat) => {
    const key = buildBeatKey(beat);
    const current = groups.get(key) || [];
    current.push(beat);
    groups.set(key, current);
  });

  return groups;
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
  const sourceGroups = groupByKey(sourceBeats);
  const targetGroups = groupByKey(targetBeats);
  const deletes = [];

  for (const [key, beats] of targetGroups.entries()) {
    const sourceCount = (sourceGroups.get(key) || []).length;
    const desiredCount = sourceCount > 0 ? sourceCount : 1;

    if (beats.length <= desiredCount) {
      continue;
    }

    const sorted = [...beats].sort((a, b) => Number(b.id) - Number(a.id));
    const extras = sorted.slice(desiredCount);
    extras.forEach((beat) => deletes.push(beat));
  }

  console.log(`Beats source: ${sourceBeats.length}`);
  console.log(`Beats cible avant reconciliation: ${targetBeats.length}`);
  console.log(`Doublons excedentaires a supprimer: ${deletes.length}`);

  let deletedCount = 0;
  const failures = [];

  for (const beat of deletes) {
    try {
      await deleteBeat(TARGET_BASE_URL, beat.id);
      deletedCount += 1;
      console.log(`SUPPRIME ${beat.id} ${beat.nom}`);
    } catch (error) {
      failures.push(`${beat.id} ${beat.nom}: ${error.message}`);
      console.error(`ECHEC SUPPRESSION ${beat.id} ${beat.nom} -> ${error.message}`);
    }
  }

  const finalPayload = await fetchJson(`${TARGET_BASE_URL}/api/beats`);
  const finalBeats = Array.isArray(finalPayload.beats) ? finalPayload.beats : [];

  console.log(`Reconciliation terminee. Suppressions: ${deletedCount}. Echecs: ${failures.length}.`);
  console.log(`Beats cible apres reconciliation: ${finalBeats.length}`);

  if (failures.length) {
    console.log('Details echecs:');
    failures.forEach((failure) => console.log(`- ${failure}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});