export function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    };
    return d.toLocaleDateString('ar-EG', options);
  } catch {
    return String(dateStr);
  }
}

export function formatDateTime(dateStr) {
  return formatDate(dateStr, true);
}

export function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return 'منذ لحظات';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'أمس';
    if (diffDays < 30) return `منذ ${diffDays} يوم`;
    return formatDate(dateStr);
  } catch {
    return '';
  }
}

export function parseTimeMinutes(timeVal) {
  if (timeVal === null || timeVal === undefined) return null;
  const raw = String(timeVal).trim();
  if (!raw) return null;

  const match = raw.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:\s*(AM|PM|ص|م)|(?:Z|[+-]\d{2}:?\d{2}))?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const rawMeridiem = match[3] ? match[3].toUpperCase() : null;
  const meridiem = rawMeridiem === 'ص' ? 'AM' : (rawMeridiem === 'م' ? 'PM' : rawMeridiem);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else {
    if (hours === 24) hours = 0;
    if (hours < 0 || hours > 23) return null;
  }
  return hours * 60 + minutes;
}

export function to24HourTimeInput(timeVal) {
  const mins = parseTimeMinutes(timeVal);
  if (mins === null) return '';
  const hh = Math.floor(mins / 60) % 24;
  const mm = mins % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatTimeAmPm(timeVal) {
  const mins = parseTimeMinutes(timeVal);
  if (mins === null) return '-';
  const h24 = Math.floor(mins / 60) % 24;
  const mm = mins % 60;
  const meridiem = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${meridiem}`;
}

export function computeWorkedHHMM(checkIn, checkOut) {
  const inMin = parseTimeMinutes(checkIn);
  const outMin = parseTimeMinutes(checkOut);
  if (inMin === null || outMin === null) return '';
  let diff = outMin - inMin;
  if (diff < 0) diff += 24 * 60;
  if (diff <= 0) return '';
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`;
}

export function formatHoursHHMM(hoursVal) {
  const numericVal = Number(hoursVal);
  if (!Number.isFinite(numericVal) || numericVal <= 0) return '0:00';
  const totalMins = Math.round(Math.max(0, numericVal) * 60);
  if (!Number.isFinite(totalMins) || totalMins <= 0) return '0:00';
  return `${Math.floor(totalMins / 60)}:${String(totalMins % 60).padStart(2, '0')}`;
}

export default {
  formatDate,
  formatDateTime,
  getTodayDateString,
  formatRelativeTime,
  parseTimeMinutes,
  to24HourTimeInput,
  formatTimeAmPm,
  computeWorkedHHMM,
  formatHoursHHMM,
};
