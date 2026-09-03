import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(900px, 100%)' } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export interface Anchor {
  x: number;
  y: number;
}

/** 画面座標に出す小さなパネル。外側クリックと Esc で閉じる */
export function Popover({ anchor, onClose, children, title }: { anchor: Anchor; onClose: () => void; children: ReactNode; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(anchor.x, window.innerWidth - r.width - 12);
    const top = anchor.y + r.height + 12 > window.innerHeight ? Math.max(12, anchor.y - r.height - 8) : anchor.y + 8;
    setPos({ left: Math.max(12, left), top });
  }, [anchor.x, anchor.y]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="popover" style={{ left: pos.left, top: pos.top }} role="dialog">
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error ? <span className="error">{error}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  );
}

export function Empty({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

let toastTimer: number | undefined;
export function useToast() {
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const show = (text: string, error = false) => {
    setToast({ text, error });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(null), 2600);
  };
  const node = toast ? <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div> : null;
  return { show, node };
}

/** Enter で確定するインライン編集用の入力 */
export function InlineText({
  value,
  onCommit,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim();
    if (t && t !== value) onCommit(t);
    else setV(value);
  };
  return (
    <input
      className={`input inline ${className ?? ''}`}
      value={v}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 99,
  placeholder,
  className,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      className={`input input-num ${className ?? ''}`}
      value={value ?? ''}
      min={min}
      max={max}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const t = e.target.value;
        if (t === '') return onChange(null);
        const n = Number(t);
        if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
      }}
    />
  );
}

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

/** 削除などの確認ダイアログ。await confirm({...}) で true / false が返る */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const confirm = (opts: Omit<ConfirmRequest, 'resolve'>) =>
    new Promise<boolean>((resolve) => setReq({ ...opts, resolve }));
  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  const node = req ? (
    <Modal
      title={req.title}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>
            キャンセル
          </button>
          <button className="btn btn-primary danger-primary" onClick={() => close(true)} autoFocus>
            {req.confirmLabel ?? '削除する'}
          </button>
        </>
      }
    >
      <p>{req.message}</p>
    </Modal>
  ) : null;
  return { confirm, node };
}
