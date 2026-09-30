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

module.exports = {
  parsePositiveInt,
  parseNonNegativeInt,
};
