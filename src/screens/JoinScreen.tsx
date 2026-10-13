import { useEffect, useRef, useState } from 'preact/hooks';
import { AlertIcon, ChatDotsIcon } from '../components/Icons';
import { charCount, clipChars } from '../lib/nickname';
import { NICKNAME_MAX } from '../lib/rules';

type Props = {
  initialNickname: string;
  error: string | null;
  /** 斷線期間代號被別人占用時，顯示是哪個代號。 */
  lostNickname: string | null;
  busy: boolean;
  onSubmit: (nickname: string) => void;
};

export function JoinScreen({ initialNickname, error, lostNickname, busy, onSubmit }: Props) {
  const [value, setValue] = useState(initialNickname);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialNickname);
  }, [initialNickname]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  const count = charCount(value);
  const compact = Boolean(lostNickname || error);

  return (
    <div class="join">
      <div class="deco deco-a" aria-hidden="true" />
      <div class="deco deco-b" aria-hidden="true" />

      <div class="join-hero">
        <div class={compact ? 'logo logo-sm' : 'logo'}>
          <ChatDotsIcon size={compact ? 32 : 42} />
        </div>
        <h1>匿名聊天室</h1>
        {!lostNickname && (
          <p>
            不用註冊，取個代號
            <br />
            就能和大家一起聊天
          </p>
        )}
      </div>

      {lostNickname && (
        <div class="notice" role="alert">
          <AlertIcon size={22} />
          <p>斷線期間，「{lostNickname}」這個代號已被別人使用，請換一個代號再進來。</p>
        </div>
      )}

      <form
        class="join-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit(value);
        }}
      >
        <div class="join-label-row">
          <label for="nickname">你的代號</label>
          <span class="join-count">
            {count} / {NICKNAME_MAX}
          </span>
        </div>
        <input
          id="nickname"
          ref={inputRef}
          class={error ? 'join-input has-error' : 'join-input'}
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          placeholder="例如：小橘"
          value={value}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'nickname-error' : undefined}
          onInput={(e) => setValue(clipChars((e.target as HTMLInputElement).value, NICKNAME_MAX))}
        />
        {error && (
          <p class="field-error" id="nickname-error" role="alert">
            <AlertIcon />
            {error}
          </p>
        )}
        <button type="submit" class="btn btn-primary btn-lg" disabled={busy}>
          {busy ? '進入中…' : '進入聊天室'}
        </button>
        <p class="join-hint">
          1 到 12 個字，英文大小寫視為相同。
          <br />
          下次打開會自動記住你的代號。
        </p>
      </form>
    </div>
  );
}
