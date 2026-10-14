import { useEffect, useRef } from 'preact/hooks';
import { LeaveIcon } from './Icons';

type Props = { onStay: () => void; onLeave: () => void };

/** 離開前的確認視窗。預設焦點在「留下來」，Esc 等同「留下來」。 */
export function LeaveDialog({ onStay, onLeave }: Props) {
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onStay]);

  return (
    <>
      <div class="scrim scrim-full" aria-hidden="true" onClick={onStay} />
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-desc">
        <div class="dialog-icon">
          <LeaveIcon size={28} />
        </div>
        <h2 id="leave-title">要離開聊天室嗎？</h2>
        <p id="leave-desc">離開後，記住的代號會被清掉，下次需要重新輸入。</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-primary" data-testid="leave-cancel" ref={stayRef} onClick={onStay}>
            留下來
          </button>
          <button type="button" class="btn btn-secondary" data-testid="leave-confirm" onClick={onLeave}>
            確定離開
          </button>
        </div>
      </div>
    </>
  );
}
