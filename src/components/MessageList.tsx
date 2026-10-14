import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ChatItem } from '../hooks/useChat';
import { formatTime } from '../lib/format';
import { nicknameKey } from '../lib/nickname';
import { AT_BOTTOM_PX } from '../lib/rules';
import { ArrowDownIcon, ChatSmileIcon, ClockIcon } from './Icons';

type Props = { items: ChatItem[]; self: string; toast: string | null };

export function MessageList({ items, self, toast }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevLen = useRef(0);
  const [showNew, setShowNew] = useState(false);
  const selfKey = nicknameKey(self);
  const hasMessages = items.some((i) => i.kind === 'message');

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_PX;
    if (atBottom.current) setShowNew(false);
  };

  // 有新項目時：在最底（或剛進來、或是自己送的）就捲到底；否則顯示「有新訊息」
  useLayoutEffect(() => {
    const added = items.slice(prevLen.current);
    const first = prevLen.current === 0;
    prevLen.current = items.length;
    if (added.length === 0) return;
    const mine = added.some((i) => i.kind === 'message' && nicknameKey(i.message.nickname) === selfKey);
    if (first || atBottom.current || mine) {
      scrollToBottom();
      atBottom.current = true;
    } else if (added.some((i) => i.kind === 'message')) {
      setShowNew(true);
    }
  }, [items, selfKey]);

  // 輸入框變高、手機鍵盤彈出時，如果原本在最底，就維持在最底
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) scrollToBottom();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const jumpToBottom = () => {
    scrollToBottom();
    atBottom.current = true;
    setShowNew(false);
  };

  return (
    <div class="list-wrap">
      <div class="message-list" ref={scrollRef} onScroll={onScroll}>
        {!hasMessages && (
          <div class="empty">
            <div class="empty-icon">
              <ChatSmileIcon size={48} />
            </div>
            <p class="empty-title">還沒有人說話</p>
            <p class="empty-sub">來打聲招呼吧</p>
          </div>
        )}
        {items.map((item) => {
          if (item.kind === 'system') {
            return (
              <div class="system-note" key={item.key}>
                {item.nickname} {item.type === 'join' ? '進入了聊天室' : '離開了聊天室'}
              </div>
            );
          }
          const m = item.message;
          const mine = nicknameKey(m.nickname) === selfKey;
          return (
            <div class={mine ? 'msg msg-self' : 'msg msg-other'} key={item.key}>
              {!mine && <span class="msg-name">{m.nickname}</span>}
              <div class="msg-row">
                {mine && <time class="msg-time">{formatTime(m.created_at)}</time>}
                <div class="bubble">{m.content}</div>
                {!mine && <time class="msg-time">{formatTime(m.created_at)}</time>}
              </div>
            </div>
          );
        })}
      </div>

      <div class="floaters">
        {toast && (
          <div class="toast" role="status">
            <ClockIcon />
            {toast}
          </div>
        )}
        {showNew && (
          <button type="button" class="new-btn" onClick={jumpToBottom}>
            有新訊息
            <ArrowDownIcon />
          </button>
        )}
      </div>
    </div>
  );
}
