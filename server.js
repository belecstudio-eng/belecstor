require('dotenv').config();

const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, GridFSBucket } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_DIR = __dirname;
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || APP_DIR);
const APP_DATA_FILE = path.join(APP_DIR, 'data.json');
const APP_CARTS_FILE = path.join(APP_DIR, 'carts.json');
const APP_ORDERS_FILE = path.join(APP_DIR, 'orders.json');
const APP_BRANDING_FILE = path.join(APP_DIR, 'branding.json');
const APP_COVERS_DIR = path.join(APP_DIR, 'covers');
const APP_AUDIO_DIR = path.join(APP_DIR, 'sons');
const APP_BRANDING_DIR = path.join(APP_DIR, 'branding');
const DATA_FILE = path.join(STORAGE_DIR, 'data.json');
const CARTS_FILE = path.join(STORAGE_DIR, 'carts.json');
const ORDERS_FILE = path.join(STORAGE_DIR, 'orders.json');
const BRANDING_FILE = path.join(STORAGE_DIR, 'branding.json');
const COVERS_DIR = path.join(STORAGE_DIR, 'covers');
const AUDIO_DIR = path.join(STORAGE_DIR, 'sons');
const BRANDING_DIR = path.join(STORAGE_DIR, 'branding');
const CART_COOKIE_NAME = 'mesprods_cart';
const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONTACT_OWNER_EMAIL = process.env.CONTACT_OWNER_EMAIL || 'belecstudio@gmail.com';
const CONTACT_SMTP_USER = process.env.CONTACT_SMTP_USER || '';
const CONTACT_SMTP_PASS = process.env.CONTACT_SMTP_PASS || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const MONGODB_DB_NAME = String(process.env.MONGODB_DB_NAME || '').trim() || 'studio-belec';
const STORAGE_BACKEND = String(process.env.STORAGE_BACKEND || (MONGODB_URI ? 'mongodb' : 'filesystem')).trim().toLowerCase() || 'filesystem';
const USE_MONGODB = STORAGE_BACKEND === 'mongodb';
const PAYMENT_DEPOSIT_NUMBER = process.env.PAYMENT_DEPOSIT_NUMBER || '0575335641';
const ORDER_DEPOSIT_EMAIL_DELAY_MS = Number.isFinite(Number(process.env.ORDER_DEPOSIT_EMAIL_DELAY_MS))
  ? Number(process.env.ORDER_DEPOSIT_EMAIL_DELAY_MS)
  : 60 * 1000;
const ORDER_PAYMENT_INSTRUCTIONS_EMAIL_DELAY_MS = Number.isFinite(Number(process.env.ORDER_PAYMENT_INSTRUCTIONS_EMAIL_DELAY_MS))
  ? Number(process.env.ORDER_PAYMENT_INSTRUCTIONS_EMAIL_DELAY_MS)
  : 60 * 1000;
const orderCustomerEmailTimers = new Map();
let mongoClientPromise = null;
let mongoClient = null;
let mongoDb = null;
let mongoCollections = null;
let mongoBuckets = null;

app.disable('etag');

function getContactTransporter() {
  if (!CONTACT_SMTP_USER || !CONTACT_SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: CONTACT_SMTP_USER,
      pass: CONTACT_SMTP_PASS
    }
  });
}

function isAdminProtectionEnabled() {
  return Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);
}

function readBasicAuth(headerValue) {
  if (!headerValue || !headerValue.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = Buffer.from(headerValue.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch (error) {
    return null;
  }
}

function requireAdminAuth(req, res, next) {
  if (!isAdminProtectionEnabled()) {
    next();
    return;
  }

  const credentials = readBasicAuth(req.headers.authorization);
  const isValid = credentials
    && credentials.username === ADMIN_USERNAME
    && credentials.password === ADMIN_PASSWORD;

  if (isValid) {
    next();
    return;
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="STUDIO BELEC Admin"');
  res.status(401).send('Authentification admin requise.');
}

function handleUploadError(error, req, res, next) {
  if (!error) {
    next();
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Fichier trop volumineux.' });
      return;
    }

    res.status(400).json({ error: 'Televersement invalide.' });
    return;
  }

  if (error.code === 'INVALID_FILE_TYPE') {
    res.status(400).json({ error: error.message || 'Type de fichier invalide.' });
    return;
  }

  next(error);
}

function escapeEmailHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getBrandingEmailAttachment() {
  const branding = await readBranding();
  const logoName = String(branding?.logo || '').trim();

  if (!logoName) {
    return null;
  }

  if (USE_MONGODB) {
    const file = await readGridFsFileBuffer('branding', logoName);

    if (!file) {
      return null;
    }

    return {
      filename: file.filename,
      content: file.buffer,
      contentType: file.contentType,
      cid: 'belec-studio-logo'
    };
  }

  const logoPath = path.join(BRANDING_DIR, logoName);

  try {
    await fsp.access(logoPath, fs.constants.F_OK);
    return {
      filename: logoName,
      path: logoPath,
      cid: 'belec-studio-logo'
    };
  } catch (error) {
    return null;
  }
}

function renderBrandedEmailHtml({ subject, text, logoCid }) {
  const safeSubject = escapeEmailHtml(subject);
  const safeText = escapeEmailHtml(text).replace(/\n/g, '<br>');
  const logoMarkup = logoCid
    ? `<img src="cid:${logoCid}" alt="BELEC STUDIO" style="max-width:180px;width:100%;height:auto;display:block;margin:0 auto 20px;">`
    : '<div style="font-size:28px;font-weight:800;letter-spacing:0.08em;margin-bottom:20px;">BELEC STUDIO</div>';

  return `
    <div style="margin:0;padding:24px;background:#f4f1eb;font-family:Arial,sans-serif;color:#161616;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px 28px;box-shadow:0 18px 48px rgba(0,0,0,0.08);">
        <div style="text-align:center;">${logoMarkup}</div>
        <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#b86e42;margin-bottom:10px;">Email Gmail</div>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;">${safeSubject}</h1>
        <div style="font-size:15px;line-height:1.75;color:#343434;white-space:normal;">${safeText}</div>
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #ece4d9;font-size:13px;line-height:1.7;color:#7b6d5e;">
          Message provenant de BELEC STUDIO
        </div>
      </div>
    </div>
  `;
}

async function buildBrandedEmailOptions({ from, to, replyTo, subject, text }) {
  const attachment = await getBrandingEmailAttachment();

  return {
    from,
    to,
    replyTo,
    subject,
    text,
    html: renderBrandedEmailHtml({
      subject,
      text,
      logoCid: attachment?.cid || ''
    }),
    attachments: attachment ? [attachment] : []
  };
}

async function sendContactEmail({ name, email, message }) {
  const transporter = getContactTransporter();

  if (!transporter) {
    const error = new Error('Email contact non configure.');
    error.code = 'CONTACT_EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const subject = `BELEC STUDIO | Nouveau message contact - ${name}`;
  const text = [
    'NOUVEAU MESSAGE DE CONTACT',
    '',
    `Nom: ${name}`,
    `Email: ${email}`,
    '',
    'Message:',
    message,
    '',
    `Date: ${new Date().toLocaleString('fr-FR')}`
  ].join('\n');

  const mailOptions = await buildBrandedEmailOptions({
    from: `"STUDIO BELEC Contact" <${CONTACT_SMTP_USER}>`,
    to: CONTACT_OWNER_EMAIL,
    replyTo: email,
    subject,
    text
  });

  await transporter.sendMail(mailOptions);
}

function formatPrice(amount) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(Number(amount) || 0);
}

function formatPaymentMethod(method) {
  if (method === 'wave') {
    return 'Wave';
  }

  if (method === 'taptapsend') {
    return 'TapTapSend';
  }

  return String(method || 'Non renseigne').trim() || 'Non renseigne';
}

function normalizeOrderItem(rawItem) {
  return {
    beatId: Number(rawItem?.beatId) || null,
    beatName: String(rawItem?.beatName || '').trim(),
    licenseKey: String(rawItem?.licenseKey || '').trim(),
    licenseName: String(rawItem?.licenseName || '').trim(),
    deliveryFiles: Array.isArray(rawItem?.deliveryFiles)
      ? rawItem.deliveryFiles.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    deliveryContract: String(rawItem?.deliveryContract || '').trim(),
    unitPrice: Number(rawItem?.unitPrice) || 0,
    quantity: Math.max(1, Number(rawItem?.quantity) || 1)
  };
}

function getOrderItemCount(items) {
  return items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity) || 1), 0);
}

