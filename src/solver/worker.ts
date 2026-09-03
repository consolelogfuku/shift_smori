import type { SolverInput } from './model';
import { solve } from './solve';

export type WorkerRequest = { type: 'solve'; input: SolverInput };
export type WorkerResponse =
  | { type: 'progress'; done: number; total: number; cost: number }
  | { type: 'done'; result: ReturnType<typeof solve> }
  | { type: 'error'; message: string };

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type !== 'solve') return;
  try {
    const result = solve(msg.input, (done, total, cost) => {
      const res: WorkerResponse = { type: 'progress', done, total, cost };
      self.postMessage(res);
    });
    const res: WorkerResponse = { type: 'done', result };
    self.postMessage(res);
  } catch (e) {
    const res: WorkerResponse = { type: 'error', message: e instanceof Error ? e.message : String(e) };
    self.postMessage(res);
  }
};
