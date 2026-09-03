import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, DownloadSimple, PencilSimple, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { useStore, type SettingsScreen } from '../store';
import { Empty, Field, Modal, NumberInput, useConfirm, useToast } from '../components/ui';
import { downloadEmployeeTemplate, parseEmployeeFile } from '../lib/importEmployees';
import { formatTimeRange } from '../lib/dates';
import type { Employee, Skill, WorkPattern } from '../types';


const SCREENS: Record<SettingsScreen, { title: string }> = {
  employees: { title: '従業員を登録' },
  skills: { title: '役割' },
  patterns: { title: '勤務時間' },
  assignSkills: { title: '従業員と役割の紐付け' },
  assignPatterns: { title: '従業員と勤務時間の紐付け' },
  dailyNeeds: { title: 'この役割の人は毎日最低何人必要か' },
  conflicts: { title: '同じ日に出勤させない従業員の組み合わせ' },
};

export function SettingsPage({ screen }: { screen: SettingsScreen }) {
  const meta = SCREENS[screen];
  return (
    <>
      <div className="page-head">
        <h1>{meta.title}</h1>
      </div>
      {screen === 'employees' && <EmployeesTab />}
      {screen === 'skills' && <SkillsTab />}
      {screen === 'patterns' && <PatternsTab />}
      {screen === 'assignSkills' && <AssignSkillsTab />}
      {screen === 'assignPatterns' && <AssignPatternsTab />}
      {screen === 'dailyNeeds' && <DailyNeedsTab />}
      {screen === 'conflicts' && <ConflictsTab />}
    </>
  );
}

/* ---------------- 共通: 一覧のヘッダーと行の操作 ---------------- */

