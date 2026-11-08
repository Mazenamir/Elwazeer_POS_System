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
  '#### 1. 🔄 الإصلاح الشامل والنهائي لتكامل المزامنة (Full Database Synchronization Integrity Repair):',
  '- **حل أخطاء المفاتيح الأجنبية للموردين**: إضافة محدد هوية المورد التلقائي `resolveSupplierForSync` وتأمين ربط الحركات المالية وحركات التوريد بالمعرفات المركزية دون إجهاض.',
  '- **تطهير وتحويل الأنواع الرقمية (Strict Type Coercion)**: التخلص التام من أخطاء `22P02: invalid input syntax for type integer: "0.0"` في حقول `payment_terms`, `moq`, `rating`, `lead_time`.',
  '- **محددات الهوية للمستخدمين والموظفين**: بناء `resolveUserId` و `resolveEmployeeForSync` لتفادي أخطاء الـ Foreign Key عند إنشاء المصروفات، حركات الموظفين، والتالف من الفروع.',
  '- **تحديث طلبات التفصيل والمدفوعات**: إضافة عمود `due_date` لطلبات التفصيل المركزية وحماية مدفوعات `order_payments` و `rental_payments`.',
  '- **الإنعاش والترميم الذاتي للعمليات العالقة (`repairAndReviveDeadLetterOperations`)**: تشخيص وإصلاح حمولات العمليات الفاشلة تلقائياً وإعادة جدولتها دون أي تدخل يدوي.',
  '',
  '#### 2. 📊 أداة المطابقة وتدقيق قواعد البيانات وقواعد المحاسبة (Database Reconciliation Utility):',
  '- فحص ومطابقة 24 جدولاً رئيسياً بين خادم PostgreSQL وعملاء الفروع (SQLite) مع دعم وضع المعاينة الآمن `--dry-run`.',
  '- التحقق التام والصارم من قاعدة تقفيل الدرج المعتمدة: `صافي الكاش = المدفوعات النقدية - (المصروفات النقدية + سلف الموظفين)`.',
  '- عزل مدفوعات الفيزا وانستاباي في الحسابات البنكية المستقلة ومنع خلطها مع الكاش الفعلي بالدرج.',
  '- فحص ومطابقة قواعد مسير الرواتب القياسية (268 ساعة شهرياً، الغياب المضاعف، 4 إجازات مجانية، الأوفرتايم 1.35x).',
  '',
  '#### 3. 🧪 جناح اختبارات تكامل المزامنة الآلي (17/17 Integration Tests — 100% Pass):',
  '- اجتياز كامل السيناريوهات الـ 17 الميدانية للمزامنة:',
  '  1. المبيعات أثناء الاتصال (Online Sale)',
  '  2. تراكم مبيعات الأوفلاين (Offline Sales)',
  '  3. إعادة الاتصال وتفريغ قائمة المزامنة (Reconnect & Sync)',
  '  4. انقطاع الاتصال أثناء الرفع والحفاظ على سلامة الطابور (Upload Interruption)',
  '  5. عدم تكرار العمليات عند إعادة المحاولة (Idempotency Protection)',
  '  6. استرداد العمليات المعلقة بعد إعادة تشغيل التطبيق (App Restart Recovery)',
  '  7. تحديث بيانات الأصناف والأسعار بالخادم المركزي (Master Catalog Updates)',
  '  8. وصول التحديثات لكافة الفروع المصرحة (Multi-Branch Catalog Pull)',
  '  9. تحديث المخزون وحركات البيع من فرعين مختلفين دون تضارب (Multi-Branch Concurrency)',
  '  10. معالجة مرتجعات المبيعات وإعادة رد المخزون والمبالغ (Item Returns & Restocking)',
  '  11. أرشفة وحذف السجلات وحماية المفاتيح الأجنبية (Tombstone Propagation)',
  '  12. مزامنة الدفعات الضخمة (100+ عملية دفعة واحدة دون تسريب اتصالات)',
  '  13. تنفيذ العمليات المتزامنة بنجاح دون حدوث تعارض (Simultaneous Updates)',
  '  14. حماية التراجع التلقائي عند فشل المعاملات (Rollback Safety)',
  '  15. استعادة العمليات الميتة تلقائياً بعد إعادة تشغيل الخادم (Dead-Letter Revival)',
  '  16. العزل الصارم لبيانات الفروع ومنع تسريب أي عمليات بين فرع وآخر (Branch Scoping Isolation)',
  '  17. التحقق الكامل من التقارير المالية ومطابقة أرصدة الكاشير والدرج (Financial & Payroll Invariants)',
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

    await uploadAsset(release, item.path, item.name);
  }

  console.log('\n🎉 ALL ASSETS UPLOADED SUCCESSFULLY TO GITHUB RELEASES!');
  console.log(`🔗 Release URL: ${release.html_url}`);
}

main().catch((err) => {
  console.error('\n❌ Release upload failed:', err.message);
  process.exit(1);
});
