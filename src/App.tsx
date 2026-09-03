import { useEffect, useRef, useState } from 'react';
import { CaretDown, DownloadSimple, Key, LockKey, Question, Table, UploadSimple } from '@phosphor-icons/react';
import { PLAN_SCREENS, SETTINGS_SCREENS, parseAppData, useStore, type Page, type PlanScreen, type SettingsScreen } from './store';
import { SettingsPage } from './pages/SettingsPage';
import { PlanPage } from './pages/PlanPage';
import { Tutorial } from './components/Tutorial';
import { LockScreen } from './components/LockScreen';
import { Field, Modal, useToast } from './components/ui';
import { downloadText, readFileAsText, todayStamp } from './lib/file';
import { changePassphrase, flushWrites, hasEncryptedData, legacyPlainData, lock } from './lib/secureStorage';
import type { AppData } from './types';

const SETTINGS_LABELS: Record<SettingsScreen, string> = {
  employees: '従業員を登録',
  skills: '役割',
  patterns: '勤務時間',
  assignSkills: '従業員と役割の紐付け',
  assignPatterns: '従業員と勤務時間の紐付け',
  dailyNeeds: 'この役割の人は毎日最低何人必要か',
  conflicts: '同じ日に出勤させない従業員の組み合わせ',
};

const PLAN_LABELS: Record<PlanScreen, string> = {
  planClosed: 'STEP1 営業所の休業日を登録',
  planOffs: 'STEP2 有給・出勤希望日を登録',
  planRoles: 'STEP3 必要な役割を調整',
  planRun: 'STEP4 シフトを組む',
};

type Gate = 'checking' | 'setup' | 'unlock' | 'ready';

export function App() {
  const [gate, setGate] = useState<Gate>('checking');
  const [hasLegacy, setHasLegacy] = useState(false);

  useEffect(() => {
    if (hasEncryptedData()) setGate('unlock');
    else {
      setHasLegacy(legacyPlainData() !== null);
      setGate('setup');
    }
  }, []);

  const onUnlocked = async () => {
    await useStore.persist.rehydrate();
    setGate('ready');
  };

  if (gate === 'checking') return null;
  if (gate !== 'ready') return <LockScreen mode={gate} hasLegacy={hasLegacy} onDone={onUnlocked} />;
  return <Main />;
}

function Main() {
  const rawPage = useStore((s) => s.ui.page);
  const page: Page = SETTINGS_SCREENS.includes(rawPage as SettingsScreen) || PLAN_SCREENS.includes(rawPage as PlanScreen) ? rawPage : (rawPage as string) === 'result' ? 'planRun' : ['plan', 'planHeadcount', 'planSkills'].includes(rawPage as string) ? 'planClosed' : 'employees';
  const setPage = useStore((s) => s.setPage);
  const tutorialSeen = useStore((s) => s.ui.tutorialSeen);
  const setTutorialSeen = useStore((s) => s.setTutorialSeen);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const employeeCount = useStore((s) => s.settings.employees.length);
  const [showTutorial, setShowTutorial] = useState(!tutorialSeen);
  const [openSettings, setOpenSettings] = useState(true);
  const [openPlan, setOpenPlan] = useState(true);
  const [pending, setPending] = useState<{ data: AppData; name: string } | null>(null);
  const [changingPass, setChangingPass] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const save = () => {
    const data = exportData();
    downloadText(JSON.stringify(data, null, 2), `シフト設定_${todayStamp()}.json`, 'application/json');
    toast.show('設定ファイルをダウンロードしました');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = parseAppData(JSON.parse(await readFileAsText(file)));
      setPending({ data, name: file.name });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '読み込みに失敗しました', true);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const doLock = async () => {
    await flushWrites();
    lock();
    location.reload();
  };

  const closeTutorial = () => {
    setShowTutorial(false);
    setTutorialSeen(true);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Table size={14} weight="bold" />
          </span>
          <span>s森さんをシフト決めから解放する</span>
        </div>
        <nav className="nav" aria-label="主要">
          <div className="nav-group">
            <span className="step">1</span>
            <span className="label">初期設定</span>
            <button className="toggle" aria-expanded={openSettings} aria-label="初期設定の項目を開閉" onClick={() => setOpenSettings((v) => !v)}>
              <CaretDown size={14} weight="bold" />
            </button>
          </div>
          {openSettings &&
            SETTINGS_SCREENS.map((id) => (
              <button key={id} className="sub" aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}>
                {SETTINGS_LABELS[id]}
              </button>
            ))}
          <div className="nav-group">
            <span className="step">2</span>
            <span className="label">シフトを組む</span>
            <button className="toggle" aria-expanded={openPlan} aria-label="シフトを組むの項目を開閉" onClick={() => setOpenPlan((v) => !v)}>
              <CaretDown size={14} weight="bold" />
            </button>
          </div>
          {openPlan &&
            PLAN_SCREENS.map((id) => (
              <button key={id} className="sub" aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}>
                {PLAN_LABELS[id]}
              </button>
            ))}
        </nav>
        <div className="sidebar-foot">
          <button className="btn" onClick={save} disabled={employeeCount === 0}>
            <DownloadSimple size={16} /> 保存する
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <UploadSimple size={16} /> 読み込む
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn btn-ghost" onClick={doLock}>
            <LockKey size={16} /> ロックする
          </button>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowTutorial(true)}>
              <Question size={16} /> 使い方
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setChangingPass(true)}>
              <Key size={16} /> 合言葉を変える
            </button>
          </div>
          <p className="dim small sidebar-note">データはこのブラウザの中に合言葉で暗号化して保存されます。</p>
        </div>
      </aside>
      <main className="main">
        {SETTINGS_SCREENS.includes(page as SettingsScreen) && <SettingsPage screen={page as SettingsScreen} />}
        {PLAN_SCREENS.includes(page as PlanScreen) && <PlanPage screen={page as PlanScreen} />}
      </main>
      {showTutorial && <Tutorial onClose={closeTutorial} />}
      {changingPass && <ChangePassModal onClose={() => setChangingPass(false)} onDone={() => toast.show('合言葉を変えました')} />}
      {pending && (
        <Modal
          title="設定ファイルを読み込む"
          onClose={() => setPending(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPending(null)}>
                キャンセル
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  importData(pending.data);
                  setPending(null);
                  toast.show('読み込みました');
                }}
              >
                置き換える
              </button>
            </>
          }
        >
          <div className="stack">
            <p>
              <strong>{pending.name}</strong> を読み込みます。今このブラウザにあるデータは置き換えられます。
            </p>
            <div className="note">
              従業員: {pending.data.settings.employees.length} 名、役割: {pending.data.settings.skills.length} 件、月のデータ: {Object.keys(pending.data.plans).length} か月分
            </div>
            {employeeCount > 0 && <p className="muted small">今のデータを残したい場合は、先に「保存する」でダウンロードしておいてください。</p>}
          </div>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}

function ChangePassModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null);
    if (next.length < 4) return setErr('新しい合言葉は 4 文字以上にしてください。');
    if (next !== next2) return setErr('確認用の合言葉が一致しません。');
    setBusy(true);
    await flushWrites();
    const ok = await changePassphrase(cur, next);
    setBusy(false);
    if (!ok) return setErr('今の合言葉が違います。');
    onDone();
    onClose();
  };
  return (
    <Modal
      title="合言葉を変える"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !cur || !next}>
            変更する
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="今の合言葉">
          <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus autoComplete="current-password" />
        </Field>
        <Field label="新しい合言葉">
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="新しい合言葉 (確認)">
          <input className="input" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
        </Field>
        {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
      </div>
    </Modal>
  );
}
