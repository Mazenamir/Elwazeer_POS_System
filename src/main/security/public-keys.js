/**
 * src/main/security/public-keys.js
 * Cryptographic Public Keys for Update Policy Verification
 *
 * ONLY contains public verification keys.
 * Private signing keys are NEVER committed, packaged, or distributed.
 */

const DEFAULT_UPDATE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlY1ygnlTBw6q9hlef536WylDvXG/L2S8v9LU4xvyY14=
-----END PUBLIC KEY-----`;

module.exports = {
  DEFAULT_UPDATE_PUBLIC_KEY_PEM,
};
