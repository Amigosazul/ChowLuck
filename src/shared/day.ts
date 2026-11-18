/** Calendar day as YYYY-MM-DD in the given IANA time zone. */
export function dayKey(date: Date = new Date(), timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** "11月18日 周三" for a YYYY-MM-DD key. */
export function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日 周${WEEKDAYS[wd]}`;
}

/** 1-based day of the year for a YYYY-MM-DD key. */
export function dayOfYear(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
}
