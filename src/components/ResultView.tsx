import { useMemo } from 'react';
import { CheckCircle, FileXls, Warning } from '@phosphor-icons/react';
import { useStore } from '../store';
import { WEEKDAY_LABELS, businessDays, dayOfMonth, datesOfMonth, dayStatus, formatDateShort, formatTime, holidayName, weekday } from '../lib/dates';
import { evaluate } from '../solver/evaluate';
import { exportXlsx, timeFor } from '../lib/exportSchedule';

import { hashInputs, type Violation } from '../types';

export function ResultView({ yearMonth, knownIssues = [] }: { yearMonth: string; knownIssues?: Violation[] }) {
  const settings = useStore((s) => s.settings);
  const plan = useStore((s) => s.plans[yearMonth]);
  const result = useStore((s) => s.results[yearMonth]);
  const setResult = useStore((s) => s.setResult);

  const days = useMemo(() => (plan ? businessDays(plan) : []), [plan]);
  const evalResult = useMemo(() => (plan && result ? evaluate(settings, plan, days, result.assignments) : null), [settings, plan, days, result]);

  if (!plan || !result || !evalResult) return null;

  const { model, state } = evalResult;
  // 実行前の診断に同じ不足があれば、理由の付いたその文を使う
  const key = (v: Violation) => `${v.kind}|${v.dates.join(',')}|${v.refId ?? ''}`;
  const known = new Map(knownIssues.map((v) => [key(v), v]));
  const violations = evalResult.violations.map((v) => known.get(key(v)) ?? v);
  const hard = violations.filter((v) => v.severity === 'hard');
  const soft = violations.filter((v) => v.severity === 'soft');
  const dates = datesOfMonth(yearMonth);
  const empIndex = new Map(model.empIds.map((id, i) => [id, i]));
  const badDays = new Set(hard.flatMap((v) => (v.kind === 'role' || v.kind === 'conflict' || v.kind === 'availability' ? v.dates : [])));
  const badCells = new Set(
    hard.flatMap((v) => (v.kind === 'conflict' || v.kind === 'availability' ? (v.employeeIds ?? []).flatMap((e) => v.dates.map((d) => `${e}|${d}`)) : [])),
  );

  const toggle = (empId: string, date: string) => {
    const cur = result.assignments[date] ?? [];
    const next = cur.includes(empId) ? cur.filter((x) => x !== empId) : [...cur, empId];
    const assignments = { ...result.assignments, [date]: next };
    const ev = evaluate(settings, plan, days, assignments);
    setResult({ ...result, assignments, violations: ev.violations, score: ev.score });
  };

  const generated = new Date(result.generatedAt);
  const stale = !!result.inputHash && result.inputHash !== hashInputs(settings, plan);

  return (
    <>
      <div className="section-head" style={{ marginTop: 8 }}>
        <div>
          <h2>結果</h2>
          <p className="muted small">
            {generated.getMonth() + 1}/{generated.getDate()} {generated.getHours()}:{String(generated.getMinutes()).padStart(2, '0')} に作成。セルをクリックすると手で出勤を切り替えられます。
          </p>
        </div>
        <div className="row center">
          <button className="btn btn-primary" onClick={() => exportXlsx(settings, plan, result)}>
            <FileXls size={16} /> Excel で出力
          </button>
        </div>
      </div>

      <div className="stack" style={{ marginBottom: 20 }}>
        {stale && (
          <div className="viol-item soft">
            <Warning size={18} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>この結果を作った後に設定か月の条件が変わっています。下の表は今の条件で再評価していますが、上の「シフトを組む」を押すと、今の条件で作り直せます。</span>
          </div>
        )}
        {hard.length === 0 ? (
          <div className="ok-banner">
            <CheckCircle size={20} weight="fill" /> すべての条件を満たしています
            {soft.length > 0 && <span className="muted" style={{ fontWeight: 500 }}>(出勤日数のずれが {soft.length} 件)</span>}
          </div>
        ) : (
          <ViolationList items={hard} />
        )}
        {soft.length > 0 && hard.length > 0 && <ViolationList items={soft} />}
        {soft.length > 0 && hard.length === 0 && (
          <details>
            <summary className="muted small" style={{ cursor: 'pointer' }}>
              出勤日数のずれを表示
            </summary>
            <div style={{ marginTop: 8 }}>
              <ViolationList items={soft} />
            </div>
          </details>
        )}
      </div>

      <div className="sched-wrap">
        <table className="sched">
          <thead>
            <tr>
              <th className="sticky">氏名</th>
              <th className="sticky2">出勤日数</th>
              {dates.map((d) => {
                const w = weekday(d);
                const st = dayStatus(d, plan);
                const cls = st === 'holiday' ? 'hol' : w === 0 ? 'sun' : w === 6 ? 'sat' : '';
                return (
                  <th key={d} className={cls} title={holidayName(d) ?? undefined}>
                    {dayOfMonth(d)}
                    <br />
                    {WEEKDAY_LABELS[w]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {settings.employees.map((emp) => {
              const ei = empIndex.get(emp.id)!;
              const work = state.work[ei];
              const target = model.target[ei];
              return (
                <tr key={emp.id}>
                  <td className="sticky">{emp.name}</td>
                  <td className="sticky2 num" title={work !== target ? (model.targetExplicit[ei] ? `月の出勤日数の設定は ${target} 日` : `均等に配分すると ${target} 日`) : undefined}>
                    {work} 日
                  </td>
                  {dates.map((d) => {
                    const st = dayStatus(d, plan);
                    if (st !== 'business') return <td key={d} className="off" />;
                    const on = (result.assignments[d] ?? []).includes(emp.id);
                    const wish = plan.requestedOffs[emp.id]?.includes(d);
                    const bad = badCells.has(`${emp.id}|${d}`);
                    const t = on ? timeFor(settings, plan, emp.id, d) : null;
                    const custom = !!plan.timeOffs?.[emp.id]?.[d];
                    const cls = bad ? 'cellbtn bad' : on ? `cellbtn on${custom ? ' custom' : ''}` : wish ? 'cellbtn wish' : 'cellbtn';
                    return (
                      <td key={d} className={badDays.has(d) ? 'hl' : ''}>
                        <button
                          className={cls}
                          onClick={() => toggle(emp.id, d)}
                          title={`${emp.name} ${formatDateShort(d)}${t ? ` ${formatTime(t.start)}-${formatTime(t.end)}` : ''}${wish ? ' (有給)' : ''}${custom ? ` (有給 ${plan.timeOffs[emp.id][d].start}-${plan.timeOffs[emp.id][d].end})` : ''}`}
                        >
                          {on ? (
                            <span className="cell-2l">
                              <span>{t ? `${formatTime(t.start).split(':')[0]}-${formatTime(t.end).split(':')[0]}` : '出'}</span>
                              {custom && <span className="cell-sub">有給 {formatTime(plan.timeOffs[emp.id][d].start)}-{formatTime(plan.timeOffs[emp.id][d].end)}</span>}
                            </span>
                          ) : wish ? (
                            '有給'
                          ) : (
                            ''
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky">出勤人数</td>
              <td className="sticky2" />
              {dates.map((d) => {
                const di = days.indexOf(d);
                if (di < 0) return <td key={d} className="off" />;
                const c = state.cnt[di];
                return (
                  <td key={d} className={`num${badDays.has(d) ? ' bad' : ''}`}>
                    {c}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

    </>
  );
}

function ViolationList({ items }: { items: Violation[] }) {
  return (
    <div className="viol">
      {items.map((v, i) => (
        <div key={i} className={`viol-item${v.severity === 'soft' ? ' soft' : ''}`}>
          <Warning size={18} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{v.message}</span>
        </div>
      ))}
    </div>
  );
}
