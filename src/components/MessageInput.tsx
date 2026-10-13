import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { charCount, clipChars } from '../lib/nickname';
import { MESSAGE_MAX, REMAINING_WARN } from '../lib/rules';
import { SendIcon } from './Icons';

type Props = {
  disabled: boolean; // 連線中時不能送
  /** 回傳 true 表示已送出（輸入框可以清空）。 */
  onSend: (text: string) => Promise<boolean>;
};

// 手機（觸控）用按鈕送出，Enter 只是換行；電腦 Enter 送出、Shift+Enter 換行。
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function MessageInput({ disabled, onSend }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // 隨內容變高（最多約 5 行）
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  const count = charCount(text);
  const remaining = MESSAGE_MAX - count;
  const canSend = !disabled && !busy && text.trim().length > 0;

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    const sent = await onSend(text);
    setBusy(false);
    if (sent) setText('');
    ref.current?.focus();
  };

  return (
    <form
      class="input-bar"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div class="input-field">
        <textarea
          ref={ref}
          class="input-text"
          aria-label="訊息"
          rows={1}
          disabled={disabled}
          placeholder={disabled ? '連線中，暫時無法送出' : isTouch() ? '輸入訊息…' : '輸入訊息，Enter 送出，Shift+Enter 換行'}
          value={text}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            const clipped = clipChars(el.value, MESSAGE_MAX);
            if (clipped !== el.value) el.value = clipped; // 貼上超過上限時，直接截斷畫面上的內容
            setText(clipped);
          }}
          onKeyDown={(e) => {
            // isComposing：中文輸入法選字時按 Enter 不能當成送出
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isTouch()) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {remaining <= REMAINING_WARN && <span class="remaining">剩 {remaining} 字</span>}
      </div>
      <button type="submit" class="send-btn" aria-label="送出" disabled={!canSend}>
        <SendIcon />
        <span class="send-label" aria-hidden="true">送出</span>
      </button>
    </form>
  );
}
