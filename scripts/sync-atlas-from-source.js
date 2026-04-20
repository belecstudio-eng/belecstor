const { MongoClient, GridFSBucket } = require('mongodb');

const SOURCE_BASE_URL = process.env.SOURCE_BASE_URL || 'https://belecstorrz.onrender.com';
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const MONGODB_DB_NAME = String(process.env.MONGODB_DB_NAME || 'studio-belec').trim() || 'studio-belec';
const IMPORT_MEDIA = String(process.env.IMPORT_MEDIA || '1').trim() !== '0';

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI est obligatoire pour synchroniser Atlas.');
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} - ${payload.error || 'Requete invalide.'}`);
  }

  return payload;
}

async function fetchBuffer(url) {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Telechargement impossible pour ${url} (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || ''
  };
}

function normalizeBeat(rawBeat) {
  return {
    id: Number(rawBeat.id),
    nom: String(rawBeat.nom || '').trim(),
    prix: Number(rawBeat.prix) || 0,
    fichier: String(rawBeat.fichier || '').trim(),
    cover: String(rawBeat.cover || '').trim(),
    bpm: Number(rawBeat.bpm) || 0,
    style: String(rawBeat.style || '').trim(),
    producteur: String(rawBeat.producteur || 'STUDIO BELEC').trim(),
    downloads: Number(rawBeat.downloads || 0)
  };
}

function assignUniqueIds(beats) {
  const total = beats.length;

  return beats.map((beat, index) => ({
    ...beat,
    id: total - index
  }));
}

function assertUniqueIds(beats) {
  const seenIds = new Set();

  beats.forEach((beat) => {
    if (!Number.isInteger(beat.id) || beat.id <= 0) {
      throw new Error(`ID invalide detecte pour le beat ${beat.nom || 'sans nom'}: ${beat.id}`);
    }

    if (seenIds.has(beat.id)) {
      throw new Error(`ID duplique detecte apres reassignment: ${beat.id}`);
    }

    seenIds.add(beat.id);
  });
}

async function clearBucket(db, bucketName) {
  for (const collectionName of [`${bucketName}.files`, `${bucketName}.chunks`]) {
    try {
      await db.collection(collectionName).drop();
    } catch (error) {
      if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) {
        throw error;
      }
    }
  }
}

async function recreateBeatIndex(beatsCollection) {
  try {
    await beatsCollection.drop();
  } catch (error) {
    if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) {
      throw error;
    }
  }

  await beatsCollection.createIndex({ id: 1 }, { unique: true });
}

async function uploadBuffer(bucket, fileName, payload) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(fileName, {
      contentType: payload.contentType || undefined,
      metadata: {
        syncedAt: new Date().toISOString(),
        source: SOURCE_BASE_URL
      }
    });

    uploadStream.on('error', reject);
    uploadStream.on('finish', resolve);
    uploadStream.end(payload.buffer);
  });
}

async function main() {
  console.log(`Source: ${SOURCE_BASE_URL}`);
  console.log(`Atlas DB: ${MONGODB_DB_NAME}`);

  const sourcePayload = await fetchJson(`${SOURCE_BASE_URL}/api/beats`);
  const rawSourceBeats = Array.isArray(sourcePayload.beats) ? sourcePayload.beats.map(normalizeBeat) : [];
  const sourceBeats = assignUniqueIds(rawSourceBeats);
  const duplicateSourceIds = rawSourceBeats.length - new Set(rawSourceBeats.map((beat) => beat.id)).size;
  assertUniqueIds(sourceBeats);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db(MONGODB_DB_NAME);
    const beatsCollection = db.collection('beats');
    const coversBucket = new GridFSBucket(db, { bucketName: 'covers' });
    const sonsBucket = new GridFSBucket(db, { bucketName: 'sons' });

    const existingCount = await beatsCollection.countDocuments();
    console.log(`Beats cible avant sync: ${existingCount}`);
    console.log(`Beats source: ${sourceBeats.length}`);
    console.log(`IDs source dupliques detectes: ${duplicateSourceIds}`);
    console.log(`Import medias: ${IMPORT_MEDIA ? 'oui' : 'non'}`);

    await recreateBeatIndex(beatsCollection);
    if (IMPORT_MEDIA) {
      await clearBucket(db, 'covers');
      await clearBucket(db, 'sons');
    }

    const uniqueCoverNames = [...new Set(sourceBeats.map((beat) => beat.cover).filter(Boolean))];
    const uniqueAudioNames = [...new Set(sourceBeats.map((beat) => beat.fichier).filter(Boolean))];

    console.log(`Covers uniques a importer: ${uniqueCoverNames.length}`);
    console.log(`Audios uniques a importer: ${uniqueAudioNames.length}`);

    if (IMPORT_MEDIA) {
      for (const coverName of uniqueCoverNames) {
        const payload = await fetchBuffer(`${SOURCE_BASE_URL}/covers/${encodeURIComponent(coverName)}`);
        await uploadBuffer(coversBucket, coverName, payload);
        console.log(`COVER OK ${coverName}`);
      }

      for (const audioName of uniqueAudioNames) {
        const payload = await fetchBuffer(`${SOURCE_BASE_URL}/sons/${encodeURIComponent(audioName)}`);
        await uploadBuffer(sonsBucket, audioName, payload);
        console.log(`AUDIO OK ${audioName}`);
      }
    }

    if (sourceBeats.length) {
      for (const beat of sourceBeats) {
        await beatsCollection.insertOne(beat);
      }
    }

    const finalCount = await beatsCollection.countDocuments();
    console.log(`Sync terminee. Beats cible apres sync: ${finalCount}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});