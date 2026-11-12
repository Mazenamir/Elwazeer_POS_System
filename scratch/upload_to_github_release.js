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
  '#### 1. ⏱️ إصلاح مزامنة الحضور والانصراف (Attendance Sync Integer Casting):',
  '- تصحيح نوع بيانات حقول الدقائق في مزامنة الحضور والانصراف (`late_minutes`, `early_departure_minutes`, `overtime_minutes`) لمنع خطأ قاعدة البيانات المركزي `invalid input syntax for type integer: "0.0"`.',
  '- تقريب وتأكيد تحويل كافة قيم التأخير والمغادرة الإضافية إلى أرقام صحيحة (`Math.round`)، مع ضبط `total_hours` بدقة منزلتين عشريتين في طبقة المزامنة وسيرفيس الموظفين والتقارير.',
  '',
  '#### 2. 🏢 التوجيه التلقائي لماكينات الفروع (Automatic Branch Machine Scoping):',
  '- ربط ماكينات الفروع (`config.BRANCH_ID = 3`) تلقائياً ببيانات وتقارير الفرع الفعلي للمستخدمين المحليين (مثل حساب أحمد) دون الحاجة لإدخال رقم الفرع يدوياً أو ظهور تقارير وإحصائيات فارغة.',
  '- إعطاء الأولوية لرقم الفرع المعين للجهاز في وضع الفرع بـ `getReportBranchId` و`effectiveBranchId` عند تسجيل الدخول واستعلام البيانات.',
  '',
  '#### 3. 💵 تقفيل الدرج وفصل الإيراد البنكي ومعاملات الاستعلام (Cash Drawer Settlement & Bank Isolation):',
  '- إصلاح تمرير معاملات الاستعلام (`params`) في عميل الـ API (`client.js`) لتمكين الفلترة الدقيقة بالتاريخ والفرع لشاشات تقفيل الدرج والمصروفات.',
  '- دعم كامل ودقيق لمدفوعات الفيزا وانستاباي (`visa`, `card`, `instapay`, `bank_transfer`) في تقرير تقفيل الدرج اليومي الممتد وعزلها تماماً عن رصيد الكاش بالدرج.',
  '- ربط تلقائي لفرع الدرج بفرع المستخدم النشط أو الفرع المختار في قائمة الفروع.',
  '',
  '#### 4. 🗑️ صلاحيات حذف التعديلات والتفصيل والعملاء والمخزون (Tailoring & Alterations Delete Permissions):',
  '- إضافة صلاحيات حذف مخصصة (`tailoring.delete` و `alterations.delete`) وتضمينها ضمن كتالوج الصلاحيات والصلاحيات الحساسة.',
  '- تفعيل أزرار الحذف في واجهات التعديلات (`Alterations.jsx`)، التفصيل (`Tailoring.jsx`)، العملاء (`Customers.jsx`)، وإدارة المخزون (`RentalInventory.jsx`) للحسابات الممنوحة الصلاحية بجانب المدراء.',
  '- حماية مسارات الـ API لحذف التعديلات وطلبات التفصيل بقواعد التحقق من الصلاحيات.',
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
    const opts = { rejectUnauthorized: false, ...options };
    const req = https.request(opts, (res) => {
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
      rejectUnauthorized: false,
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
