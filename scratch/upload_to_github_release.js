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
  '#### 1. 📱 دعم المحافظ الإلكترونية وتقفيل الدرج (Cash Drawer Settlement & Digital Wallets):',
  '- إضافة بطاقة مخصصة لمحفظة فودافون كاش والمحافظ الإلكترونية (`wallet` / `vodafone_cash`) في شاشة تقفيل الدرج والمصروفات (`ExpensesManager.jsx`).',
  '- إضافة بطاقة إجمالي التحصيلات غير النقدية (فيزا + انستاباي + فودافون كاش) وعزلها بالكامل عن الكاش الفعلي بالدرج.',
  '- تصحيح احتساب غرامات تأخير الإيجار عبر المحفظة الإلكترونية (`wallet_amount`) في `reports.service.js`.',
  '',
  '#### 2. ✂️ صلاحيات وإلغاء أوامر التفصيل لحسابات الفروع (Tailoring Cancellation & Branch Permissions):',
  '- تمكين حسابات الفروع (`branch_user`, `cashier`, `Tailoring.html`) من إلغاء أوامر التفصيل مع فك الحظر عن صلاحية `tailoring.delete`.',
  '- إضافة نافذة تأكيد الإلغاء الاحترافية مع خيار استرداد العربون (Deposit Refund) وإلغاء المدفوعات والبنود التابعة ذرياً ومزامنتها.',
  '',
  '#### 3. 🏢 دعم حساب المحاسب المالي وعرض كافة الفروع (Accountant Scoping & All-Branches Access):',
  '- تمكين خيار "(كل الفروع)" في الشريط العلوي `Header.jsx`, `BranchContext.jsx`, `Reports.jsx`, `ExpensesManager.jsx` لحسابات المحاسب المالي والإدارة.',
  '- حل خطأ الكراش في تقارير النظام `reports.service.js` عند اختيار كافة الفروع واسترجاع البيانات بشكل سليم.',
  '- إتاحة الوصول لبيانات الفرع رقم 3 ("الوزير")، والطلبات والعملاء والموردين لحسابات المحاسبين والمدراء بحرية كاملة دون حظر 403.',
  '',
  '#### 4. 🔒 حماية خصوصية الرواتب وسلف الموظفين (Employee Advance & Salary Masking Protection):',
  '- حجب الراتب الأساسي وصافي الراتب عن الكاشير والمشرفين أثناء تسجيل السلف لحماية خصوصية بيانات الرواتب.',
  '- إتاحة تسجيل السلف فقط مع عرض ملخص السلف دون كشف البنية المالية للراتب للمستخدمين غير المصرح لهم.',
  '',
  '---',
  '',
  '### ℹ️ ملاحظات التثبيت والتحديث (Release Notes):',
  '- يشمل هذا الإصدار التحديثات البرمجية والتحسينات التشغيلية المباشرة (Source & Client Build Updates).',
  '- تم تحديث كود البناء للواجهة الأمامية `build:client` وقواعد التحقق من الصلاحيات وربط فروع الماكينات بدقة.',
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

    if (item.name.endsWith('.yml')) {
      const content = fs.readFileSync(item.path, 'utf8');
      if (!content.includes(`version: ${VERSION}`)) {
        console.warn(`⚠️ Skipping ${item.name}: manifest version does not match release version ${VERSION}`);
        continue;
      }
    }

    if (item.name.endsWith('.json')) {
      try {
        const policyObj = JSON.parse(fs.readFileSync(item.path, 'utf8'));
        if (policyObj.policy?.version !== VERSION) {
          console.warn(`⚠️ Skipping ${item.name}: update-policy version (${policyObj.policy?.version}) does not match release version ${VERSION}`);
          continue;
        }
      } catch (e) {
        console.warn(`⚠️ Skipping ${item.name}: failed to parse policy JSON: ${e.message}`);
        continue;
      }
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
