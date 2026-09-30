const crypto = require('crypto');

function likePattern(value) {
  return `%${String(value || '').trim()}%`;
}

function newUuid(value) {
  if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return crypto.randomUUID();
}

function getInitialsFromName(name) {
  if (typeof name !== 'string') return '';
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return normalized.split(' ').map((part) => part[0]).join('').toUpperCase();
}

module.exports = {
  likePattern,
  newUuid,
  getInitialsFromName,
};
