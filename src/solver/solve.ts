import type { ScheduleResult } from '../types';
import { buildModel, type Model, type SolverInput } from './model';
import { createRng } from './rng';
import { State } from './state';
import { violationsOf } from './evaluate';

export type ProgressFn = (done: number, total: number, cost: number) => void;

/** 貪欲法で初期解を作る: 役割の枠を、出勤日数に余裕のある人から埋めていく */
function greedy(m: Model, s: State, rng: ReturnType<typeof createRng>): void {
  const order = m.days.map((_, i) => i);
  for (const d of order) {
    const picked = new Set<number>();
    for (let e = 0; e < m.E; e++) {
      if (m.must[e * m.D + d]) {
        picked.add(e);
        s.flip(e, d);
      }
    }
    const remain = new Int32Array(m.S);
    for (let sk = 0; sk < m.S; sk++) remain[sk] = m.roleNeed[d * m.S + sk];
    // 希望出勤日の人が埋める枠を引く (単純に最初の役割)
    for (const e of picked) {
      for (const sk of m.empSkills[e]) {
        if (remain[sk] > 0) {
          remain[sk]--;
          break;
        }
      }
    }
    const score = (e: number) => {
      const rem = m.target[e] - s.work[e];
      let sc = rem / Math.max(1, m.target[e]) + rng.next() * 0.05;
      if (rem <= 0) sc -= 1;
      // 役割が少ない人ほど先に (融通が利かないため)
      sc += (3 - Math.min(3, m.empSkills[e].length)) * 0.1;
      return sc;
    };
    // 役割枠を、その役割を持つ人で埋める (枯渇しやすい役割から)
    const skOrder = Array.from({ length: m.S }, (_, i) => i).sort((a, b) => {
      const ha = m.empSkills.filter((l) => l.includes(a)).length;
      const hb = m.empSkills.filter((l) => l.includes(b)).length;
      return ha - hb;
    });
    for (const sk of skOrder) {
      while (remain[sk] > 0) {
        let best = -1;
        let bestScore = -Infinity;
        for (let e = 0; e < m.E; e++) {
          if (picked.has(e) || !m.avail[e * m.D + d] || !m.hasSkill[e * m.S + sk]) continue;
          if (m.conflictsByEmp[e].some((o) => picked.has(o))) continue;
          const sc = score(e);
          if (sc > bestScore) {
            bestScore = sc;
            best = e;
          }
        }
        if (best === -1) break;
        picked.add(best);
        s.flip(best, d);
        remain[sk]--;
      }
    }
  }
}

export function solve(input: SolverInput, onProgress?: ProgressFn): ScheduleResult {
  const m = buildModel(input.settings, input.plan, input.days);
  const rng = createRng(input.seed);
  const s = new State(m);
  if (m.E === 0 || m.D === 0) return toResult(input, m, s);

  greedy(m, s, rng);

  const iterations = input.iterations ?? Math.min(400_000, Math.max(60_000, m.E * m.D * 250));
  const T0 = 40;
  const T1 = 0.05;
  const alpha = Math.pow(T1 / T0, 1 / iterations);
  let T = T0;
  let best = Uint8Array.from(s.x);
  let bestCost = s.cost;
  const report = Math.max(1, Math.floor(iterations / 40));

  const availOn = (d: number, on: boolean): number[] => {
    const out: number[] = [];
    for (let e = 0; e < m.E; e++) if (m.avail[e * m.D + d] && s.is(e, d) === on) out.push(e);
    return out;
  };

  for (let it = 0; it < iterations && bestCost > 0; it++) {
    const kind = rng.next();
    let delta = 0;
    const flips: [number, number][] = [];
    if (kind < 0.45) {
      // 同じ日で出勤者と非出勤者を入れ替える
      const d = rng.int(m.D);
      const ons = availOn(d, true);
      const offs = availOn(d, false);
      if (ons.length && offs.length) {
        const e1 = rng.pick(ons);
        const e2 = rng.pick(offs);
        flips.push([e1, d], [e2, d]);
      }
    } else if (kind < 0.85) {
      // 同じ人の出勤日を別の日に動かす
      const e = rng.int(m.E);
      const ons: number[] = [];
      const offs: number[] = [];
      for (let d = 0; d < m.D; d++) {
        if (!m.avail[e * m.D + d]) continue;
        (s.is(e, d) ? ons : offs).push(d);
      }
      if (ons.length && offs.length) flips.push([e, rng.pick(ons)], [e, rng.pick(offs)]);
    } else {
      const e = rng.int(m.E);
      const d = rng.int(m.D);
      if (m.avail[e * m.D + d]) flips.push([e, d]);
    }
    if (flips.length === 0) continue;
    for (const [e, d] of flips) delta += s.flip(e, d);
    if (delta > 0 && rng.next() >= Math.exp(-delta / T)) {
      for (let i = flips.length - 1; i >= 0; i--) s.flip(flips[i][0], flips[i][1]);
    } else if (s.cost < bestCost) {
      bestCost = s.cost;
      best = Uint8Array.from(s.x);
    }
    T *= alpha;
    if (onProgress && it % report === 0) onProgress(it, iterations, bestCost);
  }
  const final = new State(m, best);
  return toResult(input, m, final);
}

function toResult(input: SolverInput, m: Model, s: State): ScheduleResult {
  const assignments: Record<string, string[]> = {};
  m.days.forEach((d, di) => {
    assignments[d] = [];
    for (let e = 0; e < m.E; e++) if (s.x[e * m.D + di]) assignments[d].push(m.empIds[e]);
  });
  return {
    yearMonth: input.plan.yearMonth,
    assignments,
    violations: violationsOf(m, s),
    score: s.cost,
    seed: input.seed,
    generatedAt: new Date().toISOString(),
  };
}
