import { useState } from 'react';
import { LockKey, Table, Trash } from '@phosphor-icons/react';
import { Field, useConfirm } from './ui';
import { setup, unlock, wipe } from '../lib/secureStorage';

type Mode = 'unlock' | 'setup';

export function LockScreen({ mode, hasLegacy, onDone }: { mode: Mode; hasLegacy: boolean; onDone: () => void }) {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, node } = useConfirm();

  const submit = async () => {
    setErr(null);
    if (mode === 'setup') {
      if (pass.length < 4) return setErr('合言葉は 4 文字以上にしてください。');
      if (pass !== pass2) return setErr('確認用の合言葉が一致しません。');
      setBusy(true);
      await setup(pass);
      setBusy(false);
      onDone();
      return;
    }
    setBusy(true);
    const ok = await unlock(pass);
    setBusy(false);
    if (!ok) return setErr('合言葉が違います。');
    onDone();
  };

  const reset = async () => {
    if (await confirm({ title: 'このブラウザのデータを消す', message: '保存してある従業員、条件、結果がこのブラウザから消えます。PC に保存した JSON ファイルがあれば、あとで「読み込む」で戻せます。', confirmLabel: '消して最初から' })) {
      wipe();
      location.reload();
    }
  };

  return (
    <div className="lock-wrap">
      <div className="lock-card">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">
            <Table size={14} weight="bold" />
          </span>
          <span>s森さんをシフト決めから解放する</span>
        </div>
        <div className="lock-title">
          <LockKey size={22} weight="fill" />
          <h1>{mode === 'setup' ? '合言葉を決める' : '合言葉を入力'}</h1>
        </div>
        {mode === 'setup' ? (
          <div className="stack" style={{ gap: 6 }}>
            <p>データに鍵をかけるための合言葉を決めてください。次からは、この合言葉を入れると開けます。</p>
            <p className="small" style={{ color: 'var(--danger)' }}>合言葉を忘れると開けなくなります。メモを残してください。</p>
            {hasLegacy && <p className="muted small">前に入れたデータはそのまま使えます。</p>}
          </div>
        ) : (
          <p className="muted">合言葉を入れて、データを開きます。</p>
        )}
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="合言葉">
            <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} />
          </Field>
          {mode === 'setup' && (
            <Field label="合言葉 (確認)">
              <input className="input" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
            </Field>
          )}
          {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !pass}>
            {busy ? '確認中' : mode === 'setup' ? 'この合言葉で始める' : '開く'}
          </button>
        </form>
        {mode === 'unlock' && (
          <button className="btn btn-ghost btn-sm btn-danger" onClick={reset} style={{ alignSelf: 'flex-start' }}>
            <Trash size={14} /> 合言葉を忘れた。データを消して最初から
          </button>
        )}
      </div>
      {node}
    </div>
  );
}
