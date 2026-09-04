import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, CaretLeft, CaretRight, Minus, Play, Plus, X } from '@phosphor-icons/react';
import { PLAN_SCREENS, usePlan, useStore, type DayState, type PlanScreen } from '../store';
import {
  WEEKDAY_LABELS,
  businessDays,
  calendarWeeks,
  dayOfMonth,
  dayStatus,
  addMonths,
  formatDateShort,
  formatTime,
  formatYearMonth,
  holidayName,
  isJpHoliday,
  isWeekend,
  subtractTimeOff,
  weekday,
} from '../lib/dates';
import { buildModel, diagnose, roleNeedsFor } from '../solver/model';
import { useSolver } from '../hooks/useSolver';
import { Empty, Popover, type Anchor } from '../components/ui';
import { ResultView } from '../components/ResultView';

const SCREEN_META: Record<PlanScreen, { step: number; title: string; next?: PlanScreen; nextLabel?: string }> = {
  planMonth: { step: 1, title: '何年何月のシフトを組むか', next: 'planClosed', nextLabel: 'STEP 2 へ' },
  planClosed: { step: 2, title: '営業所の休業日を登録', next: 'planOffs', nextLabel: 'STEP 3 へ' },
  planOffs: { step: 3, title: '従業員の有給・出勤希望日を登録', next: 'planRoles', nextLabel: 'STEP 4 へ' },
  planRoles: { step: 4, title: '必要な役割を調整', next: 'planRun', nextLabel: 'STEP 5 へ' },
  planRun: { step: 5, title: 'シフトを組む' },
};

