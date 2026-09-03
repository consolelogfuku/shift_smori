import type { Id, MonthPlan, ScheduleResult, Settings, Violation } from '../types';
import { formatDateShort } from '../lib/dates';
import { buildModel, unfilledRoles, type Model } from './model';
import { State } from './state';

export function violationsOf(m: Model, s: State): Violation[] {
  const out: Violation[] = [];
  m.days.forEach((d, di) => {
    for (let e = 0; e < m.E; e++) {
      if (s.x[e * m.D + di] && !m.avail[e * m.D + di]) {
        out.push({
          kind: 'availability',
          severity: 'hard',
          message: `${formatDateShort(d)} は ${m.empNames[e]} さんの有給ですが出勤になっています。`,
          dates: [d],
          employeeIds: [m.empIds[e]],
        });
      }
    }
    for (let e = 0; e < m.E; e++) {
      if (m.must[e * m.D + di] && !s.x[e * m.D + di]) {
        out.push({
          kind: 'availability',
          severity: 'hard',
          message: `${formatDateShort(d)} は ${m.empNames[e]} さんの希望出勤日ですが休みになっています。`,
          dates: [d],
          employeeIds: [m.empIds[e]],
        });
      }
    }
    if (s.cnt[di] !== m.headcount[di]) {
      out.push({
        kind: 'headcount',
        severity: 'hard',
        message: `${formatDateShort(d)} の出勤は ${s.cnt[di]} 人です (必要 ${m.headcount[di]} 人)。`,
        dates: [d],
      });
    }
    if (m.headcount[di] > 0) {
      const remain = unfilledRoles(m, di, s.present(di));
      for (let sk = 0; sk < m.S; sk++) {
        if (remain[sk] > 0) {
          out.push({ kind: 'role', severity: 'hard', message: `${formatDateShort(d)} は「${m.skillNames[sk]}」が ${remain[sk]} 人足りません。`, dates: [d] });
        }
      }
    }
    for (let e = 0; e < m.E; e++) {
      if (!s.x[e * m.D + di]) continue;
      for (const o of m.conflictsByEmp[e]) {
        if (o > e && s.x[o * m.D + di]) {
          out.push({
            kind: 'conflict',
            severity: 'hard',
            message: `${formatDateShort(d)} に ${m.empNames[e]} さんと ${m.empNames[o]} さんが同時に出勤しています。`,
            dates: [d],
            employeeIds: [m.empIds[e], m.empIds[o]],
          });
        }
      }
    }
  });
  for (let e = 0; e < m.E; e++) {
    if (s.work[e] !== m.target[e]) {
      out.push({
        kind: 'workdays',
        severity: 'soft',
        message: `${m.empNames[e]} さんの出勤は ${s.work[e]} 日です (目標 ${m.target[e]} 日)。`,
        dates: [],
        employeeIds: [m.empIds[e]],
      });
    }
  }
  return out;
}

/** 手直し後の再評価に使う */
export function evaluate(
  settings: Settings,
  plan: MonthPlan,
  days: string[],
  assignments: Record<string, Id[]>,
): Pick<ScheduleResult, 'violations' | 'score'> & { model: Model; state: State } {
  const m = buildModel(settings, plan, days);
  const x = new Uint8Array(m.E * m.D);
  const empIndex = new Map(m.empIds.map((id, i) => [id, i]));
  days.forEach((d, di) => {
    for (const id of assignments[d] ?? []) {
      const e = empIndex.get(id);
      if (e !== undefined) x[e * m.D + di] = 1;
    }
  });
  const s = new State(m, x);
  return { violations: violationsOf(m, s), score: s.cost, model: m, state: s };
}
