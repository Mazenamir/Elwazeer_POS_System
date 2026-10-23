const fs = require('fs');
const path = require('path');
const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const OWNER = 'Mazenamir';
const REPO = 'Elwazeer_POS_System';
const TAG = 'v1.0.7';
const RELEASE_NAME = 'Bebyoon System v1.0.7';

const RELEASE_BODY = `## 🚀 التحديثات في الإصدار v1.0.7 (Release Highlights)

### 🏬 نظام الفروع والمزامنة ثنائية الاتجاه (Offline-First Sync)
- **العمل بدون إنترنت 100%:** تشغيل محلي في الفروع بقاعدة بيانات خفيفة وسريعة (SQLite) دون توقف للكاشير.
- **المزامنة التلقائية:** رفع فواتير ومرتجعات الفروع تلقائياً إلى السيرفر المركزي كل 30 ثانية.
- **نافذة تشخيص وضبط الرابط:** إمكانية تغيير رابط السيرفر ورقم الفرع مباشرة من واجهة البرنامج (Header).
- **مراقبة الاتصال (Heartbeat & Notifications):** مؤشرات حية لحالة اتصال الفروع وإشعارات فورية.

### 💰 المبيعات ونقاط البيع (POS & Financials)
- **دعم تجزئة طرق الدفع (Split Payments):** إمكانية دفع الفاتورة مقسمة (كاش، فيزا، آجل).
- **التقارير المالية والأرباح:** لوحة تحكم متقدمة بحساب الأرباح الفعلية وصافي الدخل وتصدير Excel/PDF.
- **تحسينات الأداء والواجهة:** تسريع البحث عن الأصناف والعملاء، وإصلاح نوافذ التأكيد.

---

### 📦 ملفات التثبيت المرفقة:
1. **\`Bebyoon-System-Setup-1.0.7.exe\`**: النسخة الكاملة للسيرفر المركزي (Master Server).
2. **\`Bebyoon-Branch-Setup-1.0.7.exe\`**: النسخة الخفيفة المخصصة لأجهزة الفروع والكاشير (Branch Setup).
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
      path: path.join(__dirname, '../dist/Bebyoon System Setup 1.0.7.exe'),
      name: 'Bebyoon-System-Setup-1.0.7.exe',
    },
    {
      path: path.join(__dirname, '../dist/Bebyoon System Setup 1.0.7.exe.blockmap'),
      name: 'Bebyoon-System-Setup-1.0.7.exe.blockmap',
    },
    {
      path: path.join(__dirname, '../dist/latest.yml'),
      name: 'latest.yml',
    },
    {
      path: path.join(__dirname, '../dist-branch/Bebyoon Branch Setup 1.0.7.exe'),
      name: 'Bebyoon-Branch-Setup-1.0.7.exe',
    },
    {
      path: path.join(__dirname, '../dist-branch/Bebyoon Branch Setup 1.0.7.exe.blockmap'),
      name: 'Bebyoon-Branch-Setup-1.0.7.exe.blockmap',
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
