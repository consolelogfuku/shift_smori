import { describe, expect, it } from 'vitest';
import { buildDailyTable, buildScheduleTable } from '../lib/exportSchedule';
import { rowsToNames } from '../lib/importEmployees';
import { emptyPlan, type ScheduleResult, type Settings } from '../types';

const settings: Settings = {
  skills: [{ id: 's1', name: '受付' }],
  workPatterns: [{ id: 'w1', name: 'A勤務', start: '09:00', end: '17:00' }],
  employees: [
    { id: 'e1', name: '森 花子', skillIds: ['s1'], workPatternId: 'w1', monthlyWorkDays: null },
    { id: 'e2', name: '佐々木 純', skillIds: [], workPatternId: 'w1', monthlyWorkDays: null },
  ],
  conflictPairs: [],
  office: { defaultHeadcount: 1 },
  dailyRoleNeeds: { s1: 1 },
};

describe('export tables', () => {
  it('人×日の表に勤務時間と希望休を出す', () => {
    const plan = emptyPlan('2026-10');
    plan.requestedOffs = { e2: ['2026-10-01'] };
    plan.timeOffs = { e1: { '2026-10-02': { start: '13:00', end: '14:00' } } };
    plan.dayOverrides = { '2026-10-30': 'closed' };
    const result: ScheduleResult = {
      yearMonth: '2026-10',
      assignments: { '2026-10-01': ['e1'], '2026-10-02': ['e1'] },
      violations: [],
      score: 0,
      seed: 1,
      generatedAt: '',
    };
    const table = buildScheduleTable(settings, plan, result);
    expect(table[0].slice(0, 4)).toEqual(['氏名', '出勤日数', '1(木)', '2(金)']);
    expect(table[1].slice(0, 4)).toEqual(['森 花子', '2', '9:00-17:00', '9:00-13:00, 14:00-17:00 (有給 13:00-14:00)']);
    expect(table[2][2]).toBe('有給');
    expect(table[1][2 + 29]).toBe('休業'); // 10/30
    expect(table[1][2 + 2]).toBe(''); // 10/3 土
    const daily = buildDailyTable(settings, plan, result);
    expect(daily[1]).toEqual(['1(木)', '1', '森 花子 (9:00-17:00)']);
  });
});

describe('rowsToNames', () => {
  it('ヘッダー行と記入例を除いて氏名だけを取り出す', () => {
    expect(rowsToNames([['氏名'], ['森 花子'], [''], ['佐々木 純', '余分な列'], ['(記入例) 説明']])).toEqual(['森 花子', '佐々木 純']);
  });
  it('ヘッダーなしでも読める', () => {
    expect(rowsToNames([['森 花子'], ['佐々木 純']])).toEqual(['森 花子', '佐々木 純']);
  });
});