function buildOrderEmailText(order) {
  const lines = [
    'NOUVELLE COMMANDE BEATS',
    '',
    `Commande: ${order.id}`,
    `Date: ${new Date(order.createdAt).toLocaleString('fr-FR')}`,
    `Statut: ${order.status}`,
    '',
    'CLIENT',
    `Nom: ${order.fullName}`,
    `Email: ${order.email}`,
    '',
    'COMMANDE',
    `Nombre de prods: ${order.itemCount}`,
    `Montant total: ${formatPrice(order.totalPrice)}`,
    `Paiement: ${formatPaymentMethod(order.paymentMethod)}`,
    ''
  ];

  order.items.forEach((item, index) => {
    lines.push(`PROD ${index + 1}`);
    lines.push(`Beat: ${item.beatName || 'Non renseigne'}`);
    lines.push(`Licence: ${item.licenseName || 'Non renseignee'}`);
    lines.push(`Quantite: ${item.quantity}`);
    lines.push(`Montant ligne: ${formatPrice((Number(item.unitPrice) || 0) * item.quantity)}`);
    lines.push(`Fichiers a livrer: ${item.deliveryFiles.length ? item.deliveryFiles.join(', ') : 'Non renseignes'}`);

    if (item.deliveryContract) {
      lines.push('Contrat a delivrer:');
      lines.push(item.deliveryContract);
    }

    lines.push('');
  });

  lines.push('Action: verifier le paiement puis livrer les fichiers et le contrat correspondants.');
  return lines.join('\n');
}

async function sendOrderEmail(order) {
  const transporter = getContactTransporter();

  if (!transporter) {
    return {
      emailStatus: 'not-configured',
      emailSentAt: '',
      emailError: 'Ajoutez CONTACT_SMTP_USER et CONTACT_SMTP_PASS pour recevoir les commandes par email.'
    };
  }

  try {
    const subject = `BELEC STUDIO | Nouvelle commande ${order.fullName} - ${order.itemCount} prod(s)`;
    const text = buildOrderEmailText(order);
    const mailOptions = await buildBrandedEmailOptions({
      from: `"STUDIO BELEC Checkout" <${CONTACT_SMTP_USER}>`,
      to: CONTACT_OWNER_EMAIL,
      replyTo: order.email,
      subject,
      text
    });

    await transporter.sendMail(mailOptions);

    return {
      emailStatus: 'sent',
      emailSentAt: new Date().toISOString(),
      emailError: ''
    };
  } catch (error) {
    return {
      emailStatus: 'failed',
      emailSentAt: '',
      emailError: error.message || 'Erreur inconnue lors de l envoi email.'
    };
  }
}

function buildCustomerEmailEntry(status = 'pending', scheduledFor = '', sentAt = '', error = '') {
  return {
    status: String(status || 'pending').trim() || 'pending',
    scheduledFor: String(scheduledFor || '').trim(),
    sentAt: String(sentAt || '').trim(),
    error: String(error || '').trim()
  };
}

