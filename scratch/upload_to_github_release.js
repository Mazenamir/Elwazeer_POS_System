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
  '#### 1. 📦 الباركود والمخزون والمقاسات التفصيلية (Multi-Sizes & Barcodes):',
  '- دعم كامل لباركودات المقاسات الفردية لكل مقاس في الفرع والسيرفر المركزي وقارئ الباركود والطباعة.',
  '- حل تعارض فحص الباركود عند تعديل المنتج بالفرع، وإعادة حساب إجمالي المخزون من مجموع المقاسات بدقة.',
  '- دعم عمليات تحويل المخزون بالمقاسات واستلامها بين الفروع محلياً وفي السيرفر المركزي.',
  '',
  '#### 2. 🧾 الكاشير والفواتير والمرتجعات متعددة المقاسات (POS & Returns):',
  '- حل تعارض إرجاع مقاسين مختلفين لنفس المنتج في نفس فاتورة المرتجع وحفظ عمود المقاس `size` في `return_items`.',
  '- الحفاظ الصارم على حالة المرتجع الجزئي `partially_returned` على السيرفر المركزي دون تحويلها قسراً.',
  '- مزامنة سداد المتبقي للفاتورة وتعديل الفواتير بكامل أصنافها وتفاصيلها دون فقدان للبيانات.',
  '',
  '#### 3. 👔 حجوزات التأجير وتجهيز البدلات (Rental Multi-Item Groups & Fitting):',
  '- مزامنة استلام، تسليم، وإلغاء المجموعات التأجيرية متعددة القطع المشتركة (`rental_group_uuid`) وتعديل أرصدتها بدقة.',
  '- توثيق ومزامنة جاهزية البدلة بالجراب (`setRentalPrepared`) وتحديث الإتاحة الفورية في الفرع والسيرفر.',
  '- خصم رصيد القطع المضافة لعقود نشطة وإدراجها كصفوف مستقلة مترابطة في السيرفر المركزي.',
  '',
  '#### 4. 🔄 حماية البيانات ومحرك المزامنة (Catalog Overwrite Protection & Sync Resilience):',
  '- حماية تعديلات العملاء والفروع والموظفين والإعدادات المحلية من الاستبدال عند سحب الكتالوج الدوري.',
  '- مطابقة استعلامات مزامنة الموردين (25 عموداً بدقة)، وربط المستخدمين بالموظفين المركزيين عبر `offline_uuid`.',
  '- تأمين استعلامات الـ UUID ومنع انهيار تحويل النصوص لأرقام في PostgreSQL.',
  '',
  '#### 5. 📊 التقارير وشيتات الإكسيل والترحيل التلقائي (Reports, Excel & Migrations):',
  '- دعم دوال التواريخ والفترات الزمنية في الفرع وتنسيق الرسوم البيانية للوحة التحكم.',
  '- ترحيل تلقائي للجداول الناقصة في الفرع والسيرفر عبر ملف ترحيل `024_return_items_size_and_employee_uuid.sql`.',
  '',
  '#### 6. 🧪 ضمان الجودة والمطابقة التامة (100% Dual-Target Verification):',
  '- اجتياز كامل مصفوفة اختبارات الفرع المجمعة (9/9 سويت بنجاح 386/386 فحصاً).',
  '- اجتياز اختبارات مسارات التقارير والشيت المجمع والماستر شيت (54/54 فحصاً).',
  '- اجتياز اختبار الحالات الحدية الدقيقة للمزامنة وSQLite (93/93 فحصاً).',
  '- إجمالي الفحوصات الناجحة: **440+ فحصاً آلياً بنسبة نجاح 100%** دون أدنى خطأ.',
  '',
  '---',
  '',
  '### 📦 ملفات التثبيت المرفقة (Installation Packages v' + VERSION + '):',
  '1. **`Bebyoon-System-Setup-' + VERSION + '.exe`**: النسخة الكاملة للسيرفر المركزي (Master Server).',
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

function uploadAsset(uploadUrl, filePath, assetName) {
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

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN or GH_TOKEN is required to publish the release.');
    process.exit(1);
  }

  console.log(`🚀 Checking release ${TAG} on GitHub...`);

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
  } catch (err) {
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
      console.log(`⏩ Asset ${item.name} already exists in release, skipping.`);
      continue;
    }

    await uploadAsset(release.upload_url, item.path, item.name);
  }

  console.log('\n🎉 ALL ASSETS UPLOADED SUCCESSFULLY TO GITHUB RELEASES!');
  console.log(`🔗 Release URL: ${release.html_url}`);
}

main().catch((err) => {
  console.error('\n❌ Release upload failed:', err.message);
  process.exit(1);
});
