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
  '#### 1. 🖼️ مزامنة الصور ثنائية الاتجاه بين السيرفر وكافة الفروع (Bidirectional Image Sync):',
  '- إضافة نقاط نهاية مؤمنة لمزامنة الصور (`/api/sync/uploads/manifest`, `/api/sync/uploads/file`, `/api/sync/uploads/push`).',
  '- مزامنة تلقائية لملفات الصور في الاتجاهين رايح جاي: رفع الصور المحلية الجديدة من الفروع إلى السيرفر المركزي، وسحب الصور المفقودة تلقائياً من السيرفر للفروع.',
  '- دمج مزامنة الصور ضمن دورة المزامنة الدورية وسحب الكتالوج لضمان مطابقة الصور في كل أجهزة النظام.',
  '',
  '#### 2. 👗 إصلاح مسارات وتعديل صور منتجات الإيجار (Rental Inventory Images Fix):',
  '- تصحيح حفظ مسارات صور الإيجار لتكون في `/uploads/products/` أسوة بباقي المخزون العادي.',
  '- دعم رفع وتعديل صور الإيجار بصيغ متعددة (Multipart File أو Base64) بنجاح عبر الواجهة.',
  '- إضافة مسار خدمة احتياطي (Fallback Route) لتأمين عرض كافة الصور القديمة بدون أي روابط مكسورة.',
  '- تصحيح الروابط القديمة المخزنة مسبقاً في قواعد البيانات (`inventory` و `rental_inventory`) تلقائياً.',
  '',
  '#### 3. 🔐 إصلاح مزامنة كلمات المرور والمستخدمين (User Credentials & Password Sync):',
  '- معالجة مشكلة حظر استيراد بيانات المستخدمين وكلمات المرور في الفروع عند وجود عمليات سابقة متعثرة.',
  '- تصدير واستيراد إصدار الجلسة (`token_version`) لضمان إبطال الجلسات القديمة وتطبيق كلمة المرور الجديدة فوراً.',
  '- تفريغ فوري لذاكرة التخزين المؤقتة للمستخدم (`userCache`) في السيرفر والفروع بمجرد اكتمال المزامنة.',
  '',
  '#### 4. ⚡ مطابقة تامة واجتياز اختبارات السيرفر والفروع (Master PG & Branch SQLite Parity):',
  '- اجتياز كامل اختبارات المزامنة الثنائية، واختبارات سلامة الحسابات وحركة الدرج النقدي، واختبارات التحويل والصلاحيات بنجاح 100%.',
  '',
  '---',
  '',
  '### ℹ️ ملاحظات التثبيت والتحديث (Release Notes):',
  '- يشمل التحديث ملفات التثبيت التلقائي للسيرفر الرئيسي (`latest.yml` + `.exe`) والفروع (`branch.yml` + `.exe`).',
  '- يتم تحديث قواعد البيانات والمزامنة تلقائياً عند بدء تشغيل البرنامج دون فقدان أي بيانات مسجلة.',
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

async function enforceCiAndReleaseGates() {
  const { execSync } = require('child_process');
  const rootDir = path.resolve(__dirname, '..');

  const statusOut = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' }).trim();
  if (statusOut) {
    throw new Error(`Release blocked: working tree is not clean:\n${statusOut}`);
  }

  const headSha = execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  const stampPath = path.resolve(rootDir, 'dist', '.release-gate-stamp.json');
  if (!fs.existsSync(stampPath)) {
    throw new Error(`Release blocked: missing local release gate stamp at ${stampPath}. Run "npm run test:release-gate" first.`);
  }
  const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  if (!stamp.gatesPassed || stamp.commit !== headSha || !stamp.clean) {
    throw new Error(`Release blocked: local release gate stamp does not match clean HEAD ${headSha}. Re-run "npm run test:release-gate".`);
  }
  console.log(`✅ Verified local Release Gate stamp for HEAD commit ${headSha}`);

  const unpushedCount = Number(execSync('git rev-list --count origin/master..HEAD', { cwd: rootDir, encoding: 'utf8' }).trim() || 0);
  if (unpushedCount > 0) {
    throw new Error(`Release blocked: ${unpushedCount} local commit(s) on master are not pushed to origin/master yet.`);
  }

  console.log(`🔍 Checking GitHub Actions CI status for commit ${headSha}...`);
  const checksRes = await apiRequest({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/commits/${headSha}/check-runs`,
    method: 'GET',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'NodeJS-Uploader',
      'Accept': 'application/vnd.github+json',
    },
  });

  const checkRuns = Array.isArray(checksRes?.check_runs) ? checksRes.check_runs : [];
  if (checkRuns.length === 0) {
    throw new Error(`Release blocked: no GitHub Actions check-runs found yet for commit ${headSha}. Wait for CI to run and succeed first.`);
  }

  const nonSuccess = checkRuns.filter((cr) => cr.status !== 'completed' || cr.conclusion !== 'success');
  if (nonSuccess.length > 0) {
    const details = nonSuccess.map((cr) => `${cr.name}: status=${cr.status}, conclusion=${cr.conclusion}`).join('\n  - ');
    throw new Error(`Release blocked: GitHub Actions CI is not 100% green for commit ${headSha}:\n  - ${details}`);
  }

  console.log(`✅ All ${checkRuns.length} GitHub Actions CI check-runs passed 100% on commit ${headSha}!`);
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN or GH_TOKEN is required to publish the release.');
    process.exit(1);
  }

  await enforceCiAndReleaseGates();

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