function getOrderCreatedTimestamp(createdAt) {
  const timestamp = Date.parse(String(createdAt || '').trim());
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function buildScheduledCustomerEmailState(createdAt) {
  const baseTimestamp = getOrderCreatedTimestamp(createdAt);

  return {
    depositNumber: buildCustomerEmailEntry(
      'scheduled',
      new Date(baseTimestamp + ORDER_DEPOSIT_EMAIL_DELAY_MS).toISOString()
    ),
    paymentInstructions: buildCustomerEmailEntry(
      'scheduled',
      new Date(baseTimestamp + ORDER_PAYMENT_INSTRUCTIONS_EMAIL_DELAY_MS).toISOString()
    ),
    contract: buildCustomerEmailEntry('pending')
  };
}

function buildLegacyCustomerEmailState() {
  return {
    depositNumber: buildCustomerEmailEntry('not-scheduled'),
    paymentInstructions: buildCustomerEmailEntry('not-scheduled'),
    contract: buildCustomerEmailEntry('pending')
  };
}

function normalizeCustomerEmailEntry(rawEntry, fallbackEntry) {
  const fallback = buildCustomerEmailEntry(
    fallbackEntry?.status,
    fallbackEntry?.scheduledFor,
    fallbackEntry?.sentAt,
    fallbackEntry?.error
  );

  if (!rawEntry || typeof rawEntry !== 'object') {
    return fallback;
  }

  return buildCustomerEmailEntry(
    rawEntry.status || fallback.status,
    rawEntry.scheduledFor || fallback.scheduledFor,
    rawEntry.sentAt || fallback.sentAt,
    rawEntry.error || fallback.error
  );
}

function normalizeOrderNotification(rawNotification) {
  return {
    emailStatus: String(rawNotification?.emailStatus || 'pending').trim() || 'pending',
    emailSentAt: String(rawNotification?.emailSentAt || '').trim(),
    emailError: String(rawNotification?.emailError || '').trim()
  };
}

function normalizeStoredOrder(rawOrder) {
  const items = Array.isArray(rawOrder?.items)
    ? rawOrder.items.map(normalizeOrderItem).filter((item) => item.beatName && item.licenseName)
    : [];
  const createdAt = String(rawOrder?.createdAt || '').trim() || new Date().toISOString();
  const customerEmailFallbacks = rawOrder?.customerEmails
    ? buildScheduledCustomerEmailState(createdAt)
    : buildLegacyCustomerEmailState();

  return {
    id: String(rawOrder?.id || crypto.randomUUID()).trim(),
    fullName: String(rawOrder?.fullName || '').trim(),
    email: String(rawOrder?.email || '').trim(),
    paymentMethod: String(rawOrder?.paymentMethod || '').trim(),
    totalPrice: Number(rawOrder?.totalPrice) || 0,
    itemCount: Math.max(1, Number(rawOrder?.itemCount) || getOrderItemCount(items) || 1),
    status: String(rawOrder?.status || 'pending-payment').trim() || 'pending-payment',
    createdAt,
    items,
    notification: normalizeOrderNotification(rawOrder?.notification),
    customerEmails: {
      depositNumber: normalizeCustomerEmailEntry(rawOrder?.customerEmails?.depositNumber, customerEmailFallbacks.depositNumber),
      paymentInstructions: normalizeCustomerEmailEntry(rawOrder?.customerEmails?.paymentInstructions, customerEmailFallbacks.paymentInstructions),
      contract: normalizeCustomerEmailEntry(rawOrder?.customerEmails?.contract, customerEmailFallbacks.contract)
    }
  };
}

function getPaymentAppName(method) {
  return method === 'wave' ? 'Wave' : 'TapTapSend';
}

function buildOrderCustomerRecapLines(order) {
  const lines = [];

  order.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.beatName || 'Beat'} - ${item.licenseName || 'Licence'} - ${formatPrice((Number(item.unitPrice) || 0) * item.quantity)}`);
  });

  return lines.length ? lines : ['1. Commande en attente de detail.'];
}

function buildDepositNumberEmailText(order) {
  return [
    `Bonjour ${order.fullName || 'Client'},`,
    '',
    'Votre commande STUDIO BELEC a bien ete enregistree.',
    '',
    `Commande: ${order.id}`,
    `Application choisie: ${getPaymentAppName(order.paymentMethod)}`,
    `Montant a regler: ${formatPrice(order.totalPrice)}`,
    '',
    'Numero de depot a utiliser :',
    PAYMENT_DEPOSIT_NUMBER,
    '',
    'Gardez une capture d ecran apres votre paiement.',
    '',
    'STUDIO BELEC'
  ].join('\n');
}

function buildPaymentInstructionsEmailText(order) {
  return [
    `Bonjour ${order.fullName || 'Client'},`,
    '',
    'Voici les instructions pour finaliser votre paiement.',
    '',
    `Application: ${getPaymentAppName(order.paymentMethod)}`,
    'Pays a choisir: Cote d Ivoire',
    `Montant exact a payer: ${formatPrice(order.totalPrice)}`,
    `Numero de depot: ${PAYMENT_DEPOSIT_NUMBER}`,
    '',
    'Etapes a suivre :',
    `1. Ouvrez ${getPaymentAppName(order.paymentMethod)}. Si vous ne l avez pas, telechargez l application puis connectez-vous.`,
    '2. Choisissez la Cote d Ivoire.',
    `3. Entrez exactement ${formatPrice(order.totalPrice)}.`,
    `4. Effectuez le depot sur le numero ${PAYMENT_DEPOSIT_NUMBER}.`,
    '5. Faites une capture d ecran pour garder la preuve.',
    '',
    'Recap commande :',
    ...buildOrderCustomerRecapLines(order),
    '',
    'STUDIO BELEC'
  ].join('\n');
}

function buildContractEmailText(order) {
  const lines = [
    `Bonjour ${order.fullName || 'Client'},`,
    '',
    'Voici votre recap de licence et le contrat correspondant a votre commande.',
    '',
    `Commande: ${order.id}`,
    `Montant total: ${formatPrice(order.totalPrice)}`,
    ''
  ];

  order.items.forEach((item, index) => {
    lines.push(`PROD ${index + 1}`);
    lines.push(`Beat: ${item.beatName || 'Non renseigne'}`);
    lines.push(`Licence: ${item.licenseName || 'Non renseignee'}`);
    lines.push(`Livraison: ${item.deliveryFiles.length ? item.deliveryFiles.join(', ') : 'Non renseignee'}`);

    if (item.deliveryContract) {
      lines.push('Contrat:');
      lines.push(item.deliveryContract);
    } else {
      lines.push('Contrat: le studio vous transmet le cadre de licence associe a cette commande.');
    }

    lines.push('');
  });

  lines.push('Merci pour votre commande.');
  lines.push('STUDIO BELEC');
  return lines.join('\n');
}

async function sendManagedCustomerEmail({ to, subject, text }) {
  const transporter = getContactTransporter();

  if (!transporter) {
    return buildCustomerEmailEntry(
      'not-configured',
      '',
      '',
      'Ajoutez CONTACT_SMTP_USER et CONTACT_SMTP_PASS pour envoyer les emails clients.'
    );
  }

  try {
    const mailOptions = await buildBrandedEmailOptions({
      from: `"STUDIO BELEC" <${CONTACT_SMTP_USER}>`,
      to,
      replyTo: CONTACT_OWNER_EMAIL,
      subject,
      text
    });

    await transporter.sendMail(mailOptions);

    return buildCustomerEmailEntry('sent', '', new Date().toISOString(), '');
  } catch (error) {
    return buildCustomerEmailEntry('failed', '', '', error.message || 'Erreur inconnue lors de l envoi client.');
  }
}

function sendDepositNumberEmail(order) {
  return sendManagedCustomerEmail({
    to: order.email,
    subject: `BELEC STUDIO | Numero de depot - commande ${order.id}`,
    text: buildDepositNumberEmailText(order)
  });
}

function sendPaymentInstructionsEmail(order) {
  return sendManagedCustomerEmail({
    to: order.email,
    subject: `BELEC STUDIO | Instructions de paiement - commande ${order.id}`,
    text: buildPaymentInstructionsEmailText(order)
  });
}

function sendContractEmail(order) {
  return sendManagedCustomerEmail({
    to: order.email,
    subject: `BELEC STUDIO | Contrat et recap licence - commande ${order.id}`,
    text: buildContractEmailText(order)
  });
}

const DEFAULT_DATA = {
  beats: []
};

const DEFAULT_CARTS = {
  carts: {}
};

const DEFAULT_ORDERS = {
  orders: []
};

const DEFAULT_BRANDING = {
  logo: '',
  updatedAt: ''
};

function buildStoredFileName(originalFileName) {
  const originalName = path.parse(String(originalFileName || 'fichier'));
  const safeName = sanitizeSegment(originalName.name);
  const extension = (originalName.ext || '').toLowerCase();
  return `${Date.now()}-${safeName}${extension}`;
}

function getMimeTypeForFileName(fileName) {
  const extension = path.extname(String(fileName || '')).toLowerCase();

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  if (extension === '.mp3') {
    return 'audio/mpeg';
  }

  if (extension === '.wav') {
    return 'audio/wav';
  }

  return 'application/octet-stream';
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function collectionHasDocuments(collection) {
  const entry = await collection.findOne({}, { projection: { _id: 1 } });
  return Boolean(entry);
}

function getGridFsFilesCollection(bucketName) {
  return mongoDb.collection(`${bucketName}.files`);
}

async function gridFsBucketHasFiles(bucketName) {
  const entry = await getGridFsFilesCollection(bucketName).findOne({}, { projection: { _id: 1 } });
  return Boolean(entry);
}

async function uploadBufferToGridFs(bucketName, buffer, filename, contentType, originalName) {
  await connectMongo();

  return new Promise((resolve, reject) => {
    const bucket = mongoBuckets[bucketName];
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: contentType || getMimeTypeForFileName(filename),
      metadata: {
        originalName: String(originalName || filename).trim() || filename,
        uploadedAt: new Date().toISOString()
      }
    });

    uploadStream.on('error', reject);
    uploadStream.on('finish', () => {
      resolve({
        id: uploadStream.id,
        filename
      });
    });

    uploadStream.end(buffer);
  });
}

async function saveUploadedFileToGridFs(bucketName, file, forcedFileName = '') {
  const targetFileName = forcedFileName || buildStoredFileName(file?.originalname);

  return uploadBufferToGridFs(
    bucketName,
    file?.buffer || Buffer.alloc(0),
    targetFileName,
    file?.mimetype || getMimeTypeForFileName(targetFileName),
    file?.originalname || targetFileName
  );
}

async function findLatestGridFsFile(bucketName, fileName) {
  await connectMongo();

  return getGridFsFilesCollection(bucketName)
    .find({ filename: String(fileName || '').trim() })
    .sort({ uploadDate: -1 })
    .limit(1)
    .next();
}

async function readGridFsFileBuffer(bucketName, fileName) {
  const file = await findLatestGridFsFile(bucketName, fileName);

  if (!file) {
    return null;
  }

  const buffer = await streamToBuffer(mongoBuckets[bucketName].openDownloadStream(file._id));
  return {
    buffer,
    filename: file.filename,
    contentType: file.contentType || getMimeTypeForFileName(file.filename),
    length: file.length
  };
}

async function deleteGridFsFileByName(bucketName, fileName) {
  await connectMongo();

  const files = await getGridFsFilesCollection(bucketName)
    .find({ filename: String(fileName || '').trim() })
    .toArray();

  if (!files.length) {
    return false;
  }

  await Promise.all(files.map((file) => mongoBuckets[bucketName].delete(file._id)));
  return true;
}

async function sendGridFsFile(bucketName, fileName, res) {
  const file = await findLatestGridFsFile(bucketName, fileName);

  if (!file) {
    res.status(404).send('Fichier introuvable.');
    return;
  }

  res.setHeader('Content-Type', file.contentType || getMimeTypeForFileName(file.filename));
  res.setHeader('Content-Length', String(file.length || 0));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  const stream = mongoBuckets[bucketName].openDownloadStream(file._id);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).send('Impossible de lire le fichier.');
    } else {
      res.end();
    }
  });
  stream.pipe(res);
}

async function listGridFsMediaFiles(bucketName, type, fieldName, beats) {
  await connectMongo();

  const files = await getGridFsFilesCollection(bucketName)
    .find({})
    .sort({ filename: 1 })
    .toArray();

  return files.map((file) => ({
    name: file.filename,
    type,
    size: Number(file.length) || 0,
    url: `/${type}/${encodeURIComponent(file.filename)}`,
    usedBy: beats.filter((beat) => beat[fieldName] === file.filename).map((beat) => beat.id)
  }));
}

async function loadJsonSeedFile(sourceFile, fallbackValue) {
  if (!(await pathExists(sourceFile))) {
    return fallbackValue;
  }

  try {
    const content = await fsp.readFile(sourceFile, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return fallbackValue;
  }
}

async function seedMongoBeats() {
  if (await collectionHasDocuments(mongoCollections.beats)) {
    return;
  }

  const source = await loadJsonSeedFile(APP_DATA_FILE, DEFAULT_DATA);
  const beats = Array.isArray(source?.beats) ? source.beats.map(normalizeBeat) : [];

  if (beats.length) {
    await mongoCollections.beats.insertMany(beats);
  }
}

async function seedMongoCarts() {
  if (await collectionHasDocuments(mongoCollections.carts)) {
    return;
  }

  const source = pruneExpiredCarts(await loadJsonSeedFile(APP_CARTS_FILE, DEFAULT_CARTS));
  const cartEntries = Object.entries(source.carts || {}).map(([cartId, entry]) => ({
    _id: cartId,
    items: normalizeCartItems(entry?.items),
    updatedAt: String(entry?.updatedAt || new Date().toISOString()).trim() || new Date().toISOString()
  }));

  if (cartEntries.length) {
    await mongoCollections.carts.insertMany(cartEntries);
  }
}

async function seedMongoOrders() {
  if (await collectionHasDocuments(mongoCollections.orders)) {
    return;
  }

  const source = await loadJsonSeedFile(APP_ORDERS_FILE, DEFAULT_ORDERS);
  const orders = Array.isArray(source?.orders) ? source.orders.map(normalizeStoredOrder) : [];

  if (orders.length) {
    await mongoCollections.orders.insertMany(orders);
  }
}

async function seedMongoBranding() {
  const currentBranding = await mongoCollections.settings.findOne({ _id: 'branding' });
  if (currentBranding) {
    return;
  }

  const source = await loadJsonSeedFile(APP_BRANDING_FILE, DEFAULT_BRANDING);
  await mongoCollections.settings.updateOne(
    { _id: 'branding' },
    {
      $set: {
        logo: String(source?.logo || '').trim(),
        updatedAt: String(source?.updatedAt || '').trim()
      }
    },
    { upsert: true }
  );
}

async function seedMongoBucketFromDirectory(bucketName, sourceDir) {
  if (await gridFsBucketHasFiles(bucketName)) {
    return;
  }

  if (!(await pathExists(sourceDir))) {
    return;
  }

  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const buffer = await fsp.readFile(sourcePath);
    await uploadBufferToGridFs(
      bucketName,
      buffer,
      entry.name,
      getMimeTypeForFileName(entry.name),
      entry.name
    );
  }
}

async function seedMongoStorage() {
  await seedMongoBeats();
  await seedMongoCarts();
  await seedMongoOrders();
  await seedMongoBranding();
  await seedMongoBucketFromDirectory('covers', APP_COVERS_DIR);
  await seedMongoBucketFromDirectory('sons', APP_AUDIO_DIR);
  await seedMongoBucketFromDirectory('branding', APP_BRANDING_DIR);
}

async function connectMongo() {
  if (!USE_MONGODB) {
    return null;
  }

  if (mongoDb) {
    return mongoDb;
  }

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI est obligatoire quand STORAGE_BACKEND=mongodb.');
  }

  if (!mongoClientPromise) {
    mongoClientPromise = (async () => {
      mongoClient = new MongoClient(MONGODB_URI);
      await mongoClient.connect();
      mongoDb = mongoClient.db(MONGODB_DB_NAME);
      mongoCollections = {
        beats: mongoDb.collection('beats'),
        carts: mongoDb.collection('carts'),
        orders: mongoDb.collection('orders'),
        settings: mongoDb.collection('settings')
      };
      mongoBuckets = {
        covers: new GridFSBucket(mongoDb, { bucketName: 'covers' }),
        sons: new GridFSBucket(mongoDb, { bucketName: 'sons' }),
        branding: new GridFSBucket(mongoDb, { bucketName: 'branding' })
      };

      await mongoCollections.beats.createIndex({ id: 1 }, { unique: true });
      await mongoCollections.orders.createIndex({ id: 1 }, { unique: true });
      await mongoCollections.carts.createIndex({ updatedAt: 1 });
      await seedMongoStorage();
      return mongoDb;
    })().catch((error) => {
      mongoClientPromise = null;
      throw error;
    });
  }

  return mongoClientPromise;
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function directoryHasEntries(dirPath) {
  try {
    const entries = await fsp.readdir(dirPath);
    return entries.length > 0;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function copyDirectoryContents(sourceDir, targetDir) {
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await fsp.mkdir(targetPath, { recursive: true });
      await copyDirectoryContents(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile() && !(await pathExists(targetPath))) {
      await fsp.copyFile(sourcePath, targetPath);
    }
  }
}

async function seedJsonFile(sourceFile, targetFile, defaultValue, writer) {
  if (await pathExists(targetFile)) {
    return;
  }

  if (path.resolve(sourceFile) !== path.resolve(targetFile) && await pathExists(sourceFile)) {
    await fsp.copyFile(sourceFile, targetFile);
    return;
  }

  await writer(defaultValue);
}

async function seedDirectory(sourceDir, targetDir) {
  if (path.resolve(sourceDir) === path.resolve(targetDir)) {
    return;
  }

  if (await directoryHasEntries(targetDir)) {
    return;
  }

  if (!(await pathExists(sourceDir)) || !(await directoryHasEntries(sourceDir))) {
    return;
  }

  await copyDirectoryContents(sourceDir, targetDir);
}

function sanitizeSegment(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'fichier';
}

function normalizeBeat(rawBeat) {
  const prix = Number(rawBeat.prix);
  const bpm = Number(rawBeat.bpm);
  const downloads = Number(rawBeat.downloads || 0);

  return {
    id: Number(rawBeat.id),
    nom: String(rawBeat.nom || '').trim(),
    prix: Number.isFinite(prix) ? prix : 0,
    fichier: String(rawBeat.fichier || '').trim(),
    cover: String(rawBeat.cover || '').trim(),
    bpm: Number.isFinite(bpm) ? bpm : 0,
    style: String(rawBeat.style || '').trim(),
    producteur: String(rawBeat.producteur || 'STUDIO BELEC').trim(),
    downloads: Number.isFinite(downloads) ? downloads : 0
  };
}

async function ensureStorage() {
  if (USE_MONGODB) {
    await connectMongo();
    return;
  }

  await fsp.mkdir(STORAGE_DIR, { recursive: true });
  await fsp.mkdir(COVERS_DIR, { recursive: true });
  await fsp.mkdir(AUDIO_DIR, { recursive: true });
  await fsp.mkdir(BRANDING_DIR, { recursive: true });

  await seedJsonFile(APP_DATA_FILE, DATA_FILE, DEFAULT_DATA, writeData);
  await seedJsonFile(APP_CARTS_FILE, CARTS_FILE, DEFAULT_CARTS, writeCartStore);
  await seedJsonFile(APP_ORDERS_FILE, ORDERS_FILE, DEFAULT_ORDERS, writeOrders);
  await seedJsonFile(APP_BRANDING_FILE, BRANDING_FILE, DEFAULT_BRANDING, writeBranding);
  await seedDirectory(APP_COVERS_DIR, COVERS_DIR);
  await seedDirectory(APP_AUDIO_DIR, AUDIO_DIR);
  await seedDirectory(APP_BRANDING_DIR, BRANDING_DIR);
}

async function readData() {
  await ensureStorage();

  if (USE_MONGODB) {
    const beats = await mongoCollections.beats.find({}).sort({ id: 1 }).toArray();
    return {
      beats: beats.map(normalizeBeat)
    };
  }

  try {
    const content = await fsp.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(content);
    const beats = Array.isArray(parsed.beats) ? parsed.beats.map(normalizeBeat) : [];
    return { beats };
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeData(DEFAULT_DATA);
      return { ...DEFAULT_DATA };
    }

    throw error;
  }
}

async function writeData(data) {
  const payload = {
    beats: Array.isArray(data.beats) ? data.beats.map(normalizeBeat) : []
  };

  if (USE_MONGODB) {
    await ensureStorage();
    await mongoCollections.beats.deleteMany({});

    if (payload.beats.length) {
      await mongoCollections.beats.insertMany(payload.beats);
    }

    return;
  }

  await fsp.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

async function readBranding() {
  await ensureStorage();

  if (USE_MONGODB) {
    const branding = await mongoCollections.settings.findOne({ _id: 'branding' });

    return {
      logo: String(branding?.logo || '').trim(),
      updatedAt: String(branding?.updatedAt || '').trim()
    };
  }

  try {
    const content = await fsp.readFile(BRANDING_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return {
      logo: String(parsed?.logo || '').trim(),
      updatedAt: String(parsed?.updatedAt || '').trim()
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeBranding(DEFAULT_BRANDING);
      return { ...DEFAULT_BRANDING };
    }

    throw error;
  }
}

async function writeBranding(branding) {
  const payload = {
    logo: String(branding?.logo || '').trim(),
    updatedAt: String(branding?.updatedAt || '').trim()
  };

  if (USE_MONGODB) {
    await ensureStorage();
    await mongoCollections.settings.updateOne(
      { _id: 'branding' },
      { $set: payload },
      { upsert: true }
    );
    return;
  }

  await fsp.writeFile(BRANDING_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function normalizeLicense(rawLicense) {
  return {
    name: String(rawLicense?.name || '').trim(),
    description: String(rawLicense?.description || '').trim(),
    priceSupplement: Number(rawLicense?.priceSupplement) || 0,
    totalPrice: Number(rawLicense?.totalPrice) || 0,
    icon: String(rawLicense?.icon || '').trim()
  };
}

function normalizeCartItem(rawItem) {
  const beatId = Number(rawItem?.beatId);
  if (!Number.isFinite(beatId)) {
    return null;
  }

  const beat = rawItem?.beat ? normalizeBeat(rawItem.beat) : null;
  if (!beat || !beat.nom) {
    return null;
  }

  const license = normalizeLicense(rawItem.license);

  return {
    beatId,
    beat,
    licenseKey: String(rawItem?.licenseKey || 'wav').trim() || 'wav',
    license,
    quantity: Math.max(1, Number(rawItem?.quantity) || 1),
    totalPrice: Number(rawItem?.totalPrice) || license.totalPrice || 0
  };
}

function normalizeCartItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const uniqueItems = new Map();

  items.forEach((item) => {
    const normalized = normalizeCartItem(item);
    if (!normalized) {
      return;
    }

    const key = `${normalized.beatId}:${normalized.licenseKey}`;
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, normalized);
    }
  });

  return Array.from(uniqueItems.values());
}

function pruneExpiredCarts(store) {
  const nextStore = {
    carts: { ...(store?.carts || {}) }
  };
  const now = Date.now();

  Object.entries(nextStore.carts).forEach(([cartId, entry]) => {
    const updatedAt = Date.parse(entry?.updatedAt || '');
    if (!Number.isFinite(updatedAt) || now - updatedAt > CART_TTL_MS) {
      delete nextStore.carts[cartId];
    }
  });

  return nextStore;
}

async function readCartStore() {
  await ensureStorage();

  if (USE_MONGODB) {
    const cartDocs = await mongoCollections.carts.find({}).toArray();
    const store = pruneExpiredCarts({
      carts: cartDocs.reduce((accumulator, entry) => {
        accumulator[entry._id] = {
          items: normalizeCartItems(entry?.items),
          updatedAt: String(entry?.updatedAt || '').trim()
        };
        return accumulator;
      }, {})
    });

    if (Object.keys(store.carts).length !== cartDocs.length) {
      await writeCartStore(store);
    }

    return store;
  }

  try {
    const content = await fsp.readFile(CARTS_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return pruneExpiredCarts(parsed);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeCartStore(DEFAULT_CARTS);
      return { ...DEFAULT_CARTS };
    }

    throw error;
  }
}

async function writeCartStore(store) {
  const prunedStore = pruneExpiredCarts(store);

  if (USE_MONGODB) {
    await ensureStorage();
    const entries = Object.entries(prunedStore.carts || {}).map(([cartId, entry]) => ({
      _id: cartId,
      items: normalizeCartItems(entry?.items),
      updatedAt: String(entry?.updatedAt || '').trim() || new Date().toISOString()
    }));

    await mongoCollections.carts.deleteMany({});

    if (entries.length) {
      await mongoCollections.carts.insertMany(entries);
    }

    return;
  }

  await fsp.writeFile(CARTS_FILE, JSON.stringify(prunedStore, null, 2), 'utf8');
}

async function readOrders() {
  await ensureStorage();

  if (USE_MONGODB) {
    const orders = await mongoCollections.orders.find({}).sort({ createdAt: -1 }).toArray();
    return {
      orders: orders.map(normalizeStoredOrder)
    };
  }

  try {
    const content = await fsp.readFile(ORDERS_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders.map(normalizeStoredOrder) : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeOrders(DEFAULT_ORDERS);
      return { ...DEFAULT_ORDERS };
    }

    throw error;
  }
}

async function writeOrders(store) {
  const payload = {
    orders: Array.isArray(store?.orders) ? store.orders.map(normalizeStoredOrder) : []
  };

  if (USE_MONGODB) {
    await ensureStorage();
    await mongoCollections.orders.deleteMany({});

    if (payload.orders.length) {
      await mongoCollections.orders.insertMany(payload.orders);
    }

    return;
  }

  await fsp.writeFile(ORDERS_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function clearOrderCustomerEmailTimer(orderId, emailKey) {
  const timers = orderCustomerEmailTimers.get(orderId);
  if (!timers || !timers[emailKey]) {
    return;
  }

  clearTimeout(timers[emailKey]);
  delete timers[emailKey];

  if (!Object.keys(timers).length) {
    orderCustomerEmailTimers.delete(orderId);
  }
}

function clearOrderCustomerEmailTimers(orderId) {
  const timers = orderCustomerEmailTimers.get(orderId);
  if (!timers) {
    return;
  }

  Object.values(timers).forEach((timerId) => clearTimeout(timerId));
  orderCustomerEmailTimers.delete(orderId);
}

function scheduleOrderCustomerEmail(orderId, emailKey, scheduledFor) {
  const scheduledTimestamp = Date.parse(String(scheduledFor || '').trim());
  if (!Number.isFinite(scheduledTimestamp)) {
    return;
  }

  clearOrderCustomerEmailTimer(orderId, emailKey);

  const delay = Math.max(0, scheduledTimestamp - Date.now());
  const timers = orderCustomerEmailTimers.get(orderId) || {};

  timers[emailKey] = setTimeout(() => {
    processScheduledOrderCustomerEmail(orderId, emailKey).catch((error) => {
      console.error(`Impossible de traiter l email client ${emailKey} pour ${orderId}.`, error);
    });
  }, delay);

  orderCustomerEmailTimers.set(orderId, timers);
}

async function processScheduledOrderCustomerEmail(orderId, emailKey) {
  clearOrderCustomerEmailTimer(orderId, emailKey);

  const store = await readOrders();
  const orderIndex = store.orders.findIndex((order) => order.id === orderId);
  if (orderIndex === -1) {
    return;
  }

  const order = store.orders[orderIndex];
  const entry = order.customerEmails?.[emailKey];

  if (!entry || entry.status !== 'scheduled') {
    return;
  }

  const scheduledTimestamp = Date.parse(entry.scheduledFor || '');
  if (Number.isFinite(scheduledTimestamp) && scheduledTimestamp > Date.now() + 500) {
    scheduleOrderCustomerEmail(orderId, emailKey, entry.scheduledFor);
    return;
  }

  let result = buildCustomerEmailEntry('failed', '', '', 'Type d email client inconnu.');

  if (emailKey === 'depositNumber') {
    result = await sendDepositNumberEmail(order);
  }

  if (emailKey === 'paymentInstructions') {
    result = await sendPaymentInstructionsEmail(order);
  }

  order.customerEmails[emailKey] = {
    ...entry,
    status: result.status,
    sentAt: result.sentAt,
    error: result.error
  };

  store.orders[orderIndex] = normalizeStoredOrder(order);
  await writeOrders(store);
}

function scheduleOrderCustomerEmails(order) {
  if (!order?.id || !order.customerEmails) {
    return;
  }

  ['depositNumber', 'paymentInstructions'].forEach((emailKey) => {
    const entry = order.customerEmails[emailKey];
    if (!entry || entry.status !== 'scheduled' || !entry.scheduledFor) {
      return;
    }

    scheduleOrderCustomerEmail(order.id, emailKey, entry.scheduledFor);
  });
}

async function restoreOrderCustomerEmailSchedules() {
  const store = await readOrders();
  store.orders.forEach((order) => {
    scheduleOrderCustomerEmails(order);
  });
}

function parseCookies(headerValue) {
  return String(headerValue || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setCartCookie(res, req, cartId) {
  const cookieParts = [
    `${CART_COOKIE_NAME}=${encodeURIComponent(cartId)}`,
    'Path=/',
    `Max-Age=${Math.floor(CART_TTL_MS / 1000)}`,
    'SameSite=Lax'
  ];

  if (isSecureRequest(req)) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function getOrCreateCartId(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const existingCartId = cookies[CART_COOKIE_NAME];

  if (existingCartId && /^[a-f0-9-]{16,}$/i.test(existingCartId)) {
    return existingCartId;
  }

  const cartId = crypto.randomUUID();
  setCartCookie(res, req, cartId);
  return cartId;
}

function getNextBeatId(beats) {
  return beats.reduce((maxId, beat) => Math.max(maxId, Number(beat.id) || 0), 0) + 1;
}

async function deleteFileIfUnused(fileName, folderPath, fieldName, beats, bucketName = '') {
  if (!fileName) {
    return false;
  }

  const stillUsed = beats.some((beat) => beat[fieldName] === fileName);
  if (stillUsed) {
    return false;
  }

  if (USE_MONGODB) {
    return deleteGridFsFileByName(bucketName, fileName);
  }

  const filePath = path.join(folderPath, fileName);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  await fsp.unlink(filePath);
  return true;
}

function cleanupUploadedFiles(files) {
  if (USE_MONGODB) {
    return Promise.resolve();
  }

  if (!files) {
    return Promise.resolve();
  }

  const pendingDeletes = Object.values(files)
    .flat()
    .map((file) => fsp.unlink(file.path).catch(() => undefined));

  return Promise.all(pendingDeletes);
}

const storage = USE_MONGODB ? multer.memoryStorage() : multer.diskStorage({
  destination(req, file, callback) {
    if (file.fieldname === 'cover') {
      callback(null, COVERS_DIR);
      return;
    }

    callback(null, AUDIO_DIR);
  },
  filename(req, file, callback) {
    callback(null, buildStoredFileName(file.originalname));
  }
});

function fileFilter(req, file, callback) {
  const extension = path.extname(file.originalname).toLowerCase();
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const audioExtensions = ['.mp3', '.wav'];

  if (file.fieldname === 'cover') {
    if (!imageExtensions.includes(extension)) {
      const error = new Error('La cover doit etre en jpg, jpeg, png ou webp.');
      error.code = 'INVALID_FILE_TYPE';
      callback(error);
      return;
    }

    callback(null, true);
    return;
  }

  if (file.fieldname === 'audio') {
    if (!audioExtensions.includes(extension)) {
      const error = new Error('Le son doit etre en mp3 ou wav.');
      error.code = 'INVALID_FILE_TYPE';
      callback(error);
      return;
    }

    callback(null, true);
    return;
  }

  const error = new Error('Champ de televersement inconnu.');
  error.code = 'INVALID_FILE_TYPE';
  callback(error);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

const brandingStorage = USE_MONGODB ? multer.memoryStorage() : multer.diskStorage({
  destination(req, file, callback) {
    callback(null, BRANDING_DIR);
  },
  filename(req, file, callback) {
    callback(null, buildStoredFileName(file.originalname));
  }
});

const brandingUpload = multer({
  storage: brandingStorage,
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, ['.jpg', '.jpeg', '.png', '.webp'].includes(extension));
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/favicon.ico', (req, res) => {
  res.redirect(302, '/favicon.svg');
});
app.get('/admin.html', requireAdminAuth);
app.get('/admin-orders.html', requireAdminAuth);
app.use('/api/media', requireAdminAuth);
app.use('/api/branding/logo', requireAdminAuth);
app.get('/data.json', async (req, res) => {
  try {
    await ensureStorage();

    if (USE_MONGODB) {
      res.json(await readData());
      return;
    }

    res.sendFile(DATA_FILE);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lire data.json.' });
  }
});

if (USE_MONGODB) {
  app.get('/covers/:filename', async (req, res) => {
    try {
      await sendGridFsFile('covers', path.basename(req.params.filename), res);
    } catch (error) {
      res.status(500).send('Impossible de lire la cover.');
    }
  });

  app.get('/sons/:filename', async (req, res) => {
    try {
      await sendGridFsFile('sons', path.basename(req.params.filename), res);
    } catch (error) {
      res.status(500).send('Impossible de lire le son.');
    }
  });

  app.get('/branding/:filename', async (req, res) => {
    try {
      await sendGridFsFile('branding', path.basename(req.params.filename), res);
    } catch (error) {
      res.status(500).send('Impossible de lire le logo.');
    }
  });
} else {
  app.use('/covers', express.static(COVERS_DIR));
  app.use('/sons', express.static(AUDIO_DIR));
  app.use('/branding', express.static(BRANDING_DIR));
}

app.use(express.static(APP_DIR, {
  setHeaders(res, filePath) {
    if (/\.(html|css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  }
}));

app.get('/api/beats', async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lire les beats.' });
  }
});

app.get('/api/branding', async (req, res) => {
  try {
    const branding = await readBranding();
    const logoUrl = branding.logo
      ? `/branding/${encodeURIComponent(branding.logo)}${branding.updatedAt ? `?v=${encodeURIComponent(branding.updatedAt)}` : ''}`
      : '';

    res.json({
      logo: branding.logo,
      logoUrl,
      updatedAt: branding.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lire le logo.' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Nom, email et message sont obligatoires.' });
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      res.status(400).json({ error: 'Adresse email invalide.' });
      return;
    }

    await sendContactEmail({ name, email, message });
    res.json({ message: 'Message envoye avec succes.' });
  } catch (error) {
    if (error.code === 'CONTACT_EMAIL_NOT_CONFIGURED') {
      res.status(503).json({
        error: 'Le serveur email n est pas configure. Ajoutez CONTACT_SMTP_USER et CONTACT_SMTP_PASS.'
      });
      return;
    }

    if (error.code === 'EAUTH' || error.responseCode === 535) {
      res.status(503).json({
        error: 'Gmail refuse l authentification. Verifiez CONTACT_SMTP_USER et le mot de passe d application Gmail.'
      });
      return;
    }

    res.status(500).json({ error: 'Impossible d envoyer le message pour le moment.' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim();
    const paymentMethod = String(req.body?.paymentMethod || '').trim();
    const items = Array.isArray(req.body?.items) ? req.body.items.map(normalizeOrderItem) : [];
    const totalPrice = Number(req.body?.totalPrice);

    if (!fullName || !email || !paymentMethod || !items.length || !Number.isFinite(totalPrice)) {
      res.status(400).json({ error: 'Commande incomplète.' });
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      res.status(400).json({ error: 'Adresse email invalide.' });
      return;
    }

    const validItems = items.filter((item) => item.beatName && item.licenseName);
    if (!validItems.length) {
      res.status(400).json({ error: 'Aucune prod valide dans la commande.' });
      return;
    }

    const orderStore = await readOrders();
    const createdAt = new Date().toISOString();
    const order = {
      id: crypto.randomUUID(),
      fullName,
      email,
      paymentMethod,
      totalPrice,
      itemCount: getOrderItemCount(validItems),
      status: 'pending-payment',
      createdAt,
      items: validItems,
      notification: {
        emailStatus: 'pending',
        emailSentAt: '',
        emailError: ''
      },
      customerEmails: buildScheduledCustomerEmailState(createdAt)
    };

    order.notification = await sendOrderEmail(order);
    orderStore.orders.unshift(order);
    await writeOrders(orderStore);
    scheduleOrderCustomerEmails(order);

    const responsePayload = {
      message: 'Commande enregistrée.',
      orderId: order.id,
      emailStatus: order.notification.emailStatus
    };

    if (order.notification.emailStatus !== 'sent' && order.notification.emailError) {
      responsePayload.warning = order.notification.emailError;
    }

    res.status(201).json(responsePayload);
  } catch (error) {
    res.status(500).json({ error: 'Impossible d enregistrer la commande.' });
  }
});

app.get('/api/orders', requireAdminAuth, async (req, res) => {
  try {
    const store = await readOrders();
    res.json(store);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lire les commandes.' });
  }
});

app.post('/api/orders/:orderId/send-deposit-number', requireAdminAuth, async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || '').trim();
    if (!orderId) {
      res.status(400).json({ error: 'Identifiant de commande manquant.' });
      return;
    }

    const store = await readOrders();
    const orderIndex = store.orders.findIndex((order) => order.id === orderId);

    if (orderIndex === -1) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }

    const order = store.orders[orderIndex];
    clearOrderCustomerEmailTimer(orderId, 'depositNumber');
    const result = await sendDepositNumberEmail(order);

    order.customerEmails.depositNumber = {
      ...order.customerEmails.depositNumber,
      status: result.status,
      scheduledFor: '',
      sentAt: result.sentAt,
      error: result.error
    };

    store.orders[orderIndex] = normalizeStoredOrder(order);
    await writeOrders(store);

    if (result.status !== 'sent') {
      const statusCode = result.status === 'not-configured' ? 503 : 500;
      res.status(statusCode).json({
        error: result.error || 'Impossible d envoyer le numero de depot.'
      });
      return;
    }

    res.json({ message: 'Numero de depot envoye par Gmail au client.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible d envoyer le numero de depot.' });
  }
});

app.post('/api/orders/:orderId/send-payment-instructions', requireAdminAuth, async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || '').trim();
    if (!orderId) {
      res.status(400).json({ error: 'Identifiant de commande manquant.' });
      return;
    }

    const store = await readOrders();
    const orderIndex = store.orders.findIndex((order) => order.id === orderId);

    if (orderIndex === -1) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }

    const order = store.orders[orderIndex];
    clearOrderCustomerEmailTimer(orderId, 'paymentInstructions');
    const result = await sendPaymentInstructionsEmail(order);

    order.customerEmails.paymentInstructions = {
      ...order.customerEmails.paymentInstructions,
      status: result.status,
      scheduledFor: '',
      sentAt: result.sentAt,
      error: result.error
    };

    store.orders[orderIndex] = normalizeStoredOrder(order);
    await writeOrders(store);

    if (result.status !== 'sent') {
      const statusCode = result.status === 'not-configured' ? 503 : 500;
      res.status(statusCode).json({
        error: result.error || 'Impossible d envoyer les consignes de paiement.'
      });
      return;
    }

    res.json({ message: 'Consignes de paiement envoyees par Gmail au client.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible d envoyer les consignes de paiement.' });
  }
});

app.post('/api/orders/:orderId/send-all', requireAdminAuth, async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || '').trim();
    if (!orderId) {
      res.status(400).json({ error: 'Identifiant de commande manquant.' });
      return;
    }

    const store = await readOrders();
    const orderIndex = store.orders.findIndex((order) => order.id === orderId);

    if (orderIndex === -1) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }

    const order = store.orders[orderIndex];
    clearOrderCustomerEmailTimer(orderId, 'depositNumber');
    clearOrderCustomerEmailTimer(orderId, 'paymentInstructions');

    const depositResult = await sendDepositNumberEmail(order);
    order.customerEmails.depositNumber = {
      ...order.customerEmails.depositNumber,
      status: depositResult.status,
      scheduledFor: '',
      sentAt: depositResult.sentAt,
      error: depositResult.error
    };

    const instructionsResult = await sendPaymentInstructionsEmail(order);
    order.customerEmails.paymentInstructions = {
      ...order.customerEmails.paymentInstructions,
      status: instructionsResult.status,
      scheduledFor: '',
      sentAt: instructionsResult.sentAt,
      error: instructionsResult.error
    };

    const contractResult = await sendContractEmail(order);
    order.customerEmails.contract = {
      ...order.customerEmails.contract,
      status: contractResult.status,
      sentAt: contractResult.sentAt,
      error: contractResult.error
    };

    store.orders[orderIndex] = normalizeStoredOrder(order);
    await writeOrders(store);

    const results = [depositResult, instructionsResult, contractResult];
    const hasFailure = results.some((result) => result.status !== 'sent');

    if (hasFailure) {
      const errorMessages = [
        depositResult.status !== 'sent' ? `Numero: ${depositResult.error || depositResult.status}` : '',
        instructionsResult.status !== 'sent' ? `Consignes: ${instructionsResult.error || instructionsResult.status}` : '',
        contractResult.status !== 'sent' ? `Contrat: ${contractResult.error || contractResult.status}` : ''
      ].filter(Boolean).join(' | ');

      res.status(500).json({
        error: errorMessages || 'Impossible d envoyer tous les emails client.'
      });
      return;
    }

    res.json({ message: 'Numero, consignes et contrat envoyes par Gmail au client.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible d envoyer tous les emails.' });
  }
});

app.post('/api/orders/:orderId/send-contract', requireAdminAuth, async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || '').trim();
    if (!orderId) {
      res.status(400).json({ error: 'Identifiant de commande manquant.' });
      return;
    }

    const store = await readOrders();
    const orderIndex = store.orders.findIndex((order) => order.id === orderId);

    if (orderIndex === -1) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }

    const order = store.orders[orderIndex];
    const result = await sendContractEmail(order);

    order.customerEmails.contract = {
      ...order.customerEmails.contract,
      status: result.status,
      sentAt: result.sentAt,
      error: result.error
    };

    store.orders[orderIndex] = normalizeStoredOrder(order);
    await writeOrders(store);

    if (result.status !== 'sent') {
      const statusCode = result.status === 'not-configured' ? 503 : 500;
      res.status(statusCode).json({
        error: result.error || 'Impossible d envoyer le contrat par email.'
      });
      return;
    }

    res.json({ message: 'Contrat envoye par Gmail au client.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible d envoyer le contrat.' });
  }
});

app.delete('/api/orders/:orderId', requireAdminAuth, async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || '').trim();
    if (!orderId) {
      res.status(400).json({ error: 'Identifiant de commande manquant.' });
      return;
    }

    const store = await readOrders();
    const nextOrders = store.orders.filter((order) => order.id !== orderId);

    if (nextOrders.length === store.orders.length) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }

    clearOrderCustomerEmailTimers(orderId);
    await writeOrders({ orders: nextOrders });
    res.json({ message: 'Commande supprimee.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de supprimer la commande.' });
  }
});

app.delete('/api/orders', requireAdminAuth, async (req, res) => {
  try {
    Array.from(orderCustomerEmailTimers.keys()).forEach((orderId) => clearOrderCustomerEmailTimers(orderId));
    await writeOrders({ orders: [] });
    res.json({ message: 'Toutes les commandes ont ete supprimees.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de supprimer les commandes.' });
  }
});

app.get('/api/cart', async (req, res) => {
  try {
    const cartId = getOrCreateCartId(req, res);
    const store = await readCartStore();
    const items = normalizeCartItems(store.carts[cartId]?.items);

    if (!store.carts[cartId] || items.length !== (store.carts[cartId]?.items || []).length) {
      store.carts[cartId] = {
        items,
        updatedAt: new Date().toISOString()
      };
      await writeCartStore(store);
    }

    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lire le panier.' });
  }
});

app.put('/api/cart', async (req, res) => {
  try {
    const cartId = getOrCreateCartId(req, res);
    const store = await readCartStore();
    const items = normalizeCartItems(req.body?.items);

    store.carts[cartId] = {
      items,
      updatedAt: new Date().toISOString()
    };

    await writeCartStore(store);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de sauvegarder le panier.' });
  }
});

app.delete('/api/cart', async (req, res) => {
  try {
    const cartId = getOrCreateCartId(req, res);
    const store = await readCartStore();

    store.carts[cartId] = {
      items: [],
      updatedAt: new Date().toISOString()
    };

    await writeCartStore(store);
    res.json({ items: [] });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de vider le panier.' });
  }
});

app.post(
  '/api/beats',
  requireAdminAuth,
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
  ]),
  handleUploadError,
  async (req, res) => {
    const coverFile = req.files?.cover?.[0];
    const audioFile = req.files?.audio?.[0];
    let storedCoverFileName = '';
    let storedAudioFileName = '';

    try {
      const nom = String(req.body.nom || '').trim();
      const style = String(req.body.style || '').trim();
      const producteur = String(req.body.producteur || 'STUDIO BELEC').trim();
      const prix = Number(req.body.prix);
      const bpm = Number(req.body.bpm);

      if (!nom || !style || !Number.isFinite(prix) || !Number.isFinite(bpm) || !coverFile || !audioFile) {
        await cleanupUploadedFiles(req.files);
        res.status(400).json({
          error: 'Nom, prix, bpm, style, cover et fichier audio sont obligatoires.'
        });
        return;
      }

      if (USE_MONGODB) {
        storedCoverFileName = (await saveUploadedFileToGridFs('covers', coverFile)).filename;
        storedAudioFileName = (await saveUploadedFileToGridFs('sons', audioFile)).filename;
      }

      const data = await readData();
      const newBeat = normalizeBeat({
        id: getNextBeatId(data.beats),
        nom,
        prix,
        fichier: USE_MONGODB ? storedAudioFileName : audioFile.filename,
        cover: USE_MONGODB ? storedCoverFileName : coverFile.filename,
        bpm,
        style,
        producteur,
        downloads: 0
      });

      data.beats.push(newBeat);
      await writeData(data);

      res.status(201).json({
        message: 'Beat televerse avec succes.',
        beat: newBeat
      });
    } catch (error) {
      if (USE_MONGODB) {
        await Promise.all([
          storedCoverFileName ? deleteGridFsFileByName('covers', storedCoverFileName) : Promise.resolve(),
          storedAudioFileName ? deleteGridFsFileByName('sons', storedAudioFileName) : Promise.resolve()
        ]);
      } else {
        await cleanupUploadedFiles(req.files);
      }

      res.status(500).json({ error: 'Impossible de televerser le beat.' });
    }
  }
);

app.put('/api/branding/logo', brandingUpload.single('logo'), async (req, res) => {
  const logoFile = req.file;
  let storedLogoFileName = '';

  try {
    if (!logoFile) {
      res.status(400).json({ error: 'Un fichier logo est obligatoire.' });
      return;
    }

    const currentBranding = await readBranding();

     if (USE_MONGODB) {
      storedLogoFileName = (await saveUploadedFileToGridFs('branding', logoFile)).filename;
    }

    const nextBranding = {
      logo: USE_MONGODB ? storedLogoFileName : logoFile.filename,
      updatedAt: new Date().toISOString()
    };

    await writeBranding(nextBranding);

    if (currentBranding.logo && currentBranding.logo !== nextBranding.logo) {
      if (USE_MONGODB) {
        await deleteGridFsFileByName('branding', currentBranding.logo).catch(() => undefined);
      } else {
        const previousLogoPath = path.join(BRANDING_DIR, currentBranding.logo);
        if (fs.existsSync(previousLogoPath)) {
          await fsp.unlink(previousLogoPath).catch(() => undefined);
        }
      }
    }

    res.json({
      message: 'Logo mis a jour avec succes.',
      logo: nextBranding.logo,
      logoUrl: `/branding/${encodeURIComponent(nextBranding.logo)}?v=${encodeURIComponent(nextBranding.updatedAt)}`,
      updatedAt: nextBranding.updatedAt
    });
  } catch (error) {
    if (USE_MONGODB && storedLogoFileName) {
      await deleteGridFsFileByName('branding', storedLogoFileName).catch(() => undefined);
    }

    if (logoFile?.path) {
      await fsp.unlink(logoFile.path).catch(() => undefined);
    }

    res.status(500).json({ error: 'Impossible de televerser le logo.' });
  }
});

app.use(handleUploadError);

app.delete('/api/branding/logo', async (req, res) => {
  try {
    const branding = await readBranding();

    if (branding.logo) {
      if (USE_MONGODB) {
        await deleteGridFsFileByName('branding', branding.logo).catch(() => undefined);
      } else {
        const logoPath = path.join(BRANDING_DIR, branding.logo);
        if (fs.existsSync(logoPath)) {
          await fsp.unlink(logoPath).catch(() => undefined);
        }
      }
    }

    await writeBranding(DEFAULT_BRANDING);
    res.json({ message: 'Logo supprime avec succes.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de supprimer le logo.' });
  }
});

app.delete('/api/beats/:id', requireAdminAuth, async (req, res) => {
  try {
    const beatId = Number(req.params.id);
    const data = await readData();
    const beatIndex = data.beats.findIndex((beat) => beat.id === beatId);

    if (beatIndex === -1) {
      res.status(404).json({ error: 'Beat introuvable.' });
      return;
    }

    const [removedBeat] = data.beats.splice(beatIndex, 1);
    await writeData(data);

    const deletedCover = await deleteFileIfUnused(removedBeat.cover, COVERS_DIR, 'cover', data.beats, 'covers');
    const deletedAudio = await deleteFileIfUnused(removedBeat.fichier, AUDIO_DIR, 'fichier', data.beats, 'sons');

    res.json({
      message: 'Beat supprime avec succes.',
      deletedFiles: {
        cover: deletedCover,
        audio: deletedAudio
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de supprimer le beat.' });
  }
});

app.get('/api/media', async (req, res) => {
  try {
    const data = await readData();

    if (USE_MONGODB) {
      const [covers, audios] = await Promise.all([
        listGridFsMediaFiles('covers', 'covers', 'cover', data.beats),
        listGridFsMediaFiles('sons', 'sons', 'fichier', data.beats)
      ]);

      res.json({ covers, audios });
      return;
    }

    const [coverEntries, audioEntries] = await Promise.all([
      fsp.readdir(COVERS_DIR, { withFileTypes: true }),
      fsp.readdir(AUDIO_DIR, { withFileTypes: true })
    ]);

    const mapEntries = async (entries, baseDir, fieldName, type) => {
      const items = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const fullPath = path.join(baseDir, entry.name);
            const stats = await fsp.stat(fullPath);
            const usedBy = data.beats.filter((beat) => beat[fieldName] === entry.name).map((beat) => beat.id);

            return {
              name: entry.name,
              type,
              size: stats.size,
              url: `/${type}/${encodeURIComponent(entry.name)}`,
              usedBy
            };
          })
      );

      return items.sort((a, b) => a.name.localeCompare(b.name));
    };

    const covers = await mapEntries(coverEntries, COVERS_DIR, 'cover', 'covers');
    const audios = await mapEntries(audioEntries, AUDIO_DIR, 'fichier', 'sons');

    res.json({ covers, audios });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lire les medias.' });
  }
});

app.delete('/api/media/:type/:filename', async (req, res) => {
  try {
    const type = req.params.type;
    const fileName = path.basename(req.params.filename);
    const data = await readData();

    if (type !== 'covers' && type !== 'sons') {
      res.status(400).json({ error: 'Type de media invalide.' });
      return;
    }

    const fieldName = type === 'covers' ? 'cover' : 'fichier';
    const inUse = data.beats.some((beat) => beat[fieldName] === fileName);

    if (inUse) {
      res.status(409).json({
        error: 'Ce fichier est encore utilise par un beat. Supprimez le beat d abord.'
      });
      return;
    }

    const baseDir = type === 'covers' ? COVERS_DIR : AUDIO_DIR;
    const target = path.join(baseDir, fileName);

    if (USE_MONGODB) {
      const deleted = await deleteGridFsFileByName(type, fileName);

      if (!deleted) {
        res.status(404).json({ error: 'Fichier introuvable.' });
        return;
      }

      res.json({ message: 'Fichier supprime avec succes.' });
      return;
    }

    if (!fs.existsSync(target)) {
      res.status(404).json({ error: 'Fichier introuvable.' });
      return;
    }

    await fsp.unlink(target);
    res.json({ message: 'Fichier supprime avec succes.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de supprimer ce fichier.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    storageBackend: USE_MONGODB ? 'mongodb' : 'filesystem'
  });
});

ensureStorage()
  .then(() => {
    return restoreOrderCustomerEmailSchedules();
  })
  .then(() => {
    app.listen(PORT, () => {
      const storageLabel = USE_MONGODB
        ? `MongoDB Atlas (${MONGODB_DB_NAME})`
        : `fichiers ${STORAGE_DIR}`;
      console.log(`Serveur actif sur le port ${PORT} avec stockage ${storageLabel}`);
    });
  })
  .catch((error) => {
    console.error('Impossible de demarrer le serveur.', error);
    process.exit(1);
  });
