import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { businessDays } from '../lib/dates';
import { hashInputs, type ScheduleResult } from '../types';
import type { WorkerRequest, WorkerResponse } from '../solver/worker';

export function useSolver() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = useCallback((yearMonth: string, seed?: number): Promise<ScheduleResult> => {
    const st = useStore.getState();
    const plan = st.getPlan(yearMonth);
    const input = {
      settings: st.settings,
      plan,
      days: businessDays(plan),
      seed: seed ?? (Date.now() % 2_147_483_647),
    };
    setRunning(true);
    setProgress(0);
    setError(null);
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../solver/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    return new Promise((resolve, reject) => {
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data;
        if (msg.type === 'progress') setProgress(msg.total ? msg.done / msg.total : 0);
        else if (msg.type === 'done') {
          setProgress(1);
          setRunning(false);
          const result = { ...msg.result, inputHash: hashInputs(input.settings, input.plan) };
          useStore.getState().setResult(result);
          resolve(result);
          worker.terminate();
        } else {
          setRunning(false);
          setError(msg.message);
          reject(new Error(msg.message));
          worker.terminate();
        }
      };
      worker.onerror = (e) => {
        setRunning(false);
        setError(e.message || '計算中にエラーが発生しました');
        reject(new Error(e.message));
      };
      const req: WorkerRequest = { type: 'solve', input };
      worker.postMessage(req);
    });
  }, []);

  return { running, progress, error, run };
}
