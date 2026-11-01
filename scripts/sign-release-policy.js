/**
 * scripts/sign-release-policy.js
 * Developer Release Tool: Generate and Ed25519-Sign Update Policies
 *
 * Usage:
 *   node scripts/sign-release-policy.js --edition master --version 1.0.8 --artifact dist/Bebyoon-System-Setup-1.0.8.exe
 *   node scripts/sign-release-policy.js --edition branch --version 1.0.8 --artifact dist-branch/Bebyoon-Branch-Setup-1.0.8.exe
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { canonicalizePolicy } = require('../src/main/security/update-policy.verifier');

function computeFileSha512(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha512').update(content).digest('hex');
}

function generateSignedPolicy(options = {}) {
  const {
    edition = 'master',
    version = '1.0.8',
    channel = edition === 'branch' ? 'branch' : 'latest',
    classification = 'normal',
    minSupportedVersion = '1.0.0',
    artifactPath,
    privateKeyPem,
    releaseNotes = `Elwazeer POS update v${version} (${edition})`,
    expiresInDays = 365,
  } = options;

  const isBranch = edition.toLowerCase() === 'branch';
  const productId = isBranch ? 'com.bebyoon.branch.system' : 'com.bebyoon.system';

  let artifactDigest = options.artifactDigest || 'mock-sha512-for-testing';
  let artifactName = options.artifactName || (isBranch ? `Bebyoon-Branch-Setup-${version}.exe` : `Bebyoon-System-Setup-${version}.exe`);

  if (artifactPath && fs.existsSync(artifactPath)) {
    artifactDigest = computeFileSha512(artifactPath);
    artifactName = path.basename(artifactPath);
  }

  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const policy = {
    productId,
    edition,
    channel,
    version,
    classification,
    minSupportedVersion,
    createdAt,
    expiresAt,
    artifactName,
    artifactDigest,
    releaseNotes,
  };

  let signature = '';
  if (privateKeyPem) {
    const data = Buffer.from(canonicalizePolicy(policy), 'utf8');
    signature = crypto.sign(null, data, privateKeyPem).toString('base64');
  }

  return {
    policy,
    signature,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const edition = getArg('--edition') || 'master';
  const version = getArg('--version') || '1.0.8';
  const artifact = getArg('--artifact');
  const keyFile = getArg('--key');
  const outFile = getArg('--out') || `update-policy-${edition}.json`;

  let privateKeyPem = process.env.UPDATE_PRIVATE_KEY_PEM;
  if (!privateKeyPem && keyFile && fs.existsSync(keyFile)) {
    privateKeyPem = fs.readFileSync(keyFile, 'utf8');
  }

  const signed = generateSignedPolicy({
    edition,
    version,
    artifactPath: artifact,
    privateKeyPem,
  });

  fs.writeFileSync(outFile, JSON.stringify(signed, null, 2), 'utf8');
  console.log(`✅ Generated signed policy: ${outFile}`);
}

module.exports = {
  generateSignedPolicy,
  computeFileSha512,
};
