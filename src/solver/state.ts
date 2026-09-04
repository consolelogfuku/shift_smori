import { W_AVAIL, W_BAL, W_CONF, W_DAYS, W_ROLE, unfilledRoles, type Model } from './model';

/** 割り当て状態と増分コスト計算 */
export class State {
  m: Model;
  x: Uint8Array;
  cnt: number[];
  work: number[];
  /** 日ごとの役割の不足人数合計 */
  roleGap: number[];
  cost = 0;

  constructor(m: Model, x?: Uint8Array) {
    this.m = m;
    this.x = x ? Uint8Array.from(x) : new Uint8Array(m.E * m.D);
    this.cnt = new Array(m.D).fill(0);
    this.work = new Array(m.E).fill(0);
    this.roleGap = new Array(m.D).fill(0);
    this.recompute();
  }

  present(d: number): number[] {
    const out: number[] = [];
    for (let e = 0; e < this.m.E; e++) if (this.x[e * this.m.D + d]) out.push(e);
    return out;
  }

  roleGapOf(d: number): number {
    const remain = unfilledRoles(this.m, d, this.present(d));
    let g = 0;
    for (let s = 0; s < this.m.S; s++) g += remain[s];
    return g;
  }

  recompute(): void {
    const { m, x } = this;
    this.cnt.fill(0);
    this.work.fill(0);
    let mustPenalty = 0;
    for (let e = 0; e < m.E; e++) {
      for (let d = 0; d < m.D; d++) {
        if (!x[e * m.D + d]) {
          if (m.must[e * m.D + d]) mustPenalty += W_AVAIL;
          continue;
        }
        this.cnt[d]++;
        this.work[e]++;
      }
    }
    let c = mustPenalty;
    for (let d = 0; d < m.D; d++) {
      c += W_BAL * Math.abs(this.cnt[d] - m.expected[d]);
      this.roleGap[d] = this.roleGapOf(d);
      c += W_ROLE * this.roleGap[d];
      for (let e = 0; e < m.E; e++) {
        if (!x[e * m.D + d]) continue;
        for (const o of m.conflictsByEmp[e]) if (o > e && x[o * m.D + d]) c += W_CONF;
      }
    }
    for (let e = 0; e < m.E; e++) c += W_DAYS * Math.abs(this.work[e] - m.target[e]);
    this.cost = c;
  }

  is(e: number, d: number): boolean {
    return this.x[e * this.m.D + d] === 1;
  }

  /** (e,d) を反転して適用。コスト差分を返す */
  flip(e: number, d: number): number {
    const { m } = this;
    const on = this.x[e * m.D + d] === 1;
    const s = on ? -1 : 1;
    let dl = 0;
    if (m.must[e * m.D + d]) dl += on ? W_AVAIL : -W_AVAIL;
    const c0 = this.cnt[d];
    dl += W_BAL * (Math.abs(c0 + s - m.expected[d]) - Math.abs(c0 - m.expected[d]));
    for (const o of m.conflictsByEmp[e]) if (this.x[o * m.D + d]) dl += s * W_CONF;
    const w0 = this.work[e];
    dl += W_DAYS * (Math.abs(w0 + s - m.target[e]) - Math.abs(w0 - m.target[e]));
    this.x[e * m.D + d] = on ? 0 : 1;
    this.cnt[d] += s;
    this.work[e] += s;
    if (m.empSkills[e].length > 0 && m.roleSum[d] > 0) {
      const g = this.roleGapOf(d);
      dl += W_ROLE * (g - this.roleGap[d]);
      this.roleGap[d] = g;
    }
    this.cost += dl;
    return dl;
  }
}
