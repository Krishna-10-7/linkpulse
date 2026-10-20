// Calendar days in a named time zone. Daily rollups and charts use the workspace
// zone (Asia/Kolkata by default) so an 11 PM click in India counts for that day, not the next.

const formatters = new Map();
function partsFormatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return formatters.get(timeZone);
}

function parts(date, timeZone) {
  const o = {};
  for (const p of partsFormatter(timeZone).formatToParts(date)) o[p.type] = p.value;
  return o;
}

/** "YYYY-MM-DD" of the instant in the given zone. */
export function dayKey(date, timeZone = 'UTC') {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes the zone is ahead of UTC at that instant (330 for India). */
export function offsetMinutes(date, timeZone = 'UTC') {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant when the given calendar day starts in the zone. */
export function startOfDay(day, timeZone = 'UTC') {
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60000);
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone) {
  try { new Intl.DateTimeFormat('en', { timeZone }); return true; } catch { return false; }
}
