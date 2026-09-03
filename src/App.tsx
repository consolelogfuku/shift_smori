import { useEffect, useRef, useState } from 'react';
import { CaretDown, DownloadSimple, Question, Table, UploadSimple } from '@phosphor-icons/react';
import { PLAN_SCREENS, SETTINGS_SCREENS, parseAppData, useStore, type Page, type PlanScreen, type SettingsScreen } from './store';
import { SettingsPage } from './pages/SettingsPage';
import { PlanPage } from './pages/PlanPage';
import { Tutorial } from './components/Tutorial';
import { Modal, useToast } from './components/ui';
import { downloadText, readFileAsText, todayStamp } from './lib/file';
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
  planClosed: '営業所の休業日を登録',
  planOffs: '有給・出勤希望日を登録',
  planRoles: '必要な役割を調整',
  planRun: 'シフトを組む',
};

export function App() {
  useEffect(() => {
    // 以前のバージョンが localStorage に残したデータは消す (今は sessionStorage のみ)
    try {
      localStorage.removeItem('shift-smori');
      localStorage.removeItem('shift-smori-enc');
    } catch {
      /* 使えない環境では何もしない */
    }
  }, []);
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
  const markSaved = useStore((s) => s.markSaved);
  const isDirty = useStore((s) => s.isDirty);
  // 状態が変わるたびに再評価される (セレクタで購読)
  const dirty = useStore((s) => {
    void s.settings;
    void s.plans;
    void s.results;
    void s.ui.savedHash;
    return s.isDirty();
  });
  const [showTutorial, setShowTutorial] = useState(!tutorialSeen);
  const [openSettings, setOpenSettings] = useState(true);
  const [openPlan, setOpenPlan] = useState(true);
  const [pending, setPending] = useState<{ data: AppData; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const save = () => {
    const data = exportData();
    downloadText(JSON.stringify(data, null, 2), `シフト設定_${todayStamp()}.json`, 'application/json');
    markSaved();
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

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

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
          <button className={`btn${dirty ? ' btn-primary' : ''}`} onClick={save} disabled={employeeCount === 0}>
            <DownloadSimple size={16} /> 保存する
          </button>
          {dirty && <p className="small sidebar-note" style={{ color: 'var(--warn-ink)', padding: '0 8px', margin: '-4px 0 0' }}>未保存の変更があります。閉じる前に保存してください。</p>}
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <UploadSimple size={16} /> 読み込む
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn btn-ghost" onClick={() => setShowTutorial(true)}>
            <Question size={16} /> 使い方
          </button>
          <p className="dim small sidebar-note">データはサーバーには送られません。このタブを閉じると消えるので、終わったら「保存する」でファイルを残してください。</p>
        </div>
      </aside>
      <main className="main">
        {SETTINGS_SCREENS.includes(page as SettingsScreen) && <SettingsPage screen={page as SettingsScreen} />}
        {PLAN_SCREENS.includes(page as PlanScreen) && <PlanPage screen={page as PlanScreen} />}
      </main>
      {showTutorial && <Tutorial onClose={closeTutorial} />}
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
