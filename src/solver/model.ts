import type { Id, MonthPlan, Settings, Violation } from '../types';
import { formatDateShort } from '../lib/dates';

export const W_BAL = 5; // 日ごとの人数のばらつき (ソフト)
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
  roleSum: number[]; // per D 役割の最低人数の合計
  expected: number[]; // per D 均した場合の出勤人数 (ソフトの目安)
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
  const roleSum = days.map((d, di) => {
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

  // 各人の月の出勤日数。
  // 空欄 (均等) の人は役割の有無に関係なく全員同じ日数にする。
  // その日数は「役割の最低人数の合計」から日数指定済みの役割保持者の分を引き、空欄の役割保持者で割って決める
  const target = new Array<number>(E).fill(0);
  const targetExplicit = emps.map((e) => e.monthlyWorkDays !== null && e.monthlyWorkDays !== undefined);
  const hasRole = (i: number) => empSkills[i].length > 0;
  const totalRoleSlots = roleSum.reduce((a, b) => a + b, 0);
  let explicitHolderDays = 0;
  emps.forEach((e, i) => {
    if (!targetExplicit[i]) return;
    target[i] = Math.min(e.monthlyWorkDays as number, availDays[i]);
    if (hasRole(i)) explicitHolderDays += target[i];
  });
  const blankHolders = emps.map((_, i) => i).filter((i) => !targetExplicit[i] && hasRole(i));
  const explicitIdx = emps.map((_, i) => i).filter((i) => targetExplicit[i]);
  let per: number;
  if (blankHolders.length > 0) per = Math.max(0, Math.round((totalRoleSlots - explicitHolderDays) / blankHolders.length));
  else if (explicitIdx.length > 0) per = Math.round(explicitIdx.reduce((a, i) => a + target[i], 0) / explicitIdx.length);
  else per = Math.round(totalRoleSlots / Math.max(1, E));
  emps.forEach((_, i) => {
    if (!targetExplicit[i]) target[i] = Math.min(per, availDays[i]);
  });
  // 日ごとの人数の目安 (全員の出勤日数の合計を営業日に均す)。ソフト制約
  const totalTarget = target.reduce((a, b) => a + b, 0);
  const expected = new Array<number>(D).fill(0);
  if (D > 0) {
    const base = Math.floor(totalTarget / D);
    let rem = totalTarget - base * D;
    for (let d = 0; d < D; d++) {
      expected[d] = Math.max(roleSum[d], base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem--;
    }
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
    roleSum,
    expected,
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
  const totalSlots = m.roleSum.reduce((a, b) => a + b, 0);
  if (totalSlots === 0) {
    out.push({ kind: 'role', severity: 'hard', message: '「この役割の人は毎日最低何人必要か」が設定されていません。初期設定で登録してください。', dates: [] });
  }
  m.days.forEach((d, di) => {
    const availList: number[] = [];
    for (let e = 0; e < m.E; e++) if (m.avail[e * m.D + di]) availList.push(e);
    // 同じ日に出勤させない組は、どちらか一方しか出せないものとして数える
    const usable = new Set(availList);
    const dropped: string[] = [];
    for (const e of availList) {
      if (!usable.has(e)) continue;
      for (const o of m.conflictsByEmp[e]) {
        if (usable.has(o)) {
          const victim = m.empSkills[o].length <= m.empSkills[e].length ? o : e;
          usable.delete(victim);
          dropped.push(`${m.empNames[e]} と ${m.empNames[o]}`);
          if (victim === e) break;
        }
      }
    }
    const remain = unfilledRoles(m, di, Array.from(usable));
    for (let s = 0; s < m.S; s++) {
      if (remain[s] > 0) {
        const why = dropped.length > 0 ? `出勤できる人全員を出しても不足。同じ日に出勤させない組 (${Array.from(new Set(dropped)).join('、')}) があるため` : '出勤できる人全員を出しても不足';
        out.push({ kind: 'role', severity: 'hard', message: `${formatDateShort(d)} は「${m.skillNames[s]}」に入れる人が ${remain[s]} 人足りません (${why})。`, dates: [d], refId: m.skillIds[s] });
      }
    }
  });
  return out;
}
