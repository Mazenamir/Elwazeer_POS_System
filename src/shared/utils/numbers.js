function parsePositiveInt(value, fieldName = 'Value') {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const err = new Error(`${fieldName} must be a positive integer`);
    err.statusCode = 400;
    throw err;
  }
  return parsed;
}

function parseNonNegativeInt(value, fieldName = 'Value') {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    const err = new Error(`${fieldName} must be a non-negative integer`);
    err.statusCode = 400;
    throw err;
  }
  return parsed;
}

/**
 * Parse an integer from `value`, fall back to `fallback` if invalid,
 * and clamp the result to [min, max].
 */
function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const normalized = Number.isInteger(parsed) ? parsed : fallback;
  return Math.min(Math.max(normalized, min), max);
}

module.exports = {
  parsePositiveInt,
  parseNonNegativeInt,
  clampInt,
};

