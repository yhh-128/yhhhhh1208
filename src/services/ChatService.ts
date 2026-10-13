// 「插座」：畫面只認這份約定（見 docs/architecture.md 第 4.3 與第 5 節）。
// 階段一由 MockChatService 實作；階段二由 SupabaseChatService 實作。畫面程式碼裡不會出現 Supabase。

export type Message = {
  id: number;
  nickname: string;
  content: string;
  created_at: string; // ISO 時間字串
};

export type OnlineUser = {
  nickname: string;
  online_at: string; // ISO 時間字串
};

export type SystemEvent = {
  type: 'join' | 'leave';
  nickname: string;
  time: string; // ISO 時間字串
};

export type ConnectionState = 'connected' | 'reconnecting' | 'nickname_lost';

export type JoinResult =
  | { ok: true }
  | { ok: false; reason: 'taken' | 'invalid' | 'unavailable' };

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limited' | 'invalid' | 'offline' };

/** 資料來源通知畫面的事件（名稱與資料格式見架構文件 5.2）。 */
export type ChatEvents = {
  history_loaded: Message[];
  message_received: Message;
  presence_updated: OnlineUser[];
  user_joined: SystemEvent;
  user_left: SystemEvent;
  connection_changed: ConnectionState;
};

/** 只有模擬服務有，用來手動測試斷線等情況。 */
export type ChatDebug = {
  disconnect(): void;
  reconnect(): void;
  reconnectNicknameTaken(): void;
  botSay(): void;
};

export interface ChatService {
  join(nickname: string): Promise<JoinResult>;
  send(content: string): Promise<SendResult>;
  leave(): Promise<void>;
  on<K extends keyof ChatEvents>(event: K, cb: (payload: ChatEvents[K]) => void): () => void;
  debug?: ChatDebug;
}
