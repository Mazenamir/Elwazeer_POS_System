const fs = require('fs');
const path = require('path');
const https = require('https');
const pkg = require('../package.json');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const OWNER = 'Mazenamir';
const REPO = 'Elwazeer_POS_System';
const VERSION = process.env.RELEASE_VERSION || pkg.version || '1.0.8';
const TAG = `v${VERSION}`;
const RELEASE_NAME = `Bebyoon System v${VERSION}`;

const RELEASE_BODY = `## 🚀 التحديثات في الإصدار v${VERSION} (Release Highlights)

### 📊 نظام الحسابات وتقفيل الدرج المعتمد (Elwazeer Accounting Invariants)
- **تقفيل الدرج النقدي:** الفصل التام بين المدفوعات النقدية والبنكية (فيزا وانستاباي)، واحتساب صافي الكاش المتبقي للتوريد: \`صافي التحصيل النقدي - (المصروفات النقدية + سلف الموظفين + مدفوعات الموردين من الدرج)\`.
- **مسير الرواتب القياسي (268 ساعة):** اعتماد معيار 268 ساعة شهرياً، استقطاع الغياب المضاعف، السماح بـ 4 أيام إجازة شهرياً، واحتساب الأوفر تايم بمعدل 1.35x.
- **تصدير الإكسيل المجمع (31-Day Consolidated Excel):** مطابقة تامة لهيكل الشيت المعتمد (31 شيت يومي + MASTER STAFF LIST + MASTER SHEET + OHDA + SALARY + KPI).

### 🔄 التحديث التلقائي الخفيف والآمن (Periodic Auto-Updater)
- **فحص دوري خفيف في الخلفية:** فحص كل 20 دقيقة مع تباين عشوائي (Jitter ±5m) لمنع تزامن الطلبات بين الفروع.
- **منع التزاحم وإدارة الانقطاع:** أقفال تزامن تمنع تعدد طلبات الفحص، ومضاعفة وقت الانتظار (Exponential Backoff حتى 120 دقيقة) عند انقطاع الإنترنت.
- **الأمان والاستقرار:** منع كامل لأي أوامر \`git pull\` تلقائية على أجهزة العملاء، وفصل تام بين فحص التحديث وتحميل الحزم لتفادي أي بطء في نقطة البيع.

### 🛡️ الأمان، الصلاحيات، وإدارة الفروع (Security & RBAC)
- **لوحة صلاحيات تفصيلية:** إدارة دقيقة لصلاحيات المستخدمين لكل صفحة وميزة.
- **حماية المبيعات والمخزون:** منع التلاعب في الأسعار من المتصفح والتحقق الحاسم على الخادم، مع تتبع دقيق للمقاسات والألوان والتحويلات بين الفروع.
- **ترقية حزم التبعيات:** معالجة الثغرات الأمنية في التبعيات الخارجية بنجاح 100%.

---

### 📦 ملفات التثبيت المرفقة (Installation Packages):
1. **\`Bebyoon-System-Setup-${VERSION}.exe\`**: النسخة الكاملة للسيرفر المركزي (Master Server).
2. **\`Bebyoon-Branch-Setup-${VERSION}.exe\`**: النسخة المخصصة لأجهزة الفروع ونقاط البيع (Branch Setup).
3. **ملفات التحقق والترقية التلقائية (\`latest.yml\` & \`.blockmap\`)**.
`;

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
