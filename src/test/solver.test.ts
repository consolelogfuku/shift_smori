import { describe, expect, it } from 'vitest';
import { solve } from '../solver/solve';
import { buildModel, diagnose } from '../solver/model';
import { businessDays } from '../lib/dates';
import { emptyPlan, type Settings } from '../types';

function settings(n: number): Settings {
  const skills = [
    { id: 's1', name: '受付' },
    { id: 's2', name: '検査' },
  ];
  const wp = [{ id: 'w1', name: 'A勤務', start: '09:00', end: '17:00' }];
  const employees = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    name: `社員${i}`,
    skillIds: i % 3 === 0 ? ['s1'] : i % 3 === 1 ? ['s2'] : ['s1', 's2'],
    workPatternId: 'w1',
    monthlyWorkDays: null,
  }));
  // 受付 と 検査 をそれぞれ n/4 人ずつ毎日必要 (合計 = 出勤人数)
  const q = Math.max(1, Math.floor(n / 4));
  return { skills, workPatterns: wp, employees, conflictPairs: [{ id: 'c1', a: 'e0', b: 'e1' }], office: { defaultHeadcount: 2 * q }, dailyRoleNeeds: { s1: q, s2: q } };
}

describe('solve', () => {
  it('30人・9月で違反なしの解を出す', () => {
    const s = settings(30);
    const plan = emptyPlan('2026-09');
    plan.dayOverrides['2026-09-30'] = 'closed';
    plan.requestedOffs = { e2: ['2026-09-01', '2026-09-02'], e5: ['2026-09-15'] };
    plan.roleNeedOverrides['2026-09-07'] = { s1: 6, s2: 6 };
    const days = businessDays(plan);
    expect(days).not.toContain('2026-09-21'); // 敬老の日
    expect(days).not.toContain('2026-09-30');
    const t0 = performance.now();
    const res = solve({ settings: s, plan, days, seed: 1 });
    const ms = performance.now() - t0;
    const hard = res.violations.filter((v) => v.severity === 'hard');
    expect(hard).toEqual([]);
    expect(res.assignments['2026-09-01']).not.toContain('e2');
    expect(res.assignments['2026-09-07']).toHaveLength(12);
    expect(ms).toBeLessThan(15000);
  });

  it('充足不能な条件を診断する', () => {
    const s = settings(4);
    s.dailyRoleNeeds = { s1: 3, s2: 2 };
    const plan = emptyPlan('2026-09');
    const m = buildModel(s, plan, businessDays(plan));
    const d = diagnose(m);
    expect(d.some((v) => v.kind === 'headcount')).toBe(true);
  });
});

describe('希望出勤日', () => {
  it('時間休の日と希望出勤日は必ず出勤になる', () => {
    const s = settings(10);
    s.dailyRoleNeeds = { s1: 2, s2: 1 };
    const plan = emptyPlan('2026-10');
    plan.timeOffs = { e7: { '2026-10-06': { start: '13:00', end: '14:00' } } };
    plan.fixedOns = { e8: ['2026-10-06', '2026-10-07'] };
    const res = solve({ settings: s, plan, days: businessDays(plan), seed: 3 });
    expect(res.violations.filter((v) => v.severity === 'hard')).toEqual([]);
    expect(res.assignments['2026-10-06']).toContain('e7');
    expect(res.assignments['2026-10-06']).toContain('e8');
    expect(res.assignments['2026-10-07']).toContain('e8');
  });
});

describe('役割の枠', () => {
  it('1 人は 1 つの役割枠にしか入れない', () => {
    const s = settings(6);
    // e0: 受付, e1: 検査, e2: 両方, e3: 受付, e4: 検査, e5: 両方
    s.dailyRoleNeeds = { s1: 2, s2: 2 };
    const plan = emptyPlan('2026-10');
    const days = businessDays(plan);
    const res = solve({ settings: s, plan, days, seed: 7 });
    expect(res.violations.filter((v) => v.severity === 'hard')).toEqual([]);
    for (const d of days) expect(res.assignments[d]).toHaveLength(4);
  });
});
