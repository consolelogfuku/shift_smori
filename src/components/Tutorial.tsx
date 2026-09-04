import { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Modal } from './ui';

type Group = '初期設定' | 'シフト作成' | '注意事項';

const STEPS: { group: Group; title: string; body: string }[] = [
  { group: '初期設定', title: '従業員を登録する', body: '「初期設定」の「従業員を登録」で、フォーマットに記入した Excel を取り込みます。1 人ずつ追加しても構いません。' },
  { group: '初期設定', title: '役割を登録して紐付ける', body: '「役割」で郵送事務や電話対応などを登録し、「従業員と役割の紐付け」で従業員ごとにチェックを付けます。' },
  { group: '初期設定', title: '勤務時間を登録して紐付ける', body: '「勤務時間」で A勤務 9:00-17:00 のように登録し、「従業員と勤務時間の紐付け」で従業員に設定します。' },
  { group: '初期設定', title: 'この役割の人は毎日最低何人必要かを決める', body: '郵送事務 1 人、受付 2 人のように、その役割の人が毎日最低何人必要かを入れます。' },
  { group: 'シフト作成', title: '何年何月のシフトを組むかを選ぶ', body: '「シフトを組む」の最初の項目で、組みたい年と月を選びます。' },
  { group: 'シフト作成', title: '営業所の休業日を登録する', body: '「営業所の休業日を登録」で、年末年始などの休業日をカレンダーでクリックします。土日祝は自動で休みです。' },
  { group: 'シフト作成', title: '有給と出勤希望日を登録する', body: '「有給・出勤希望日を登録」の表でセルをクリックし、有給 (終日)、有給 (時間休)、希望出勤日を選びます。' },
  { group: 'シフト作成', title: '必要な役割を日ごとに調整する', body: '「必要な役割を調整」のカレンダーで日付をクリックすると、その日だけ役割の人数を増やしたり減らしたりできます。' },
  { group: 'シフト作成', title: 'シフトを組む', body: '「シフトを組む」で実行し、結果を確認して Excel に出力します。' },
  { group: '注意事項', title: 'データの扱いについて', body: 'データはこのタブを閉じると消えます。作業中の場合は「保存する」ボタンを押して、途中経過を記録したファイルを手元に残すことができます。作業を再開したい場合は、「読み込む」ボタンから途中経過ファイルを読み込ませてください。' },
];

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const inGroup = STEPS.slice(0, i + 1).filter((st) => st.group === step.group).length;
  const groupSize = STEPS.filter((st) => st.group === step.group).length;
  return (
    <Modal
      title="使い方"
      onClose={onClose}
      wide
      footer={
        <div className="tut-foot">
          <div className="tut-dots" aria-label={`${i + 1} / ${STEPS.length}`}>
            {STEPS.map((_, k) => (
              <button key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`ステップ ${k + 1}`} />
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setI(i - 1)} disabled={i === 0}>
              <CaretLeft size={16} /> 戻る
            </button>
            {last ? (
              <button className="btn btn-primary" onClick={onClose}>
                はじめる
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setI(i + 1)}>
                次へ <CaretRight size={16} />
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="tut">
        <div className="tut-head">
          <div>
            <span className={`chip ${step.group === '注意事項' ? 'warn' : step.group === '初期設定' ? 'accent' : 'info'}`} style={{ marginBottom: 8 }}>
              {step.group}
              {step.group !== '注意事項' && (
                <span className="num">
                  {inGroup} / {groupSize}
                </span>
              )}
            </span>
            <h3>{step.title}</h3>
            <p className="muted">{step.body}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
