import type { Id, MonthPlan, Settings, Violation } from '../types';
import { formatDateShort } from '../lib/dates';

export const W_HEAD = 100;
export const W_ROLE = 100;
export const W_CONF = 1000;
export const W_DAYS = 10;
export const W_AVAIL = 1000;

export interface Model {
  E: number;
  D: number;
  S: number; // 役割数
  empIds: Id[];
  empNames: string[];
  skillIds: Id[];
  skillNames: string[];
  days: string[];
  avail: Uint8Array; // E*D
  must: Uint8Array; // E*D 希望出勤日
  hasSkill: Uint8Array; // E*S
  empSkills: number[][]; // per E: 役割 index の一覧
  /** roleNeed[d*S + s] = その日に必要な役割 s の人数 */
  roleNeed: Int32Array; // D*S
  availDays: number[]; // per E
  availCount: number[]; // per D
  headcount: number[]; // per D = 役割人数の合計
  target: number[]; // per E
  targetExplicit: boolean[];
  conflictsByEmp: number[][];
}

export interface SolverInput {
  settings: Settings;
  plan: MonthPlan;
  days: string[];
  seed: number;
  iterations?: number;
}

/** その日の役割ごとの必要人数 (毎日の設定 + 日別の上書き) */
export function roleNeedsFor(settings: Settings, plan: MonthPlan, date: string): Record<Id, number> {
  const base = settings.dailyRoleNeeds ?? {};
  const ov = plan.roleNeedOverrides?.[date] ?? {};
  const out: Record<Id, number> = {};
  for (const sk of settings.skills) {
    const n = ov[sk.id] ?? base[sk.id] ?? 0;
    if (n > 0) out[sk.id] = n;
  }
  return out;
}

export function headcountFor(settings: Settings, plan: MonthPlan, date: string): number {
  return Object.values(roleNeedsFor(settings, plan, date)).reduce((a, b) => a + b, 0);
}

export function buildModel(settings: Settings, plan: MonthPlan, days: string[]): Model {
  const emps = settings.employees;
  const E = emps.length;
  const D = days.length;
  const S = settings.skills.length;
  const empIndex = new Map(emps.map((e, i) => [e.id, i]));
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const skillIndex = new Map(settings.skills.map((s, i) => [s.id, i]));

  const avail = new Uint8Array(E * D).fill(1);
  for (const [empId, offs] of Object.entries(plan.requestedOffs)) {
    const ei = empIndex.get(empId);
    if (ei === undefined) continue;
    for (const d of offs) {
      const di = dayIndex.get(d);
      if (di !== undefined) avail[ei * D + di] = 0;
    }
  }
  const must = new Uint8Array(E * D);
  const markMust = (empId: string, dates: string[]) => {
    const ei = empIndex.get(empId);
    if (ei === undefined) return;
    for (const d of dates) {
      const di = dayIndex.get(d);
      if (di !== undefined && avail[ei * D + di]) must[ei * D + di] = 1;
    }
  };
  for (const [empId, dates] of Object.entries(plan.fixedOns ?? {})) markMust(empId, dates);
  for (const [empId, byDate] of Object.entries(plan.timeOffs ?? {})) markMust(empId, Object.keys(byDate));

  const hasSkill = new Uint8Array(E * S);
  const empSkills: number[][] = emps.map((e) => {
    const list: number[] = [];
    for (const id of e.skillIds) {
      const si = skillIndex.get(id);
      if (si !== undefined) {
        list.push(si);
        hasSkill[empIndex.get(e.id)! * S + si] = 1;
      }
    }
    return list;
  });

  const roleNeed = new Int32Array(D * S);
  const headcount = days.map((d, di) => {
    const needs = roleNeedsFor(settings, plan, d);
    let total = 0;
    for (const [skillId, n] of Object.entries(needs)) {
      const si = skillIndex.get(skillId);
      if (si === undefined) continue;
      roleNeed[di * S + si] = n;
      total += n;
    }
    return total;
  });

  const availDays = Array.from({ length: E }, (_, e) => {
    let n = 0;
    for (let d = 0; d < D; d++) n += avail[e * D + d];
    return n;
  });
  const availCount = Array.from({ length: D }, (_, d) => {
    let n = 0;
    for (let e = 0; e < E; e++) n += avail[e * D + d];
    return n;
  });

  // 出勤日数の目標。明示されていない人には残り枠を均等配分
  const target = new Array<number>(E).fill(0);
  const targetExplicit = emps.map((e) => e.monthlyWorkDays !== null && e.monthlyWorkDays !== undefined);
  let totalSlots = headcount.reduce((a, b) => a + b, 0);
  emps.forEach((e, i) => {
    if (targetExplicit[i]) {
      target[i] = Math.min(e.monthlyWorkDays as number, availDays[i]);
      totalSlots -= target[i];
    }
  });
  const autoIdx = emps.map((_, i) => i).filter((i) => !targetExplicit[i]);
  let remaining = Math.max(0, totalSlots);
  while (remaining > 0) {
    let best = -1;
    for (const i of autoIdx) {
      if (target[i] >= availDays[i]) continue;
      if (best === -1 || target[i] < target[best] || (target[i] === target[best] && availDays[i] > availDays[best])) best = i;
    }
    if (best === -1) break;
    target[best]++;
    remaining--;
  }

  const conflictsByEmp: number[][] = Array.from({ length: E }, () => []);
  for (const p of settings.conflictPairs) {
    const a = empIndex.get(p.a);
    const b = empIndex.get(p.b);
    if (a === undefined || b === undefined || a === b) continue;
    conflictsByEmp[a].push(b);
    conflictsByEmp[b].push(a);
  }

  return {
    E,
    D,
    S,
    empIds: emps.map((e) => e.id),
    empNames: emps.map((e) => e.name),
    skillIds: settings.skills.map((s) => s.id),
    skillNames: settings.skills.map((s) => s.name),
    days,
    avail,
    must,
    hasSkill,
    empSkills,
    roleNeed,
    availDays,
    availCount,
    headcount,
    target,
    targetExplicit,
    conflictsByEmp,
  };
}