function ListHead({ children }: { title?: string; description?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="row center" style={{ justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function RowActions({ onEdit, onDelete, label }: { onEdit: () => void; onDelete: () => void; label: string }) {
  return (
    <span className="row center" style={{ gap: 2, justifyContent: 'flex-end', paddingRight: 6 }}>
      <button className="icon-btn" onClick={onEdit} aria-label={`${label} を編集`} title="編集">
        <PencilSimple size={16} />
      </button>
      <button className="icon-btn danger" onClick={onDelete} aria-label={`${label} を削除`} title="削除">
        <Trash size={16} />
      </button>
    </span>
  );
}

function FormModal({ title, onClose, onSubmit, canSubmit, submitLabel, children }: { title: string; onClose: () => void; onSubmit: () => void; canSubmit: boolean; submitLabel: string; children: ReactNode }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={!canSubmit}>
            {submitLabel}
          </button>
        </>
      }
    >
      <div className="stack">{children}</div>
    </Modal>
  );
}

/* ---------------- 従業員 ---------------- */

function EmployeesTab() {
  const employees = useStore((s) => s.settings.employees);
  const addEmployee = useStore((s) => s.addEmployee);
  const updateEmployee = useStore((s) => s.updateEmployee);
  const removeEmployee = useStore((s) => s.removeEmployee);
  const [filter, setFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const visible = useMemo(() => (filter ? employees.filter((e) => e.name.includes(filter)) : employees), [employees, filter]);
  const { confirm, node: confirmNode } = useConfirm();
  const askRemove = async (emp: Employee) => {
    if (await confirm({ title: '従業員を削除', message: `${emp.name} さんを削除します。希望休や同じ日に出勤させない組の設定も一緒に消えます。` })) removeEmployee(emp.id);
  };

  return (
    <>
      <ListHead>
        {employees.length > 0 && <input className="input" placeholder="名前で絞り込む" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }} aria-label="名前で絞り込む" />}
        <button className="btn" onClick={() => setImporting(true)}>
          <UploadSimple size={16} /> Excelから一括で取り込む
        </button>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> 従業員を追加
        </button>
      </ListHead>

      {employees.length === 0 ? (
        <Empty title="まだ従業員が登録されていません">「Excelから一括で取り込む」か「従業員を追加」で登録しましょう。</Empty>
      ) : (
        <div className="table-wrap" style={{ maxHeight: '70vh' }}>
          <table className="matrix">
            <thead>
              <tr>
                <th className="cell-pad" style={{ minWidth: 220 }}>
                  氏名
                </th>
                <th className="cell-pad" style={{ minWidth: 140 }}>
                  月の出勤日数
                </th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((emp) => (
                <tr key={emp.id}>
                  <td className="cell-pad">{emp.name}</td>
                  <td className="cell-pad num">{emp.monthlyWorkDays === null ? <span className="dim">均等</span> : `${emp.monthlyWorkDays} 日`}</td>
                  <td>
                    <RowActions label={emp.name} onEdit={() => setEditing(emp)} onDelete={() => askRemove(emp)} />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={3} className="cell-pad muted">
                    「{filter}」に一致する人はいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <EmployeeForm
          employee={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            if (editing === 'new') addEmployee(v);
            else updateEmployee(editing.id, v);
            setEditing(null);
          }}
        />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {confirmNode}
    </>
  );
}

function EmployeeForm({ employee, onClose, onSave }: { employee: Employee | null; onClose: () => void; onSave: (v: { name: string; monthlyWorkDays: number | null }) => void }) {
  const [name, setName] = useState(employee?.name ?? '');
  const [days, setDays] = useState<number | null>(employee?.monthlyWorkDays ?? null);
  return (
    <FormModal title={employee ? '従業員を編集' : '従業員を追加'} onClose={onClose} canSubmit={!!name.trim()} submitLabel={employee ? '保存' : '追加'} onSubmit={() => onSave({ name: name.trim(), monthlyWorkDays: days })}>
      <Field label="氏名">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 森 花子" autoFocus />
      </Field>
      <Field label="月の出勤日数" help="空欄なら、他の人と均等になるように自動で決めます。">
        <div className="row center">
          <NumberInput value={days} onChange={setDays} min={0} max={31} placeholder="均等" ariaLabel="月の出勤日数" />
          <span className="muted">日</span>
        </div>
      </Field>
    </FormModal>
  );
}

/* ---------------- 役割 ---------------- */

function SkillsTab() {
  const skills = useStore((s) => s.settings.skills);
  const employees = useStore((s) => s.settings.employees);
  const addSkill = useStore((s) => s.addSkill);
  const renameSkill = useStore((s) => s.renameSkill);
  const removeSkill = useStore((s) => s.removeSkill);
  const [editing, setEditing] = useState<Skill | 'new' | null>(null);
  const toast = useToast();

  const { confirm, node: confirmNode } = useConfirm();
  const confirmRemove = async (sk: Skill) => {
    const users = employees.filter((e) => e.skillIds.includes(sk.id)).length;
    const message = users > 0 ? `「${sk.name}」を削除します。${users} 人から外れ、この役割を使っている期間の要件も消えます。` : `「${sk.name}」を削除します。`;
    if (await confirm({ title: '役割を削除', message })) removeSkill(sk.id);
  };

  return (
    <>
      <ListHead>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> 役割を追加
        </button>
      </ListHead>
      {skills.length === 0 ? (
        <Empty title="まだ役割が登録されていません">従業員の役割を（郵送事務・電子申請・電話対応など）登録しましょう。</Empty>
      ) : (
        <div className="table-wrap" style={{ maxWidth: 640 }}>
          <table className="matrix">
            <thead>
              <tr>
                <th className="cell-pad" style={{ minWidth: 220 }}>
                  役割名
                </th>
                <th className="cell-pad">持っている人</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {skills.map((sk) => (
                <tr key={sk.id}>
                  <td className="cell-pad">{sk.name}</td>
                  <td className="cell-pad muted num">{employees.filter((e) => e.skillIds.includes(sk.id)).length} 人</td>
                  <td>
                    <RowActions label={sk.name} onEdit={() => setEditing(sk)} onDelete={() => confirmRemove(sk)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <NameForm
          title={editing === 'new' ? '役割を追加' : '役割を編集'}
          label="役割名"
          placeholder="例: 郵送事務"
          initial={editing === 'new' ? '' : editing.name}
          submitLabel={editing === 'new' ? '追加' : '保存'}
          onClose={() => setEditing(null)}
          onSave={(n) => {
            if (skills.some((s) => s.name === n && (editing === 'new' || s.id !== editing.id))) return toast.show('同じ名前の役割があります', true);
            if (editing === 'new') addSkill(n);
            else renameSkill(editing.id, n);
            setEditing(null);
          }}
        />
      )}
      {toast.node}
      {confirmNode}
    </>
  );
}

function NameForm({ title, label, placeholder, initial, submitLabel, onClose, onSave }: { title: string; label: string; placeholder: string; initial: string; submitLabel: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <FormModal title={title} onClose={onClose} canSubmit={!!v.trim()} submitLabel={submitLabel} onSubmit={() => onSave(v.trim())}>
      <Field label={label}>
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} autoFocus />
      </Field>
    </FormModal>
  );
}

/* ---------------- 勤務時間 ---------------- */

function PatternsTab() {
  const patterns = useStore((s) => s.settings.workPatterns);
  const employees = useStore((s) => s.settings.employees);
  const addWorkPattern = useStore((s) => s.addWorkPattern);
  const updateWorkPattern = useStore((s) => s.updateWorkPattern);
  const removeWorkPattern = useStore((s) => s.removeWorkPattern);
  const [editing, setEditing] = useState<WorkPattern | 'new' | null>(null);

  const { confirm, node: confirmNode } = useConfirm();
  const confirmRemove = async (p: WorkPattern) => {
    const users = employees.filter((e) => e.workPatternId === p.id).length;
    const message = users > 0 ? `「${p.name}」を削除します。設定されている ${users} 人は勤務時間が未設定になります。` : `「${p.name}」を削除します。`;
    if (await confirm({ title: '勤務時間を削除', message })) removeWorkPattern(p.id);
  };

  return (
    <>
      <ListHead>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> 勤務時間を追加
        </button>
      </ListHead>
      {patterns.length === 0 ? (
        <Empty title="まだ勤務時間が登録されていません">A勤務 9:00-17:00 など登録しましょう。</Empty>
      ) : (
        <div className="table-wrap" style={{ maxWidth: 720 }}>
          <table className="matrix">
            <thead>
              <tr>
                <th className="cell-pad" style={{ minWidth: 160 }}>
                  名前
                </th>
                <th className="cell-pad">開始</th>
                <th className="cell-pad">終了</th>
                <th className="cell-pad">使っている人</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {patterns.map((p) => (
                <tr key={p.id}>
                  <td className="cell-pad">{p.name}</td>
                  <td className="cell-pad num">{p.start}</td>
                  <td className="cell-pad num">{p.end}</td>
                  <td className="cell-pad muted num">{employees.filter((e) => e.workPatternId === p.id).length} 人</td>
                  <td>
                    <RowActions label={p.name} onEdit={() => setEditing(p)} onDelete={() => confirmRemove(p)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmNode}
      {editing && (
        <PatternForm
          pattern={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            if (editing === 'new') addWorkPattern(v);
            else updateWorkPattern(editing.id, v);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function PatternForm({ pattern, onClose, onSave }: { pattern: WorkPattern | null; onClose: () => void; onSave: (v: Omit<WorkPattern, 'id'>) => void }) {
  const [name, setName] = useState(pattern?.name ?? '');
  const [start, setStart] = useState(pattern?.start ?? '09:00');
  const [end, setEnd] = useState(pattern?.end ?? '17:00');
  const valid = !!name.trim() && !!start && !!end && start < end;
  return (
    <FormModal title={pattern ? '勤務時間を編集' : '勤務時間を追加'} onClose={onClose} canSubmit={valid} submitLabel={pattern ? '保存' : '追加'} onSubmit={() => onSave({ name: name.trim(), start, end })}>
      <Field label="名前">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: A勤務" autoFocus />
      </Field>
      <div className="row">
        <Field label="開始">
          <input type="time" className="input input-time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="終了" error={start && end && start >= end ? '終了は開始より後にしてください' : undefined}>
          <input type="time" className="input input-time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
    </FormModal>
  );
}

/* ---------------- 役割の割り当て ---------------- */

function AssignSkillsTab() {
  const goTo = useStore((s) => s.setPage);
  const employees = useStore((s) => s.settings.employees);
  const skills = useStore((s) => s.settings.skills);
  const toggleEmployeeSkill = useStore((s) => s.toggleEmployeeSkill);
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => (filter ? employees.filter((e) => e.name.includes(filter)) : employees), [employees, filter]);

  if (employees.length === 0 || skills.length === 0) {
    return (
      <Empty
        title={employees.length === 0 ? '先に従業員を登録してください' : '先に役割を登録してください'}
        actions={
          <button className="btn btn-primary" onClick={() => goTo(employees.length === 0 ? 'employees' : 'skills')}>
            {employees.length === 0 ? '従業員を登録する' : '役割を登録する'}
          </button>
        }
      >
        
      </Empty>
    );
  }

  return (
    <>
      <ListHead>
        <input className="input" placeholder="名前で絞り込む" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }} aria-label="名前で絞り込む" />
      </ListHead>
      <div className="table-wrap" style={{ maxHeight: '70vh' }}>
        <table className="matrix">
          <thead>
            <tr>
              <th className="sticky cell-name">氏名</th>
              {skills.map((sk) => (
                <th key={sk.id} className="skill-col">
                  {sk.name}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((emp) => (
              <tr key={emp.id}>
                <td className="sticky cell-name" style={{ padding: '0 14px' }}>
                  {emp.name}
                </td>
                {skills.map((sk) => {
                  const on = emp.skillIds.includes(sk.id);
                  return (
                    <td key={sk.id} className="skill-col">
                      <button className="tick" aria-pressed={on} onClick={() => toggleEmployeeSkill(emp.id, sk.id)} aria-label={`${emp.name} の ${sk.name}`}>
                        <Check size={24} weight="bold" style={{ strokeWidth: on ? 1.5 : 0, stroke: 'currentColor' }} />
                      </button>
                    </td>
                  );
                })}
                <td />
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={2 + skills.length} className="cell-pad muted">
                  「{filter}」に一致する人はいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- 従業員と勤務時間の紐付け ---------------- */

function AssignPatternsTab() {
  const goTo = useStore((s) => s.setPage);
  const employees = useStore((s) => s.settings.employees);
  const patterns = useStore((s) => s.settings.workPatterns);
  const updateEmployee = useStore((s) => s.updateEmployee);
  const [filter, setFilter] = useState('');
  const [bulk, setBulk] = useState('');
  const visible = useMemo(() => (filter ? employees.filter((e) => e.name.includes(filter)) : employees), [employees, filter]);
  const unassigned = employees.filter((e) => !e.workPatternId || !patterns.some((p) => p.id === e.workPatternId));
  const patternOf = (id: string | null) => patterns.find((p) => p.id === id);

  if (employees.length === 0 || patterns.length === 0) {
    return (
      <Empty
        title={employees.length === 0 ? '先に従業員を登録してください' : '先に勤務時間を登録してください'}
        actions={
          <button className="btn btn-primary" onClick={() => goTo(employees.length === 0 ? 'employees' : 'patterns')}>
            {employees.length === 0 ? '従業員を登録する' : '勤務時間を登録する'}
          </button>
        }
      />
    );
  }

  return (
    <>
      <ListHead>
        <input className="input" placeholder="名前で絞り込む" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }} aria-label="名前で絞り込む" />
      </ListHead>
      {unassigned.length > 0 && (
        <div className="note row center" style={{ marginBottom: 12, gap: 10 }}>
          <span>
            未設定の従業員が <strong className="num">{unassigned.length}</strong> 人います。まとめて設定:
          </span>
          <select className="select" value={bulk} onChange={(e) => setBulk(e.target.value)} style={{ width: 220 }} aria-label="まとめて設定する勤務時間">
            <option value="">勤務時間を選ぶ</option>
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {formatTimeRange(p.start, p.end)}
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" disabled={!bulk} onClick={() => unassigned.forEach((e) => updateEmployee(e.id, { workPatternId: bulk }))}>
            未設定の {unassigned.length} 人に適用
          </button>
        </div>
      )}
      <div className="table-wrap" style={{ maxHeight: '70vh', maxWidth: 720 }}>
        <table className="matrix">
          <thead>
            <tr>
              <th className="cell-pad" style={{ minWidth: 220 }}>
                氏名
              </th>
              <th className="cell-pad" style={{ minWidth: 260 }}>
                勤務時間
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((emp) => {
              const cur = patternOf(emp.workPatternId);
              return (
                <tr key={emp.id}>
                  <td className="cell-pad">{emp.name}</td>
                  <td className="cell-pad">
                    <select className="select" value={cur?.id ?? ''} onChange={(e) => updateEmployee(emp.id, { workPatternId: e.target.value || null })} aria-label={`${emp.name} の勤務時間`} style={{ minHeight: 30, padding: '3px 8px', color: cur ? undefined : 'var(--warn-ink)' }}>
                      <option value="">未設定</option>
                      {patterns.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {formatTimeRange(p.start, p.end)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={2} className="cell-pad muted">
                  「{filter}」に一致する人はいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- Excel から一括で取り込む ---------------- */

function ImportModal({ onClose }: { onClose: () => void }) {
  const existing = useStore((s) => s.settings.employees);
  const addEmployees = useStore((s) => s.addEmployees);
  const [names, setNames] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dup = useMemo(() => new Set(existing.map((e) => e.name)), [existing]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await parseEmployeeFile(f);
      if (r.length === 0) setErr('氏名が見つかりませんでした。フォーマットの 1 列目に氏名を入れてください。');
      else {
        setErr(null);
        setNames(r);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '読み込みに失敗しました');
    }
  };

  const commit = () => {
    if (!names) return;
    addEmployees(names.map((name) => ({ name })));
    onClose();
  };

  return (
    <Modal
      title="Excelから一括で取り込む"
      onClose={onClose}
      footer={
        names ? (
          <>
            <button className="btn" onClick={() => setNames(null)}>
              戻る
            </button>
            <button className="btn btn-primary" onClick={commit}>
              {names.length} 人を登録する
            </button>
          </>
        ) : undefined
      }
    >
      {!names ? (
        <div className="stack" style={{ gap: 16 }}>
          <p>従業員登録フォーマットに氏名を記入してアップロードすると、従業員の登録が一括でできます。役割と勤務時間は登録後に紐付けます。</p>
          <div>
            <button className="btn" onClick={() => downloadEmployeeTemplate()}>
              <DownloadSimple size={16} /> 従業員登録フォーマットをダウンロード
            </button>
          </div>
          <div
            className={`dropzone${dragging ? ' over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
          >
            <UploadSimple size={28} />
            <strong>記入したフォーマットをここにドラッグ＆ドロップ</strong>
            <span className="muted small">またはクリックしてファイルを選ぶ (Excel / CSV)</span>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} onClick={(e) => e.stopPropagation()} />
          </div>
          {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
        </div>
      ) : (
        <div className="stack">
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="matrix">
              <thead>
                <tr>
                  <th className="cell-pad" style={{ width: 48 }}>
                    #
                  </th>
                  <th className="cell-pad">氏名</th>
                </tr>
              </thead>
              <tbody>
                {names.map((n, i) => (
                  <tr key={i}>
                    <td className="cell-pad dim num">{i + 1}</td>
                    <td className="cell-pad">
                      {n}
                      {dup.has(n) && (
                        <span className="chip warn" style={{ marginLeft: 8 }}>
                          同じ氏名が登録済み
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- この役割の人は毎日最低何人必要か ---------------- */

const EMPTY_NEEDS: Record<string, number> = {};

function DailyNeedsTab() {
  const goTo = useStore((s) => s.setPage);
  const skills = useStore((s) => s.settings.skills);
  const employees = useStore((s) => s.settings.employees);
  const needsRaw = useStore((s) => s.settings.dailyRoleNeeds);
  const needs = needsRaw ?? EMPTY_NEEDS;
  const setDailyRoleNeed = useStore((s) => s.setDailyRoleNeed);
  const total = skills.reduce((a, sk) => a + (needs[sk.id] ?? 0), 0);

  if (skills.length === 0) {
    return (
      <Empty
        title="先に役割を登録してください"
        actions={
          <button className="btn btn-primary" onClick={() => goTo('skills')}>
            役割を登録する
          </button>
        }
      />
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="cell-pad" style={{ minWidth: 220 }}>
                役割
              </th>
              <th className="cell-pad" style={{ minWidth: 150 }}>
                毎日の最低人数
              </th>
              <th className="cell-pad">この役割を持つ従業員</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((sk) => {
              const holders = employees.filter((e) => e.skillIds.includes(sk.id)).length;
              const n = needs[sk.id] ?? 0;
              return (
                <tr key={sk.id}>
                  <td className="cell-pad">{sk.name}</td>
                  <td className="cell-pad">
                    <span className="row center" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <NumberInput value={n} onChange={(v) => setDailyRoleNeed(sk.id, v ?? 0)} min={0} max={200} ariaLabel={`${sk.name} の毎日の最低人数`} />
                      <span className="muted">人</span>
                    </span>
                  </td>
                  <td className={`cell-pad num${holders < n ? '' : ' muted'}`} style={holders < n ? { color: 'var(--danger)' } : undefined}>
                    {holders} 人{holders < n && ' (足りません)'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="cell-pad" style={{ fontWeight: 700 }}>
                合計
              </td>
              <td className="cell-pad num" style={{ fontWeight: 700 }}>
                {total} 人
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 同日 NG ---------------- */

function ConflictsTab() {
  const employees = useStore((s) => s.settings.employees);
  const pairs = useStore((s) => s.settings.conflictPairs);
  const addConflictPair = useStore((s) => s.addConflictPair);
  const removeConflictPair = useStore((s) => s.removeConflictPair);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '(削除された人)';

  const add = () => {
    if (!a || !b || a === b) return;
    addConflictPair(a, b);
    setA('');
    setB('');
  };

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      {employees.length < 2 ? (
        <Empty title="先に従業員を 2 人以上登録してください" />
      ) : (
        <div className="row">
          <Field label="1 人目">
            <select className="select" value={a} onChange={(e) => setA(e.target.value)} style={{ width: 200 }}>
              <option value="">選ぶ</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id} disabled={e.id === b}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="2 人目">
            <select className="select" value={b} onChange={(e) => setB(e.target.value)} style={{ width: 200 }}>
              <option value="">選ぶ</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id} disabled={e.id === a}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn btn-primary" onClick={add} disabled={!a || !b || a === b}>
            <Plus size={16} /> 組にする
          </button>
        </div>
      )}
      {pairs.length > 0 && (
        <div className="row" style={{ gap: 8 }}>
          {pairs.map((p) => (
            <span key={p.id} className="chip" style={{ fontSize: 13, padding: '6px 12px' }}>
              {nameOf(p.a)} <span className="dim">と</span> {nameOf(p.b)}
              <button className="icon-btn" onClick={() => removeConflictPair(p.id)} aria-label="解除">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
