/**
 * src/main/security/update-policy.verifier.js
 * Cryptographic & Contractual Update Policy Verifier
 *
 * Enforces:
 * - Ed25519 digital signature authenticity
 * - Edition & App ID isolation (Master vs Branch)
 * - Channel verification ('latest' vs 'branch')
 * - Anti-downgrade protections
 * - Policy expiration checks
 * - SHA-512 artifact digest integrity verification
 */

const crypto = require('crypto');
const fs = require('fs');
const { DEFAULT_UPDATE_PUBLIC_KEY_PEM } = require('./public-keys');

/**
 * Compare two semver strings (e.g. '1.0.8' vs '1.0.7')
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2
 */
function compareSemver(v1, v2) {
  if (typeof v1 !== 'string' || typeof v2 !== 'string') return 0;
  const clean1 = v1.replace(/^v/, '').trim();
  const clean2 = v2.replace(/^v/, '').trim();

  const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Deterministically stringify policy for cryptographic signature
 */
function canonicalizePolicy(policy) {
  if (!policy || typeof policy !== 'object') return '';
  const sortedKeys = Object.keys(policy).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    sortedObj[k] = policy[k];
  }
  return JSON.stringify(sortedObj);
}

/**
 * Verify Ed25519 digital signature of an update policy
 */
function verifyPolicySignature(policy, signatureBase64, publicKeyPem = DEFAULT_UPDATE_PUBLIC_KEY_PEM) {
  if (!policy || !signatureBase64) {
    return { valid: false, error: 'missing_policy_or_signature' };
  }

  try {
    const data = Buffer.from(canonicalizePolicy(policy), 'utf8');
    const signature = Buffer.from(signatureBase64, 'base64');
    const isValid = crypto.verify(null, data, publicKeyPem, signature);
    return { valid: isValid, error: isValid ? null : 'invalid_digital_signature' };
  } catch (err) {
    return { valid: false, error: `signature_verification_error: ${err.message}` };
  }
}

/**
 * Validate policy contract against runtime edition, app ID, channel, and version
 */
function validatePolicyContract(policy, currentConfig = {}) {
  const {
    expectedAppId = 'com.bebyoon.system',
    expectedEdition = 'master',
    expectedChannel = 'latest',
    currentVersion = '1.0.8',
    allowDowngrade = false,
  } = currentConfig;

  if (!policy || typeof policy !== 'object') {
    return { valid: false, error: 'malformed_policy_object' };
  }

  // 1. Mandatory fields presence
  const requiredFields = [
    'productId',
    'edition',
    'channel',
    'version',
    'classification',
    'createdAt',
    'expiresAt',
    'artifactName',
    'artifactDigest',
  ];
  for (const f of requiredFields) {
    if (!policy[f]) {
      return { valid: false, error: `missing_required_policy_field: ${f}` };
    }
  }

  // 2. Strict App ID matching
  if (policy.productId !== expectedAppId) {
    return {
      valid: false,
      error: `app_id_mismatch: policy is for '${policy.productId}', but running app is '${expectedAppId}'`,
    };
  }

  // 3. Strict Edition matching (Master vs Branch Isolation)
  if (policy.edition.toLowerCase() !== expectedEdition.toLowerCase()) {
    return {
      valid: false,
      error: `edition_mismatch: policy is for edition '${policy.edition}', but running edition is '${expectedEdition}'`,
    };
  }

  // 4. Strict Channel matching
  if (policy.channel.toLowerCase() !== expectedChannel.toLowerCase()) {
    return {
      valid: false,
      error: `channel_mismatch: policy is on channel '${policy.channel}', expected '${expectedChannel}'`,
    };
  }

  // 5. Expiration check
  const expiresAtMs = Date.parse(policy.expiresAt);
  if (isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    return { valid: false, error: `policy_expired: expired at ${policy.expiresAt}` };
  }

  // 6. Classification validity
  if (!['normal', 'critical'].includes(policy.classification)) {
    return { valid: false, error: `unknown_update_classification: ${policy.classification}` };
  }

  // 7. Version comparison & anti-downgrade check
  if (!allowDowngrade && compareSemver(policy.version, currentVersion) < 0) {
    return {
      valid: false,
      error: `downgrade_rejected: target version '${policy.version}' is older than current '${currentVersion}'`,
    };
  }

  // 8. Minimum supported version check
  if (policy.minSupportedVersion && compareSemver(currentVersion, policy.minSupportedVersion) < 0) {
    return {
      valid: false,
      error: `unsupported_current_version: current '${currentVersion}' is below required minimum '${policy.minSupportedVersion}'`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Verifies SHA-512 digest of a downloaded file against expected hex or base64 digest
 */
function verifyFileSha512(filePath, expectedDigest) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      return resolve({ valid: false, error: 'file_not_found' });
    }

    try {
      const hash = crypto.createHash('sha512');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => {
        const hex = hash.digest('hex');
        const cleanExpected = expectedDigest.replace(/^sha512[-:]/i, '').trim();

        // Match either hex or base64 representation
        let match = (hex.toLowerCase() === cleanExpected.toLowerCase());
        if (!match) {
          const base64 = Buffer.from(hex, 'hex').toString('base64');
          match = (base64 === cleanExpected);
        }

        if (match) {
          resolve({ valid: true, actualDigest: hex, error: null });
        } else {
          resolve({
            valid: false,
            actualDigest: hex,
            error: `digest_mismatch: expected ${cleanExpected}, calculated ${hex}`,
          });
        }
      });

      stream.on('error', (err) => {
        resolve({ valid: false, error: `stream_read_error: ${err.message}` });
      });
    } catch (err) {
      resolve({ valid: false, error: `hash_calculation_error: ${err.message}` });
    }
  });
}

module.exports = {
  compareSemver,
  canonicalizePolicy,
  verifyPolicySignature,
  validatePolicyContract,
  verifyFileSha512,
};
