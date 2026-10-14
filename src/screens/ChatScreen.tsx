import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ChatIcon, ChevronDownIcon, ChevronUpIcon, LeaveIcon } from '../components/Icons';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { LeaveDialog } from '../components/LeaveDialog';
import { MessageInput } from '../components/MessageInput';
import { MessageList } from '../components/MessageList';
import { OnlineList } from '../components/OnlineList';
import type { ChatItem } from '../hooks/useChat';
import { SEND_INTERVAL_MS } from '../lib/rules';
import type { ConnectionState, OnlineUser, SendResult } from '../services/ChatService';

type Props = {
  self: string;
  items: ChatItem[];
  users: OnlineUser[];
  connection: ConnectionState;
  onSend: (content: string) => Promise<SendResult>;
  onLeave: () => void;
};

export function ChatScreen({ self, items, users, connection, onSend, onLeave }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastSentAt = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelRef = useRef<HTMLElement>(null);

  const cooldownTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const showToast = (text: string) => {
    clearInterval(cooldownTimer.current);
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  /** 送太快：顯示倒數，輸入框裡的文字保留；冷卻結束時提示「可以再送出了」。 */
  const showCooldown = () => {
    clearInterval(cooldownTimer.current);
    clearTimeout(toastTimer.current);
    const tick = () => {
      const remain = Math.ceil((SEND_INTERVAL_MS - (Date.now() - lastSentAt.current)) / 1000);
      if (remain > 0) {
        setToast(`送太快了，請稍等 ${remain} 秒`);
        return;
      }
      clearInterval(cooldownTimer.current);
      setToast('可以再送出了');
      toastTimer.current = setTimeout(() => setToast(null), 1800);
    };
    tick();
    cooldownTimer.current = setInterval(tick, 250);
  };

  const handleSend = async (text: string): Promise<boolean> => {
    // 前端先擋一次（階段二時 Supabase 端會再擋一次）
    if (Date.now() - lastSentAt.current < SEND_INTERVAL_MS) {
      showCooldown();
      return false;
    }
    const result = await onSend(text);
    if (result.ok) {
      lastSentAt.current = Date.now();
      return true;
    }
    if (result.reason === 'rate_limited') {
      lastSentAt.current = Date.now(); // 伺服器說太快，就從現在重新計算冷卻
      showCooldown();
    } else if (result.reason === 'offline') showToast('目前離線，暫時無法送出');
    else showToast('這則訊息無法送出');
    return false;
  };

  const closePanel = useCallback(() => setPanelOpen(false), []);
  const stay = useCallback(() => setLeaveOpen(false), []);

  // 在線名單面板（手機）：Esc 關閉、開啟時把焦點移進面板
  useEffect(() => {
    if (!panelOpen) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePanel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel]);

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearInterval(cooldownTimer.current);
    },
    [],
  );

  return (
    <div class="chat">
      <header class="topbar">
        <div class="brand">
          <span class="brand-logo">
            <ChatIcon size={18} />
          </span>
          <span class="brand-name">匿名聊天室</span>
        </div>
        <div class="topbar-actions">
          <button
            type="button"
            class={panelOpen ? 'online-pill is-open' : 'online-pill'}
            aria-expanded={panelOpen}
            aria-controls="online-panel"
            onClick={() => setPanelOpen((o) => !o)}
          >
            <span class="dot" aria-hidden="true" />
            {users.length} 人在線
            {panelOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </button>
          <button type="button" class={leaveOpen ? 'leave-btn is-active' : 'leave-btn'} data-testid="leave-button" onClick={() => setLeaveOpen(true)}>
            <LeaveIcon />
            離開
          </button>
        </div>
      </header>

      <div class="chat-body">
        <main class="chat-main">
          {connection === 'reconnecting' && <ConnectionBanner />}
          <MessageList items={items} self={self} toast={toast} />
          <MessageInput disabled={connection !== 'connected'} onSend={handleSend} />
        </main>

        <aside class="sidebar" aria-label="在線名單">
          <h2 class="panel-title">
            <span class="dot" aria-hidden="true" />
            在線 {users.length} 人
          </h2>
          <OnlineList users={users} self={self} />
        </aside>
      </div>

      {panelOpen && (
        <>
          <div class="scrim" aria-hidden="true" onClick={closePanel} />
          <section class="online-panel" id="online-panel" aria-label="在線名單" tabIndex={-1} ref={panelRef}>
            <h2 class="panel-title">在線 {users.length} 人</h2>
            <OnlineList users={users} self={self} />
          </section>
        </>
      )}

      {leaveOpen && <LeaveDialog onStay={stay} onLeave={onLeave} />}
    </div>
  );
}
