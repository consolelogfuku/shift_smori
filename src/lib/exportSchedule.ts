import Papa from 'papaparse';
import type { MonthPlan, ScheduleResult, Settings } from '../types';
import { WEEKDAY_LABELS, dayOfMonth, datesOfMonth, dayStatus, formatTimeRange, formatYearMonth, subtractTimeOff, weekday } from './dates';
import { downloadBlob, downloadText } from './file';

/** その人のその日の基本勤務時間 */
export function timeFor(settings: Settings, plan: MonthPlan, empId: string, date: string): { start: string; end: string } | null {
  void plan;
  void date;
  const emp = settings.employees.find((e) => e.id === empId);
  const wp = settings.workPatterns.find((w) => w.id === emp?.workPatternId);
  return wp ? { start: wp.start, end: wp.end } : null;
}

/** 出力用の表記。時間休があれば実働区間を並べ、有給の時間帯を注記する */
export function timeLabel(settings: Settings, plan: MonthPlan, empId: string, date: string): string {
  const base = timeFor(settings, plan, empId, date);
  if (!base) return '出勤';
  const off = plan.timeOffs?.[empId]?.[date];
  const segs = subtractTimeOff(base, off);
  const body = segs.map((r) => formatTimeRange(r.start, r.end)).join(', ');
  return off ? `${body} (有給 ${formatTimeRange(off.start, off.end)})` : body;
}

/** 人 × 日 の表 */
export function buildScheduleTable(settings: Settings, plan: MonthPlan, result: ScheduleResult): string[][] {
  const dates = datesOfMonth(plan.yearMonth);
  const header = ['氏名', '出勤日数', ...dates.map((d) => `${dayOfMonth(d)}(${WEEKDAY_LABELS[weekday(d)]})`)];
  const rows = settings.employees.map((emp) => {
    let count = 0;
    const cells = dates.map((d) => {
      const st = dayStatus(d, plan);
      if (st !== 'business') return st === 'closed' ? '休業' : '';
      if (plan.requestedOffs[emp.id]?.includes(d)) return '有給';
      if (!(result.assignments[d] ?? []).includes(emp.id)) return '';
      count++;
      return timeLabel(settings, plan, emp.id, d);
    });
    return [emp.name, String(count), ...cells];
  });
  const counts = dates.map((d) => (dayStatus(d, plan) === 'business' ? String((result.assignments[d] ?? []).length) : ''));
  return [header, ...rows, ['出勤人数', '', ...counts]];
}

/** 日 × 出勤者 の表 */
export function buildDailyTable(settings: Settings, plan: MonthPlan, result: ScheduleResult): string[][] {
  const nameOf = new Map(settings.employees.map((e) => [e.id, e.name]));
  const rows = datesOfMonth(plan.yearMonth)
    .filter((d) => dayStatus(d, plan) === 'business')
    .map((d) => {
      const ids = result.assignments[d] ?? [];
      const names = ids.map((id) => `${nameOf.get(id) ?? '?'} (${timeLabel(settings, plan, id, d)})`);
      return [`${dayOfMonth(d)}(${WEEKDAY_LABELS[weekday(d)]})`, String(ids.length), ...names];
    });
  const width = Math.max(3, ...rows.map((r) => r.length));
  const header = ['日', '人数', ...Array.from({ length: width - 2 }, (_, i) => `出勤者${i + 1}`)];
  return [header, ...rows.map((r) => [...r, ...Array(width - r.length).fill('')])];
}

export async function exportXlsx(settings: Settings, plan: MonthPlan, result: ScheduleResult): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(buildScheduleTable(settings, plan, result));
  ws1['!cols'] = [{ wch: 14 }, { wch: 8 }, ...datesOfMonth(plan.yearMonth).map(() => ({ wch: 11 }))];
  ws1['!freeze'] = { xSplit: 2, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws1, 'シフト');
  const ws2 = XLSX.utils.aoa_to_sheet(buildDailyTable(settings, plan, result));
  ws2['!cols'] = [{ wch: 8 }, { wch: 6 }];
  XLSX.utils.book_append_sheet(wb, ws2, '日別');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `シフト_${formatYearMonth(plan.yearMonth)}.xlsx`);
}

export function exportCsv(settings: Settings, plan: MonthPlan, result: ScheduleResult): void {
  const csv = Papa.unparse(buildScheduleTable(settings, plan, result));
  downloadText(`\uFEFF${csv}`, `シフト_${formatYearMonth(plan.yearMonth)}.csv`, 'text/csv;charset=utf-8');
}