export function PlanPage({ screen }: { screen: PlanScreen }) {
  const yearMonth = useStore((s) => s.ui.yearMonth);
  const setYearMonth = useStore((s) => s.setYearMonth);
  const setPage = useStore((s) => s.setPage);
  const employees = useStore((s) => s.settings.employees);
  const meta = SCREEN_META[screen];

  return (
    <>
      <div className="page-head">
        <div className="step-head">
          <span className="step-badge">
            <span className="step-badge-label">STEP</span>
            <span className="step-badge-num num">{meta.step}</span>
            <span className="step-badge-total num">/ {PLAN_SCREENS.length}</span>
          </span>
          <h1>{meta.title}</h1>
        </div>
        <div className="row center" style={{ gap: 4 }}>
          <button className="icon-btn" onClick={() => setYearMonth(addMonths(yearMonth, -1))} aria-label="前の月">
            <CaretLeft size={18} />
          </button>
          <strong style={{ fontSize: 16, minWidth: 110, textAlign: 'center' }} className="num">
            {formatYearMonth(yearMonth)}
          </strong>
          <button className="icon-btn" onClick={() => setYearMonth(addMonths(yearMonth, 1))} aria-label="次の月">
            <CaretRight size={18} />
          </button>
        </div>
      </div>

      {employees.length === 0 ? (
        <Empty
          title="先に初期設定で従業員を登録してください"
          actions={
            <button className="btn btn-primary" onClick={() => setPage('employees')}>
              従業員を登録する
            </button>
          }
        />
      ) : (
        <>
          {screen === 'planMonth' && <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />}
          {screen === 'planClosed' && (
            <div className="stack" style={{ gap: 12 }}>
              <p className="muted">休業日をクリックしましょう。土日祝日は自動で休業日に設定されます。</p>
              <Calendar yearMonth={yearMonth} mode="closed" />
            </div>
          )}
          {screen === 'planOffs' && <OffsScreen yearMonth={yearMonth} />}
          {screen === 'planRoles' && <RolesScreen yearMonth={yearMonth} />}
          {screen === 'planRun' && <RunScreen yearMonth={yearMonth} />}
          {meta.next && (
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="btn btn-primary" onClick={() => setPage(meta.next!)}>
                {meta.nextLabel} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ---------------- 対象月の選択 ---------------- */

function MonthPicker({ yearMonth, onChange }: { yearMonth: string; onChange: (ym: string) => void }) {
  const [y, m] = yearMonth.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => thisYear - 1 + i);
  if (!years.includes(y)) years.push(y);
  years.sort();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return (
    <div className="panel panel-pad month-picker">
      <div>
        <p className="muted">組みたい月を選んでください。過去の月を見返すときもここで切り替えます。初期設定の内容はどの月にも使われます。</p>
      </div>
      <div className="row center" style={{ gap: 8 }}>
        <select className="select" value={y} onChange={(e) => onChange(`${e.target.value}-${pad(m)}`)} aria-label="年" style={{ width: 110, fontSize: 16, fontWeight: 600 }}>
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy} 年
            </option>
          ))}
        </select>
        <select className="select" value={m} onChange={(e) => onChange(`${y}-${pad(Number(e.target.value))}`)} aria-label="月" style={{ width: 96, fontSize: 16, fontWeight: 600 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
            <option key={mm} value={mm}>
              {mm} 月
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ---------------- STEP2 有給・出勤希望日 ---------------- */

function OffsScreen({ yearMonth }: { yearMonth: string }) {
  const plan = usePlan(yearMonth);
  const days = useMemo(() => businessDays(plan), [plan]);
  return <OffsGrid yearMonth={yearMonth} days={days} />;
}

/* ---------------- STEP3 必要な役割 ---------------- */

function RolesScreen({ yearMonth }: { yearMonth: string }) {
  const plan = usePlan(yearMonth);
  const settings = useStore((s) => s.settings);
  const setPage = useStore((s) => s.setPage);
  const days = useMemo(() => businessDays(plan), [plan]);
  const issues = useMemo(() => diagnose(buildModel(settings, plan, days)), [settings, plan, days]);
  const base = settings.dailyRoleNeeds ?? {};
  const baseTotal = settings.skills.reduce((a, sk) => a + (base[sk.id] ?? 0), 0);
  if (settings.skills.length === 0 || baseTotal === 0) {
    return (
      <Empty
        title="この役割の人は毎日最低何人必要かが設定されていません"
        actions={
          <button className="btn btn-primary" onClick={() => setPage(settings.skills.length === 0 ? 'skills' : 'dailyNeeds')}>
            {settings.skills.length === 0 ? '役割を登録する' : '「この役割の人は毎日最低何人必要か」を設定する'}
          </button>
        }
      />
    );
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted">
        毎日の設定は {settings.skills.filter((sk) => (base[sk.id] ?? 0) > 0).map((sk) => `${sk.name} ${base[sk.id]} 人`).join('、')}（合計 {baseTotal} 人）です。人数を変えたい日をクリックしましょう。
      </p>
      <Calendar yearMonth={yearMonth} mode="roles" issues={issues} />
    </div>
  );
}

/* ---------------- STEP4 組む ---------------- */

function RunScreen({ yearMonth }: { yearMonth: string }) {
  const plan = usePlan(yearMonth);
  const settings = useStore((s) => s.settings);
  const hasResult = useStore((s) => !!s.results[yearMonth]);
  const solver = useSolver();
  const days = useMemo(() => businessDays(plan), [plan]);
  const model = useMemo(() => buildModel(settings, plan, days), [settings, plan, days]);
  const issues = useMemo(() => diagnose(model), [model]);
  const totalDays = model.target.reduce((a, b) => a + b, 0);
  const roleSlots = model.roleSum.reduce((a, b) => a + b, 0);
  const offs = Object.values(plan.requestedOffs).reduce((a, l) => a + l.length, 0);

  const run = async () => {
    try {
      await solver.run(yearMonth);
      setTimeout(() => document.getElementById('result-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch {
      /* solver.error に表示 */
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="panel panel-pad" style={{ maxWidth: 760 }}>
        <table style={{ borderCollapse: 'collapse' }} className="num">
          <tbody>
            {[
              ['営業日', `${days.length} 日`],
              ['従業員', `${settings.employees.length} 人`],
              ['役割の最低人数の合計', `${roleSlots} 人日`],
              ['全員の出勤日数の合計', `${totalDays} 人日`],
              ['有給 (終日)', `${offs} 件`],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="muted" style={{ padding: '3px 24px 3px 0' }}>
                  {k}
                </td>
                <td style={{ padding: '3px 0', fontWeight: 600 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row center">
        <button className="btn btn-primary btn-lg" onClick={run} disabled={solver.running || days.length === 0 || roleSlots === 0}>
          <Play size={18} weight="fill" /> {solver.running ? '計算中' : 'シフトを組む'}
        </button>
      </div>
      {solver.running && (
        <div className="progress" aria-label="進行状況">
          <div style={{ width: `${Math.round(solver.progress * 100)}%` }} />
        </div>
      )}
      {solver.error && <p style={{ color: 'var(--danger)' }}>{solver.error}</p>}
      {hasResult && (
        <div id="result-view" style={{ marginTop: 12 }}>
          <ResultView yearMonth={yearMonth} knownIssues={issues} />
        </div>
      )}
    </div>
  );
}

/* ---------------- カレンダー ---------------- */

type CalMode = 'closed' | 'roles';

function Calendar({ yearMonth, mode, issues = [] }: { yearMonth: string; mode: CalMode; issues?: ReturnType<typeof diagnose> }) {
  const settings = useStore((s) => s.settings);
  const plan = usePlan(yearMonth);
  const toggleDayOverride = useStore((s) => s.toggleDayOverride);
  const [rolePop, setRolePop] = useState<{ anchor: Anchor; date: string } | null>(null);
  const weeks = useMemo(() => calendarWeeks(yearMonth), [yearMonth]);
  const badDays = useMemo(() => new Set(issues.filter((v) => v.severity === 'hard').flatMap((v) => v.dates)), [issues]);
  const closeRole = useCallback(() => setRolePop(null), []);

  return (
    <div className={`cal panel cal-${mode}`}>
      <div className="cal-head">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const minH = mode === 'closed' ? 72 : 96;
        return (
          <div key={wi} className="cal-week">
            {week.map((d, i) => {
              if (!d) return <div key={i} className="cal-day outside" style={{ minHeight: minH }} />;
              const st = dayStatus(d, plan);
              const business = st === 'business';
              const defaultBusiness = !isWeekend(d) && !isJpHoliday(d);
              const hol = holidayName(d);
              const needs = mode === 'roles' && business ? roleNeedsFor(settings, plan, d) : null;
              const overridden = !!plan.roleNeedOverrides?.[d];
              const total = needs ? Object.values(needs).reduce((a, b) => a + b, 0) : 0;
              const clickable = mode === 'closed' || business;
              return (
                <div
                  key={d}
                  className={`cal-day${business ? '' : ' off'}${rolePop?.date === d ? ' selected' : ''}${clickable ? '' : ' static'}${badDays.has(d) ? ' bad' : ''}`}
                  style={{ minHeight: minH }}
                  role={clickable ? 'button' : undefined}
                  aria-label={mode === 'closed' ? `${formatDateShort(d)} を${business ? '休業日にする' : '営業日にする'}` : business ? `${formatDateShort(d)} の必要な役割を変える` : undefined}
                  onClick={(e) => {
                    if (mode === 'closed') toggleDayOverride(yearMonth, d, defaultBusiness);
                    else if (business) setRolePop({ anchor: { x: e.clientX, y: e.clientY }, date: d });
                  }}
                >
                  <div className="cal-day-top">
                    <span className="cal-date num">{dayOfMonth(d)}</span>
                    {mode === 'closed' && (defaultBusiness || plan.dayOverrides[d]) && (
                      <span className="cal-x" aria-hidden>
                        <X size={14} weight="bold" />
                      </span>
                    )}
                    {needs && <span className={`cal-count num${overridden ? ' override' : ''}`}>{total}人</span>}
                  </div>
                  {needs && (
                    <div className="cal-roles">
                      {settings.skills
                        .filter((sk) => (needs[sk.id] ?? 0) > 0)
                        .map((sk) => (
                          <span key={sk.id} className={`cal-role${plan.roleNeedOverrides?.[d]?.[sk.id] !== undefined ? ' override' : ''}`}>
                            {sk.name} <b className="num">{needs[sk.id]}</b>
                          </span>
                        ))}
                    </div>
                  )}
                  {hol && st !== 'business' && <span className="hol">{hol}</span>}
                  {st === 'closed' && <span className="closed-mark">休業</span>}
                  {st === 'business' && !defaultBusiness && <span className="closed-mark" style={{ color: 'var(--accent-ink)' }}>営業{hol ? ` (${hol})` : ''}</span>}
                </div>
              );
            })}
          </div>
        );
      })}
      {rolePop && <RoleNeedPopover yearMonth={yearMonth} date={rolePop.date} anchor={rolePop.anchor} onClose={closeRole} />}
    </div>
  );
}

function RoleNeedPopover({ yearMonth, date, anchor, onClose }: { yearMonth: string; date: string; anchor: Anchor; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const plan = usePlan(yearMonth);
  const setRoleNeedOverride = useStore((s) => s.setRoleNeedOverride);
  const needs = roleNeedsFor(settings, plan, date);
  const base = settings.dailyRoleNeeds ?? {};
  const ov = plan.roleNeedOverrides?.[date] ?? {};
  const total = Object.values(needs).reduce((a, b) => a + b, 0);
  const holders = (skillId: string) => settings.employees.filter((e) => e.skillIds.includes(skillId)).length;
  return (
    <Popover anchor={anchor} onClose={onClose} title={`${formatDateShort(date)} に必要な役割`}>
      <div className="stack" style={{ minWidth: 300, gap: 6 }}>
        {settings.skills.map((sk) => {
          const n = needs[sk.id] ?? 0;
          const changed = ov[sk.id] !== undefined && ov[sk.id] !== (base[sk.id] ?? 0);
          return (
            <div key={sk.id} className="row center" style={{ justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontWeight: changed ? 700 : 500 }}>
                {sk.name}
                <span className="dim small" style={{ marginLeft: 6 }}>
                  基本 {base[sk.id] ?? 0} / 保持 {holders(sk.id)} 人
                </span>
              </span>
              <span className="row center" style={{ gap: 4 }}>
                <button className="icon-btn" onClick={() => setRoleNeedOverride(yearMonth, date, sk.id, Math.max(0, n - 1))} disabled={n <= 0} aria-label={`${sk.name} を減らす`}>
                  <Minus size={14} weight="bold" />
                </button>
                <strong className="num" style={{ width: 28, textAlign: 'center', color: changed ? 'var(--accent-ink)' : undefined }}>
                  {n}
                </strong>
                <button className="icon-btn" onClick={() => setRoleNeedOverride(yearMonth, date, sk.id, n + 1)} aria-label={`${sk.name} を増やす`}>
                  <Plus size={14} weight="bold" />
                </button>
              </span>
            </div>
          );
        })}
        <div className="row center" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line-2)', paddingTop: 8, marginTop: 4 }}>
          <span className="muted small">合計</span>
          <strong className="num">{total} 人</strong>
        </div>
        <div className="actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            保存
          </button>
        </div>
      </div>
    </Popover>
  );
}

/* ---------------- 従業員 × 日 の表 ---------------- */

function OffsGrid({ yearMonth, days }: { yearMonth: string; days: string[] }) {
  const settings = useStore((s) => s.settings);
  const plan = usePlan(yearMonth);
  const getDayState = useStore((s) => s.getDayState);
  const setDayState = useStore((s) => s.setDayState);
  const [pop, setPop] = useState<{ anchor: Anchor; empId: string; date: string } | null>(null);
  const close = useCallback(() => setPop(null), []);

  const patternOf = (empId: string) => {
    const emp = settings.employees.find((e) => e.id === empId);
    return settings.workPatterns.find((w) => w.id === emp?.workPatternId) ?? null;
  };

  if (days.length === 0) return <Empty title="この月に営業日がありません" />;

  const cellLabel = (st: DayState) => (st.kind === 'off' ? '有給' : st.kind === 'timeoff' ? `${formatTime(st.start)}-${formatTime(st.end)}` : st.kind === 'fixed' ? '出勤' : '');
  const cellClass = (st: DayState) => (st.kind === 'off' || st.kind === 'timeoff' ? ' wish' : st.kind === 'fixed' ? ' fixed' : '');
  const popEmp = pop ? settings.employees.find((e) => e.id === pop.empId) : null;

  return (
    <>
      <div className="sched-wrap" style={{ maxHeight: '70vh' }}>
        <table className="sched">
          <thead>
            <tr>
              <th className="sticky">氏名</th>
              {days.map((d) => (
                <th key={d}>
                  {dayOfMonth(d)}
                  <br />
                  {WEEKDAY_LABELS[weekday(d)]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.employees.map((emp) => (
              <tr key={emp.id}>
                <td className="sticky">{emp.name}</td>
                {days.map((d) => {
                  const st = getDayState(plan, emp.id, d);
                  return (
                    <td key={d}>
                      <button className={`cellbtn${cellClass(st)}`} onClick={(e) => setPop({ anchor: { x: e.clientX, y: e.clientY }, empId: emp.id, date: d })} title={`${emp.name} ${formatDateShort(d)}`}>
                        {cellLabel(st)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cal-legend" style={{ marginTop: 8 }}>
        <span>
          <i className="swatch" style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }} /> 有給 (終日は「有給」、時間休は休む時間帯)
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--accent-soft-2)', borderColor: 'transparent' }} /> 希望出勤日
        </span>
      </div>
      {pop && popEmp && (
        <DayStatePopover
          key={`${pop.empId}|${pop.date}`}
          anchor={pop.anchor}
          title={`${popEmp.name} ${formatDateShort(pop.date)}`}
          initial={getDayState(plan, pop.empId, pop.date)}
          base={patternOf(pop.empId)}
          onClose={close}
          onApply={(st) => {
            setDayState(yearMonth, pop.empId, pop.date, st);
            close();
          }}
        />
      )}
    </>
  );
}

function DayStatePopover({ anchor, title, initial, base, onClose, onApply }: { anchor: Anchor; title: string; initial: DayState; base: { start: string; end: string } | null; onClose: () => void; onApply: (st: DayState) => void }) {
  const [kind, setKind] = useState<DayState['kind']>(initial.kind === 'none' ? 'off' : initial.kind);
  const day = base ?? { start: '09:00', end: '18:00' };
  const [start, setStart] = useState(initial.kind === 'timeoff' ? initial.start : day.start);
  const [end, setEnd] = useState(initial.kind === 'timeoff' ? initial.end : day.end);
  const inRange = start >= day.start && end <= day.end;
  const valid = kind !== 'timeoff' || (!!start && !!end && start < end && inRange && !(start === day.start && end === day.end));
  const preview = kind === 'timeoff' && start < end ? subtractTimeOff(day, { start, end }) : null;

  const apply = () => {
    if (kind === 'off') return onApply({ kind: 'off' });
    if (kind === 'fixed') return onApply({ kind: 'fixed' });
    if (kind === 'timeoff') return onApply({ kind: 'timeoff', start, end });
  };

  const Option = ({ value, label, children }: { value: DayState['kind']; label: string; children?: React.ReactNode }) => (
    <label className={`opt${kind === value ? ' on' : ''}`}>
      <input type="radio" name="daystate" checked={kind === value} onChange={() => setKind(value)} />
      <span className="opt-body">
        <span>{label}</span>
        {kind === value && children}
      </span>
    </label>
  );

  return (
    <Popover anchor={anchor} onClose={onClose} title={title}>
      <div className="stack" style={{ minWidth: 320, gap: 6 }}>
        <div className="dim small">
          勤務時間 {base ? `${formatTime(base.start)}-${formatTime(base.end)}` : '未設定'}
        </div>
        <Option value="off" label="有給 (終日)" />
        <Option value="timeoff" label="有給 (時間休)">
          <span className="row center" style={{ gap: 6, marginTop: 6 }}>
            <input type="time" className="input input-time" value={start} min={day.start} max={day.end} onChange={(e) => setStart(e.target.value)} aria-label="時間休の開始" />
            <span className="dim">から</span>
            <input type="time" className="input input-time" value={end} min={day.start} max={day.end} onChange={(e) => setEnd(e.target.value)} aria-label="時間休の終了" />
            <span className="dim">まで休み</span>
          </span>
          {kind === 'timeoff' && start && end && !inRange && <span className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>勤務時間の範囲内で指定してください。</span>}
          {preview && (
            <span className="dim small num" style={{ marginTop: 4 }}>
              実働 {preview.map((r) => `${formatTime(r.start)}-${formatTime(r.end)}`).join(', ')}
            </span>
          )}
          {kind === 'timeoff' && start === day.start && end === day.end && <span className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>終日になります。「有給 (終日)」を選んでください。</span>}
        </Option>
        <Option value="fixed" label="希望出勤日" />
        <div className="actions" style={{ justifyContent: initial.kind !== 'none' ? 'space-between' : 'flex-end' }}>
          {initial.kind !== 'none' && (
            <button className="btn btn-ghost btn-sm btn-danger" onClick={() => onApply({ kind: 'none' })}>
              解除
            </button>
          )}
          <span className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={onClose}>
              キャンセル
            </button>
            <button className="btn btn-primary btn-sm" onClick={apply} disabled={!valid}>
              適用
            </button>
          </span>
        </div>
      </div>
    </Popover>
  );
}
