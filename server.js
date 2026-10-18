'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const mime = require('mime-types');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 500));
const MAX_OUTPUT_MB = Math.max(1, Number(process.env.MAX_OUTPUT_MB || 500));
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const TMP = path.join(os.tmpdir(), 'ticoh-generali');
const GENERATED = path.join(PUBLIC, 'generated');

for (const dir of [TMP, GENERATED]) fs.mkdirSync(dir, { recursive: true });

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.json({ limit: '32kb' }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(PUBLIC, { extensions: ['html'] }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP),
  filename: (_req, _file, cb) => cb(null, crypto.randomUUID())
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(video|audio)\//i.test(file.mimetype) ||
      /\.(mp4|mov|m4v|webm|mkv|mp3|m4a|aac|wav|ogg|flac)$/i.test(file.originalname);
    cb(ok ? null : new Error('Upload a supported audio or video file.'), ok);
  }
});

function identifyPlatform(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const known = [
    { name: 'Facebook', hosts: ['facebook.com', 'm.facebook.com', 'fb.watch'] },
    { name: 'Instagram', hosts: ['instagram.com'] },
    { name: 'TikTok', hosts: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'] },
    { name: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'm.youtube.com'] }
  ];
  return known.find(p => p.hosts.some(h => host === h || host.endsWith('.' + h))) || null;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'TICOH GENERALI' }));

app.post('/api/analyze', (req, res) => {
  const raw = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!raw || raw.length > 2048) return res.status(400).json({ error: 'Paste a valid media link.' });
  let parsed;
  try { parsed = new URL(raw); } catch { return res.status(400).json({ error: 'That link does not look valid. Include https://.' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'Only HTTPS or HTTP links are supported.' });
  const platform = identifyPlatform(raw);
  if (!platform) return res.status(400).json({ error: 'This platform is not supported yet. Try Facebook, Instagram, TikTok, or YouTube.' });

  // Intentionally do not scrape or fetch social-platform URLs. Each platform requires an
  // authorized API/provider adapter and its own permission/terms checks.
  return res.json({
    ok: true,
    platform: platform.name,
    status: 'integration_required',
    message: `${platform.name} link recognized. A verified, authorized integration for this platform must be configured before downloads can be offered.`,
    options: []
  });
});

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
    child.on('error', err => reject(new Error(err.code === 'ENOENT' ? 'FFmpeg is not installed or FFMPEG_PATH is incorrect.' : err.message)));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim().split('\n').slice(-4).join('\n') || 'Media processing failed.')));
  });
}

app.post('/api/process', upload.single('media'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Choose a video or audio file first.' });

  const mode = String(req.body.mode || 'audio');
  const format = String(req.body.format || (mode === 'video' ? 'mp4' : 'mp3')).toLowerCase();
  const quality = String(req.body.quality || 'medium');
  const allowed = mode === 'audio' ? ['mp3', 'm4a', 'wav'] : ['mp4', 'webm'];
  if (!allowed.includes(format)) {
    fs.rm(file.path, { force: true }, () => {});
    return res.status(400).json({ error: 'Unsupported output format.' });
  }

  const id = crypto.randomUUID();
  const ext = format;
  const output = path.join(GENERATED, `${id}.${ext}`);
  let args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file.path, '-nostdin'];

  if (mode === 'audio') {
    if (format === 'mp3') {
      const bitrate = ({ low: '96k', medium: '160k', high: '256k' })[quality] || '160k';
      args.push('-vn', '-codec:a', 'libmp3lame', '-b:a', bitrate);
    } else if (format === 'm4a') {
      const bitrate = ({ low: '96k', medium: '160k', high: '256k' })[quality] || '160k';
      args.push('-vn', '-codec:a', 'aac', '-b:a', bitrate, '-movflags', '+faststart');
    } else {
      args.push('-vn', '-codec:a', 'pcm_s16le');
    }
  } else {
    if (format === 'mp4') {
      const crf = ({ low: '30', medium: '25', high: '20' })[quality] || '25';
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart');
    } else {
      const crf = ({ low: '34', medium: '30', high: '26' })[quality] || '30';
      args.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-c:a', 'libopus', '-b:a', '96k');
    }
  }
  args.push(output);

  try {
    await runFfmpeg(args);
    const stat = fs.statSync(output);
    if (stat.size > MAX_OUTPUT_MB * 1024 * 1024) {
      fs.rm(output, { force: true }, () => {});
      return res.status(413).json({ error: `The output exceeds the ${MAX_OUTPUT_MB} MB output limit.` });
    }
    // Keep generated downloads for a short period; cleanup is also run periodically below.
    res.json({
      ok: true,
      downloadUrl: `/api/download/${id}.${ext}`,
      filename: `ticoh-generali-${id.slice(0, 8)}.${ext}`,
      sizeBytes: stat.size,
      sizeLabel: stat.size >= 1024 * 1024 ? `${(stat.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(stat.size / 1024))} KB`
    });
  } catch (err) {
    fs.rm(output, { force: true }, () => {});
    res.status(422).json({ error: err.message || 'Could not process this file. Check that it is a valid media file.' });
  } finally {
    fs.rm(file.path, { force: true }, () => {});
  }
});

app.get('/api/download/:file', (req, res) => {
  const name = path.basename(req.params.file);
  if (!/^[a-f0-9-]{36}\.(mp3|m4a|wav|mp4|webm)$/.test(name)) return res.status(400).json({ error: 'Invalid download identifier.' });
  const target = path.join(GENERATED, name);
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'This download has expired or does not exist. Please process the file again.' });
  res.download(target, name, err => {
    if (err && !res.headersSent) res.status(500).end('Download failed.');
  });
});

// Automatically remove generated files after 30 minutes and temporary uploads after 1 hour.
setInterval(() => {
  const now = Date.now();
  for (const [dir, maxAge] of [[GENERATED, 30 * 60 * 1000], [TMP, 60 * 60 * 1000]]) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      try { if (now - fs.statSync(p).mtimeMs > maxAge) fs.rmSync(p, { force: true, recursive: true }); } catch {}
    }
  }
}, 5 * 60 * 1000).unref();

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File is too large. Maximum upload size is ${MAX_UPLOAD_MB} MB.` });
  }
  res.status(400).json({ error: err.message || 'Request failed.' });
});

app.listen(PORT, () => console.log(`TICOH GENERALI running at http://localhost:${PORT}`));
