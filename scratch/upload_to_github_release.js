const fs = require('fs');
const path = require('path');
const https = require('https');
const pkg = require('../package.json');

function getGitCredentialToken() {
  try {
    const { spawnSync } = require('child_process');
    const res = spawnSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      timeout: 3000,
      env: { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' },
    });
    const passLine = (res.stdout || '').split('\n').find((l) => l.startsWith('password='));
    return passLine ? passLine.slice(9).trim() : '';
  } catch (_) {
    return '';
  }
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || getGitCredentialToken();
const OWNER = 'Mazenamir';
const REPO = 'Elwazeer_POS_System';
const VERSION = process.env.RELEASE_VERSION || pkg.version || '1.1.0';
const TAG = `v${VERSION}`;
const RELEASE_NAME = `Bebyoon System v${VERSION}`;

const RELEASE_BODY = [
  '## 🚀 Bebyoon / El-Wazeer POS System — Release v' + VERSION,
  '',
  '### 🌟 أبرز مميزات وتحديثات الإصدار v' + VERSION + ' (Release Highlights):',
  '',
  '#### 1. 🔄 تحسين التنقل وعزل تبويبات المخزون والموردين (Suppliers & Inventory Navigation & Presets):',
  '- إصلاح التبديل بين تبويبات شاشة المخزون والموردين الأربعة (`/suppliers`) وضمان عمل الروابط المباشرة وتزامنها بدقة مع الصلاحيات.',
  '- تحديث حزمة صلاحيات "مسؤول مخزن" (`inventory_staff`) لتشمل الصلاحيات الدقيقة للمنتجات والموردين وإدارة التحويلات تلقائياً.',
  '',
  '#### 2. 🏢 تعزيز إدارة نطاق الفروع للرؤية المجمعة (Multi-Branch Scoping & Consolidated View):',
  '- إتاحة اختيار "كل الفروع" (`branch_scope: all`) في الهيدر الرئيسي ولوحة التحكم وكافة الشاشات لاستعراض البيانات المجمعة أو التصفية لفرع محدد.',
  '- تمكين مستخدمي الفروع المتعددة من التبديل السلس بين الفروع المصرح لهم بها فقط وحجب باقي الفروع.',
  '',
  '#### 3. 👥 تطهير ومزامنة المستخدمين المحذوفين (Deleted Users Sync Pruning & Session Invalidation):',
  '- عند حذف مستخدم من السيرفر المركزي، تقوم أجهزة الفروع بحذف المستخدمين المحليين غير المديرين فوراً وإلغاء صلاحيات الجلسات النشطة.',
  '',
  '#### 4. ⚡ تزامن تصفير السيرفر المركزي مع الفروع (Central Server Reset Synchronization):',
  '- إضافة خاصية تصفير الفروع التلقائي عبر `system_reset_token` عند تصفير أو إعادة تهيئة السيرفر المركزي (`Settings -> Reset Branches`).',
  '- تكتشف أجهزة الفروع أمر التصفير فور اتصالها، وتقوم بمسح العمليات والفواتير المحلية المتراكمة وتنزيل كتالوج السيرفر الجديد كلياً.',
  '',
  '#### 5. 🔐 استمرار جلسات تسجيل الدخول وتمديد صلاحية التوكن (Persistent Login Sessions):',
  '- حفظ جلسة الدخول في الذاكرة الدائمة (`localStorage`) داخل بيئة Electron لضمان بقاء المستخدم مسجلاً بعد إعادة تشغيل التطبيق أو الجهاز.',
  '- تمديد صلاحية توكن المصادقة JWT إلى 30 يوماً (`30d`).',
  '',
  '---',
  '',
  '### 📦 ملفات التثبيت المرفقة (Installation Packages v' + VERSION + '):',
  '1. **`Bebyoon-System-Setup-' + VERSION + '.exe`**: النسخة الكاملة للسيرفر المركزي (Master Server Setup).',
  '2. **`Bebyoon-Branch-Setup-' + VERSION + '.exe`**: النسخة المخصصة لأجهزة الفروع ونقاط البيع المحلية (Branch Offline-First Setup).',
  '3. **ملفات التحديث التلقائي الموقعة (`latest.yml`, `branch.yml`, `.blockmap`, `update-policy.json`)**.',
].join('\n');

function apiRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`API Error [${res.statusCode}]: ${body}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
          else reject(new Error(`API Error [${res.statusCode}]: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function deleteAssetIfExists(releaseId, assetName) {
  try {
    const assets = await apiRequest({
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'NodeJS-Uploader',
      },
    });
    const match = assets.find(a => a.name === assetName);
    if (match) {
      console.log(`🧹 Removing existing/partial asset ${assetName} (ID: ${match.id})...`);
      await apiRequest({
        hostname: 'api.github.com',
        path: `/repos/${OWNER}/${REPO}/releases/assets/${match.id}`,
        method: 'DELETE',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'NodeJS-Uploader',
        },
      });
    }
  } catch (_) {}
}

