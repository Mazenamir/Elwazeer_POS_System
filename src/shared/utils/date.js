const { CAIRO_TIME_ZONE, CAIRO_NOW_SQL, CAIRO_DATE_SQL } = require('../constants/system');

function getCairoDateTimeParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function getMonthKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function daysBetween(start, end) {
  const ms = new Date(dateOnly(end)).getTime() - new Date(dateOnly(start)).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

async function getDatabaseCairoNow(db) {
  if (!db || db._isBranchMode) {
    const parts = getCairoDateTimeParts();
    return {
      cairo_now: `${parts.date}T${parts.time}:00`,
      cairo_date: parts.date,
      epoch_ms: Date.now(),
      iso_local: `${parts.date}T${parts.time}:00`,
      date: parts.date,
      time: parts.time,
      month: parts.date.substring(0, 7),
    };
  }

  const { rows } = await db.query(`
    SELECT
      ${CAIRO_NOW_SQL} AS cairo_now,
      ${CAIRO_DATE_SQL} AS cairo_date,
      FLOOR(EXTRACT(EPOCH FROM now()) * 1000)::bigint AS epoch_ms,
      TO_CHAR(${CAIRO_NOW_SQL}, 'YYYY-MM-DD"T"HH24:MI:SS') AS iso_local,
      TO_CHAR(${CAIRO_NOW_SQL}, 'YYYY-MM-DD') AS date,
      TO_CHAR(${CAIRO_NOW_SQL}, 'HH24:MI') AS time,
      TO_CHAR(${CAIRO_NOW_SQL}, 'YYYY-MM') AS month
  `);
  return rows[0];
}

module.exports = {
  CAIRO_TIME_ZONE,
  getCairoDateTimeParts,
  getMonthKey,
  dateOnly,
  daysBetween,
  getDatabaseCairoNow,
};