/**
 * その日の出勤者で役割の枠をどれだけ埋められるか。
 * 1 人は 1 つの役割枠にしか入れない。戻り値は役割ごとの「埋まらなかった人数」。
 */
export function unfilledRoles(m: Model, d: number, present: number[]): Int32Array {
  const S = m.S;
  const remain = new Int32Array(S);
  for (let s = 0; s < S; s++) remain[s] = m.roleNeed[d * S + s];
  const assignedTo = new Int32Array(present.length).fill(-1); // 出勤者 -> 役割
  const bySkill: number[][] = Array.from({ length: S }, () => []); // 役割 -> その役割に入った出勤者 idx
  const tryAssign = (pi: number, seen: Uint8Array): boolean => {
    for (const s of m.empSkills[present[pi]]) {
      if (seen[s]) continue;
      seen[s] = 1;
      if (remain[s] > 0) {
        remain[s]--;
        assignedTo[pi] = s;
        bySkill[s].push(pi);
        return true;
      }
      // 役割 s に入っている人を別の役割に動かせるか
      for (const other of bySkill[s]) {
        if (tryAssign(other, seen)) {
          bySkill[s] = bySkill[s].filter((x) => x !== other);
          assignedTo[pi] = s;
          bySkill[s].push(pi);
          return true;
        }
      }
    }
    return false;
  };
  for (let pi = 0; pi < present.length; pi++) {
    if (m.empSkills[present[pi]].length === 0) continue;
    tryAssign(pi, new Uint8Array(S));
  }
  return remain;
}

/** 探索前に分かる充足不能な条件 */
export function diagnose(m: Model): Violation[] {
  const out: Violation[] = [];
  if (m.E === 0) {
    out.push({ kind: 'availability', severity: 'hard', message: '従業員が登録されていません。', dates: [] });
    return out;
  }
  const totalSlots = m.headcount.reduce((a, b) => a + b, 0);
  if (totalSlots === 0) {
    out.push({ kind: 'role', severity: 'hard', message: 'この役割の人は毎日最低何人必要かが設定されていません。初期設定で登録してください。', dates: [] });
  }
  const noRole = m.empNames.filter((_, e) => m.empSkills[e].length === 0);
  if (noRole.length > 0) {
    out.push({ kind: 'role', severity: 'soft', message: `役割が 1 つもない従業員がいます (${noRole.join('、')})。役割の枠には入れないため出勤日が割り当たりません。`, dates: [] });
  }
  m.days.forEach((d, di) => {
    let mustCount = 0;
    const availList: number[] = [];
    for (let e = 0; e < m.E; e++) {
      mustCount += m.must[e * m.D + di];
      if (m.avail[e * m.D + di]) availList.push(e);
    }
    if (mustCount > m.headcount[di]) {
      out.push({ kind: 'headcount', severity: 'hard', message: `${formatDateShort(d)} は希望出勤日の人が ${mustCount} 人いて、必要人数 ${m.headcount[di]} 人を超えています。`, dates: [d] });
    }
    if (m.availCount[di] < m.headcount[di]) {
      out.push({ kind: 'headcount', severity: 'hard', message: `${formatDateShort(d)} は出勤できる人が ${m.availCount[di]} 人しかいないため、${m.headcount[di]} 人にできません。`, dates: [d] });
    }
    const remain = unfilledRoles(m, di, availList);
    for (let s = 0; s < m.S; s++) {
      if (remain[s] > 0) {
        out.push({ kind: 'role', severity: 'hard', message: `${formatDateShort(d)} は「${m.skillNames[s]}」に入れる人が ${remain[s]} 人足りません (出勤できる人全員を出しても不足)。`, dates: [d] });
      }
    }
  });
  const totalTarget = m.target.reduce((a, b) => a + b, 0);
  if (totalTarget !== totalSlots && totalSlots > 0) {
    out.push({ kind: 'workdays', severity: 'soft', message: `月の出勤枠は合計 ${totalSlots} 人日ですが、出勤日数の合計は ${totalTarget} 人日です。差分は出勤人数か出勤日数のどちらかが崩れます。`, dates: [] });
  }
  return out;
}