function uploadAssetOnce(uploadUrl, filePath, assetName) {
  return new Promise((resolve, reject) => {
    const cleanUrl = uploadUrl.replace(/\{.*$/, '') + `?name=${encodeURIComponent(assetName)}`;
    const urlObj = new URL(cleanUrl);
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const sizeMb = (fileSize / (1024 * 1024)).toFixed(2);

    console.log(`\n⏳ Uploading ${assetName} (${sizeMb} MB)...`);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'NodeJS-Uploader',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Uploaded ${assetName} successfully!`);
          resolve(JSON.parse(body || '{}'));
        } else {
          reject(new Error(`Failed to upload ${assetName} [${res.statusCode}]: ${body}`));
        }
      });
    });

    req.on('error', reject);

    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    let uploadedBytes = 0;
    let lastLogTime = Date.now();

    stream.on('data', (chunk) => {
      uploadedBytes += chunk.length;
      if (Date.now() - lastLogTime > 3000) {
        const pct = Math.round((uploadedBytes / fileSize) * 100);
        const uploadedMb = (uploadedBytes / (1024 * 1024)).toFixed(1);
        console.log(`   Progress: ${pct}% (${uploadedMb} / ${sizeMb} MB)...`);
        lastLogTime = Date.now();
      }
    });

    stream.pipe(req);
  });
}

async function uploadAsset(release, filePath, assetName, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`🔄 Retry attempt ${attempt}/${maxRetries} for ${assetName}...`);
        await deleteAssetIfExists(release.id, assetName);
        await new Promise(r => setTimeout(r, 4000));
      }
      return await uploadAssetOnce(release.upload_url, filePath, assetName);
    } catch (err) {
      console.warn(`⚠️ Attempt ${attempt} failed for ${assetName}:`, err.message);
      if (attempt === maxRetries) throw err;
    }
  }
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN or GH_TOKEN is required to publish the release.');
    process.exit(1);
  }

  const deleteExisting = process.argv.includes('--delete-existing') || process.env.DELETE_EXISTING === 'true';

  let release;
  try {
    release = await apiRequest({
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'NodeJS-Uploader',
      },
    });
    console.log(`Found existing release: ${release.name} (ID: ${release.id})`);

    if (deleteExisting) {
      console.log(`🗑️ Deleting existing release ${TAG} (ID: ${release.id}) from GitHub as requested...`);
      await apiRequest({
        hostname: 'api.github.com',
        path: `/repos/${OWNER}/${REPO}/releases/${release.id}`,
        method: 'DELETE',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'NodeJS-Uploader',
        },
      });
      console.log(`🗑️ Deleting remote git tag ref ${TAG}...`);
      try {
        await apiRequest({
          hostname: 'api.github.com',
          path: `/repos/${OWNER}/${REPO}/git/refs/tags/${TAG}`,
          method: 'DELETE',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'NodeJS-Uploader',
          },
        });
      } catch (_) {}
      release = null;
    }
    if (!deleteExisting) {
      await apiRequest({
        hostname: 'api.github.com',
        path: `/repos/${OWNER}/${REPO}/releases/${release.id}`,
        method: 'PATCH',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'NodeJS-Uploader',
          'Content-Type': 'application/json',
        },
      }, {
        name: RELEASE_NAME,
        body: RELEASE_BODY,
      });
      console.log(`📝 Updated release metadata for: ${release.name}`);
    }
  } catch (err) {
    // Release does not exist
  }

  if (!release) {
    console.log(`Release ${TAG} not found, creating new release...`);
    release = await apiRequest({
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/releases`,
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'NodeJS-Uploader',
        'Content-Type': 'application/json',
      },
    }, {
      tag_name: TAG,
      target_commitish: 'master',
      name: RELEASE_NAME,
      body: RELEASE_BODY,
      draft: false,
      prerelease: false,
    });
    console.log(`✅ Created release: ${release.name} (ID: ${release.id})`);
  }

  const existingAssetNames = new Set((release.assets || []).map(a => a.name));

  const filesToUpload = [
    {
      path: path.join(__dirname, `../dist/Bebyoon System Setup ${VERSION}.exe`),
      name: `Bebyoon-System-Setup-${VERSION}.exe`,
    },
    {
      path: path.join(__dirname, `../dist/Bebyoon System Setup ${VERSION}.exe.blockmap`),
      name: `Bebyoon-System-Setup-${VERSION}.exe.blockmap`,
    },
    {
      path: path.join(__dirname, '../dist/latest.yml'),
      name: 'latest.yml',
    },
    {
      path: path.join(__dirname, `../dist-branch/Bebyoon Branch Setup ${VERSION}.exe`),
      name: `Bebyoon-Branch-Setup-${VERSION}.exe`,
    },
    {
      path: path.join(__dirname, `../dist-branch/Bebyoon Branch Setup ${VERSION}.exe.blockmap`),
      name: `Bebyoon-Branch-Setup-${VERSION}.exe.blockmap`,
    },
    {
      path: path.join(__dirname, '../dist-branch/branch.yml'),
      name: 'branch.yml',
    },
    {
      path: path.join(__dirname, '../dist/update-policy.json'),
      name: 'update-policy-master.json',
    },
    {
      path: path.join(__dirname, '../dist-branch/update-policy.json'),
      name: 'update-policy-branch.json',
    },
  ];

  for (const item of filesToUpload) {
    if (!fs.existsSync(item.path)) {
      console.warn(`⚠️ File not found, skipping: ${item.path}`);
      continue;
    }

    if (existingAssetNames.has(item.name)) {
      console.log(`🔄 Asset ${item.name} already exists in release, replacing with fresh build...`);
      await deleteAssetIfExists(release.id, item.name);
    }

    await uploadAsset(release, item.path, item.name);
  }

  console.log('\n🎉 ALL ASSETS UPLOADED SUCCESSFULLY TO GITHUB RELEASES!');
  console.log(`🔗 Release URL: ${release.html_url}`);
}

main().catch((err) => {
  console.error('\n❌ Release upload failed:', err.message);
  process.exit(1);
});
