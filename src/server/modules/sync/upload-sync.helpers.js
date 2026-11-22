const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config/env');
const { ALLOWED_EXTENSIONS } = require('../../middleware/upload.middleware');

const MAX_SYNC_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

function normalizeRelativeUploadPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let clean = rawPath.replace(/\\/g, '/').trim();
  clean = clean.replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) {
    clean = clean.slice('uploads/'.length);
  }
  if (!clean || clean.includes('\0') || clean.startsWith('/')) return null;
  const segments = clean.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
    return null;
  }
  const normalizedRel = segments.join('/');
  const ext = path.extname(normalizedRel).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;

  const uploadsRoot = path.resolve(config.UPLOADS_DIR);
  const fullPath = path.resolve(uploadsRoot, normalizedRel);
  if (!fullPath.startsWith(uploadsRoot + path.sep)) {
    return null;
  }
  return { relPath: normalizedRel, fullPath };
}

function listLocalUploadImages() {
  const uploadsRoot = path.resolve(config.UPLOADS_DIR);
  if (!fs.existsSync(uploadsRoot)) return [];

  const results = [];
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (entry.name.startsWith('.tmp_')) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size <= 0 || stat.size > MAX_SYNC_IMAGE_BYTES) continue;
          const relPath = path.relative(uploadsRoot, fullPath).replace(/\\/g, '/');
          results.push({
            path: relPath,
            size: stat.size,
            mtimeMs: Math.round(stat.mtimeMs),
          });
        } catch {}
      }
    }
  };

  walk(uploadsRoot, 0);
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

function resolveExistingUploadFile(rawRelPath) {
  const normalized = normalizeRelativeUploadPath(rawRelPath);
  if (!normalized) return null;
  if (fs.existsSync(normalized.fullPath) && fs.statSync(normalized.fullPath).isFile()) {
    return normalized.fullPath;
  }
  // Fallback for legacy rental paths stored as /uploads/product_xxx.jpg while file lives in uploads/products/
  if (!normalized.relPath.includes('/')) {
    const fallbackPath = path.join(config.PRODUCT_UPLOADS_DIR, normalized.relPath);
    if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isFile()) {
      return fallbackPath;
    }
  }
  return null;
}

function saveUploadedImageBuffer(rawRelPath, buffer) {
  const normalized = normalizeRelativeUploadPath(rawRelPath);
  if (!normalized) {
    const err = new Error('Invalid upload image path');
    err.statusCode = 400;
    throw err;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_SYNC_IMAGE_BYTES) {
    const err = new Error('Invalid image buffer size');
    err.statusCode = 400;
    throw err;
  }

  const targetDir = path.dirname(normalized.fullPath);
  fs.mkdirSync(targetDir, { recursive: true });

  const tmpPath = path.join(targetDir, `.tmp_${process.pid}_${crypto.randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, normalized.fullPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    fs.writeFileSync(normalized.fullPath, buffer);
  }

  return { ok: true, path: normalized.relPath, size: buffer.length };
}

async function repairLegacyImagePaths(db) {
  if (!db || typeof db.query !== 'function') return 0;
  let repaired = 0;
  const tables = ['inventory', 'rental_inventory'];

  for (const table of tables) {
    try {
      const { rows } = await db.query(
        `SELECT id, image_url FROM ${table}
         WHERE image_url LIKE '/uploads/%'
           AND image_url NOT LIKE '/uploads/products/%'`
      );
      for (const row of rows) {
        const filename = String(row.image_url || '').slice('/uploads/'.length).trim();
        if (!filename || filename.includes('/')) continue;
        const rootFile = path.join(config.UPLOADS_DIR, filename);
        const productFile = path.join(config.PRODUCT_UPLOADS_DIR, filename);
        if ((!fs.existsSync(rootFile) && fs.existsSync(productFile)) || filename.startsWith('product_')) {
          const fixedUrl = `/uploads/products/${filename}`;
          await db.query(`UPDATE ${table} SET image_url = $1 WHERE id = $2`, [fixedUrl, row.id]);
          repaired += 1;
        }
      }
    } catch (err) {
      console.warn(`[UploadSync] Legacy path repair skipped for ${table}:`, err.message);
    }
  }
  return repaired;
}

async function runWithConcurrency(items, concurrency, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await fn(current);
    }
  });
  await Promise.all(workers);
}

async function syncImagesWithCentral({ db, fetchFn, serverUrl, apiKey, pullOnly = false }) {
  if (!serverUrl) {
    return { ok: false, pushed: 0, pulled: 0, failed: 0, reason: 'unconfigured' };
  }

  await repairLegacyImagePaths(db);

  const headers = apiKey ? { 'x-sync-key': apiKey } : {};
  const manifestRes = await fetchFn(`${serverUrl}/api/sync/uploads/manifest`, {
    method: 'GET',
    headers,
  });

  if (manifestRes.status === 401 || manifestRes.status === 403) {
    const authErr = new Error('SYNC_AUTH_FAILED: مفتاح المزامنة غير صالح أو مرفوض من السيرفر');
    authErr.statusCode = manifestRes.status;
    authErr.isAuthError = true;
    throw authErr;
  }
  if (!manifestRes.ok) {
    const errText = await manifestRes.text().catch(() => '');
    throw new Error(`Upload manifest failed (${manifestRes.status}): ${errText.slice(0, 200)}`);
  }

  const manifestData = await manifestRes.json();
  const serverFiles = Array.isArray(manifestData?.files) ? manifestData.files : [];
  const serverPathSet = new Set(serverFiles.map((f) => f.path));

  const localFiles = listLocalUploadImages();
  const localPathSet = new Set(localFiles.map((f) => f.path));

  let pushed = 0;
  let pulled = 0;
  let failed = 0;

  if (!pullOnly) {
    const toPush = localFiles.filter((f) => !serverPathSet.has(f.path));
    await runWithConcurrency(toPush, 3, async (file) => {
      try {
        const fullPath = resolveExistingUploadFile(file.path);
        if (!fullPath) return;
        const buffer = fs.readFileSync(fullPath);
        const pushRes = await fetchFn(`${serverUrl}/api/sync/uploads/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
            path: file.path,
            data_base64: buffer.toString('base64'),
          }),
        });
        if (!pushRes.ok) {
          failed += 1;
          return;
        }
        pushed += 1;
        serverPathSet.add(file.path);
      } catch (err) {
        failed += 1;
        console.warn(`[UploadSync] Failed to push ${file.path}:`, err.message);
      }
    });
  }

  const toPull = serverFiles.filter((f) => !localPathSet.has(f.path));
  await runWithConcurrency(toPull, 4, async (file) => {
    try {
      const fileRes = await fetchFn(
        `${serverUrl}/api/sync/uploads/file?path=${encodeURIComponent(file.path)}`,
        { method: 'GET', headers }
      );
      if (!fileRes.ok) {
        failed += 1;
        return;
      }
      const arrayBuf = await fileRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      saveUploadedImageBuffer(file.path, buffer);
      pulled += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[UploadSync] Failed to pull ${file.path}:`, err.message);
    }
  });

  return {
    ok: failed === 0,
    pushed,
    pulled,
    failed,
    totalServer: serverFiles.length,
    totalLocal: localFiles.length,
  };
}

module.exports = {
  MAX_SYNC_IMAGE_BYTES,
  normalizeRelativeUploadPath,
  listLocalUploadImages,
  resolveExistingUploadFile,
  saveUploadedImageBuffer,
  repairLegacyImagePaths,
  syncImagesWithCentral,
};
