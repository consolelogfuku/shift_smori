import holidayJp from '@holiday-jp/holiday_jp';
import type { MonthPlan } from '../types';

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function currentYearMonth(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function nextYearMonth(now = new Date()): string {
  return addMonths(currentYearMonth(now), 1);
}

export function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function formatYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${y}年${m}月`;
}

export function formatDateShort(ymd: string): string {
  const d = fromYmd(ymd);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABELS[d.getDay()]})`;
}

export function formatRange(start: string, end: string): string {
  return start === end ? formatDateShort(start) : `${formatDateShort(start)} - ${formatDateShort(end)}`;
}

export function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

export function weekday(ymd: string): number {
  return fromYmd(ymd).getDay();
}

/** その月の全日付 (YYYY-MM-DD) */
export function datesOfMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${y}-${pad2(m)}-${pad2(d)}`);
  return out;
}

export function isWeekend(ymd: string): boolean {
  const w = weekday(ymd);
  return w === 0 || w === 6;
}

export function holidayName(ymd: string): string | null {
  const h = (holidayJp.holidays as Record<string, { name: string } | undefined>)[ymd];
  return h ? h.name : null;
}

export function isJpHoliday(ymd: string): boolean {
  return holidayName(ymd) !== null;
}

export type DayStatus = 'business' | 'weekend' | 'holiday' | 'closed';

/** 営業日判定。手動の上書きが最優先 */
export function dayStatus(ymd: string, plan: MonthPlan): DayStatus {
  const ov = plan.dayOverrides[ymd];
  if (ov === 'closed') return 'closed';
  if (ov === 'open') return 'business';
  if (isWeekend(ymd)) return 'weekend';
  if (isJpHoliday(ymd)) return 'holiday';
  return 'business';
}

export function isBusinessDay(ymd: string, plan: MonthPlan): boolean {
  return dayStatus(ymd, plan) === 'business';
}

export function businessDays(plan: MonthPlan): string[] {
  return datesOfMonth(plan.yearMonth).filter((d) => isBusinessDay(d, plan));
}

export function datesBetween(start: string, end: string): string[] {
  const [s, e] = start <= end ? [start, end] : [end, start];
  const out: string[] = [];
  const cur = fromYmd(s);
  const last = fromYmd(e);
  while (cur <= last) {
    out.push(toYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** カレンダー表示用に週ごと (日曜始まり) に分割。月外は null */
export function calendarWeeks(yearMonth: string): (string | null)[][] {
  const dates = datesOfMonth(yearMonth);
  const lead = weekday(dates[0]);
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...dates];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function formatTime(t: string): string {
  // "08:30" -> "8:30", "17:00" -> "17:00"
  const [h, m] = t.split(':');
  return `${Number(h)}:${m}`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}-${formatTime(end)}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const m = Math.max(0, Math.min(24 * 60, min));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** 勤務時間から時間休を除いた実働の区間 (途中で抜ける場合は 2 区間になる) */
export function subtractTimeOff(range: { start: string; end: string }, off: { start: string; end: string } | undefined | null): { start: string; end: string }[] {
  if (!off) return [range];
  const s = timeToMinutes(range.start);
  const e = timeToMinutes(range.end);
  const os = Math.max(s, timeToMinutes(off.start));
  const oe = Math.min(e, timeToMinutes(off.end));
  if (oe <= os) return [range];
  const out: { start: string; end: string }[] = [];
  if (os > s) out.push({ start: range.start, end: minutesToTime(os) });
  if (oe < e) out.push({ start: minutesToTime(oe), end: range.end });
  return out;
}
