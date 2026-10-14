import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { Emitter } from '../lib/emitter';
import { charCount, nicknameKey, validateNickname } from '../lib/nickname';
import { HISTORY_LIMIT, MESSAGE_MAX, SEND_INTERVAL_MS } from '../lib/rules';
import type { ChatEvents, ChatService, JoinResult, Message, OnlineUser, SendResult } from './ChatService';

// 階段二：真正接上 Supabase（見 docs/architecture.md 第 3.2、5、6 節）。
// - 訊息：存在 messages 資料表，新訊息靠 Realtime 的資料表變動推送。
// - 在線名單、進出提示：Realtime Presence。
// - 全部在同一條 Realtime 頻道上，所以連線狀態只有一個來源。

const CHANNEL_NAME = 'chat-room';
const JOIN_TIMEOUT_MS = 10_000;
const SYNC_WAIT_MS = 1500;
const SEEN_IDS_MAX = 2000;

type PresenceMeta = { nickname: string; online_at: string; client_id: string };
type MessageRow = { id: number | string; nickname: string; content: string; created_at: string };

const toMessage = (row: MessageRow): Message => ({
  id: Number(row.id),
  nickname: row.nickname,
  content: row.content,
  created_at: row.created_at,
});

/** 同一個瀏覽器分頁重新整理時，要認得「那是我自己上一次的連線」，才不會被自己擋住。 */
const getClientId = (): string => {
  const KEY = 'anon-chat:client-id';
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
};

export class SupabaseChatService implements ChatService {
  private emitter = new Emitter<ChatEvents>();
  private client: SupabaseClient;
  private clientId = getClientId();

  private channel: RealtimeChannel | null = null;
  private self: { nickname: string; key: string; online_at: string } | null = null;
  private joining = false;
  private ready = false; // join 完成之後才為 true
  private connected = false;
  private recovering = false;

  private historyReady = false;
  private queue: Message[] = [];
  private seen = new Set<number>();
  private lastSeenId = 0;
  private lastSentAt = 0;
  private syncWaiters: Array<() => void> = [];

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      // 這個專案沒有登入，所以不需要存登入狀態
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // 把連線的心跳放進背景執行緒，分頁在背景時才不會被瀏覽器降速而被判定斷線
      realtime: { worker: true },
    });

    window.addEventListener('offline', () => this.markReconnecting());
    window.addEventListener('online', () => this.resume());
    // 手機從背景回到前景時：確認連線、補上錯過的訊息
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.resume();
    });
  }

  on<K extends keyof ChatEvents>(event: K, cb: (payload: ChatEvents[K]) => void): () => void {
    return this.emitter.on(event, cb);
  }

  // ───────── 指令 ─────────

  async join(raw: string): Promise<JoinResult> {
    const check = validateNickname(raw);
    if (!check.ok) return { ok: false, reason: 'invalid' };
    if (this.joining) return { ok: false, reason: 'unavailable' };
    if (this.self) await this.leave();

    this.joining = true;
    try {
      const key = nicknameKey(check.value);
      const channel = this.client.channel(CHANNEL_NAME, { config: { presence: { key } } });
      this.channel = channel;
      this.wireChannel(channel);

      // 1. 連上頻道
      const subscribed = await this.subscribe(channel);
      if (!subscribed) {
        await this.dropChannel();
        return { ok: false, reason: 'unavailable' };
      }

      // 2. 先看看這個代號有沒有別人在用
      await this.waitForSync(SYNC_WAIT_MS);
      this.self = { nickname: check.value, key, online_at: new Date().toISOString() };
      if (this.rivals().length > 0) {
        await this.dropChannel();
        return { ok: false, reason: 'taken' };
      }

      // 3. 登記為在線；兩人同時搶同一個代號時，比較晚的那個退出
      await channel.track(this.meta());
      await this.waitForSync(SYNC_WAIT_MS);
      if (this.lostTieBreak()) {
        await this.dropChannel();
        return { ok: false, reason: 'taken' };
      }

      // 4. 載入最近 50 則歷史訊息
      this.resetMessages();
      const history = await this.fetchHistory();
      this.historyReady = true;
      this.connected = true;
      this.ready = true;
      this.emitter.emit('history_loaded', history);
      this.queue.splice(0).forEach((m) => this.deliver(m));
      this.emitPresence();
      return { ok: true };
    } catch {
      await this.dropChannel();
      return { ok: false, reason: 'unavailable' };
    } finally {
      this.joining = false;
    }
  }

  async send(raw: string): Promise<SendResult> {
    if (!this.self || !this.ready || !this.connected) return { ok: false, reason: 'offline' };
    const content = raw.trim();
    if (content.length === 0 || charCount(content) > MESSAGE_MAX) return { ok: false, reason: 'invalid' };
    const now = Date.now();
    if (now - this.lastSentAt < SEND_INTERVAL_MS) return { ok: false, reason: 'rate_limited' };
    this.lastSentAt = now;

    try {
      const { data, error } = await this.client
        .from('messages')
        .insert({ nickname: this.self.nickname, content })
        .select()
        .single();
      if (error) {
        if (error.message === 'rate_limited') return { ok: false, reason: 'rate_limited' };
        if (error.message.startsWith('invalid_')) return { ok: false, reason: 'invalid' };
        return { ok: false, reason: 'offline' };
      }
      // 自己的訊息直接顯示，不必等即時推送（推送回來時會用編號去重）
      this.deliver(toMessage(data as MessageRow));
      return { ok: true };
    } catch {
      return { ok: false, reason: 'offline' };
    }
  }

  async leave(): Promise<void> {
    this.ready = false;
    this.connected = false;
    this.self = null;
    if (this.channel) {
      try {
        await this.channel.untrack();
      } catch {
        /* 連線可能已經斷了，直接關閉 */
      }
    }
    await this.dropChannel();
  }

  // ───────── 內部：頻道 ─────────

  private wireChannel(channel: RealtimeChannel) {
    channel.on('presence', { event: 'sync' }, () => {
      this.syncWaiters.splice(0).forEach((resolve) => resolve());
      if (this.ready && this.connected) this.emitPresence();
    });

    channel.on('presence', { event: 'join' }, (p) => {
      if (!this.ready || p.key === this.self?.key) return;
      // currentPresences 是「進入之前」這個代號已有的連線；已經有的話只是多了一條連線，不算「新進入」
      if (p.currentPresences.length > 0) return;
      const meta = p.newPresences[0] as unknown as PresenceMeta;
      this.emitSystem('join', meta?.nickname ?? p.key);
    });

    channel.on('presence', { event: 'leave' }, (p) => {
      if (!this.ready || p.key === this.self?.key) return;
      if (p.currentPresences.length > 0) return; // 還有別的連線，代號仍在線
      const meta = p.leftPresences[0] as unknown as PresenceMeta;
      this.emitSystem('leave', meta?.nickname ?? p.key);
    });

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const message = toMessage(payload.new as MessageRow);
        if (!this.historyReady) this.queue.push(message); // 歷史還沒載完，先排隊，避免順序錯亂
        else this.deliver(message);
      },
    );
  }

  /** 訂閱頻道，等第一次成功或失敗；之後的狀態變化交給 onStatus。 */
  private subscribe(channel: RealtimeChannel): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };
      const timer = setTimeout(() => settle(false), JOIN_TIMEOUT_MS);
      channel.subscribe((status) => {
        if (!settled) {
          if (status === 'SUBSCRIBED') settle(true);
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') settle(false);
          if (settled) clearTimeout(timer);
          return;
        }
        this.onStatus(status);
      });
    });
  }

  private onStatus(status: string) {
    if (!this.ready) return;
    if (status === 'SUBSCRIBED') {
      void this.recover();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      this.markReconnecting();
    }
  }

  private markReconnecting() {
    if (!this.ready || !this.connected) return;
    this.connected = false;
    this.emitter.emit('connection_changed', 'reconnecting');
  }

  /** 網路恢復、或手機回到前景時：確認連線還活著，沒有就重連，並補上錯過的訊息。 */
  private resume() {
    if (!this.ready) return;
    this.client.realtime.connect();
    // 連線表面上正常、其實頻道已經掉了（手機被系統在背景中斷）時，也當成斷線處理
    if (this.connected && this.channel?.state !== 'joined') this.markReconnecting();
    if (this.connected) {
      void this.backfill().catch(() => {});
    } else {
      // supabase-js 若沒有再通知一次「已連上」，就自己主動確認
      setTimeout(() => void this.recover(), 500);
    }
  }

  /** 連線恢復後：重新登記在線、確認代號還是自己的、補上漏掉的訊息。 */
  private async recover() {
    if (this.recovering || !this.self || !this.channel) return;
    this.recovering = true;
    try {
      // 用「現在」當進入時間：斷線期間如果有人拿走了這個代號，晚到的是我，我就退出
      this.self.online_at = new Date().toISOString();
      await this.channel.track(this.meta());
      await this.waitForSync(SYNC_WAIT_MS);
      if (this.rivals().length > 0) {
        this.ready = false;
        this.connected = false;
        this.self = null;
        await this.dropChannel();
        this.emitter.emit('connection_changed', 'nickname_lost');
        return;
      }
      await this.backfill();
      this.connected = true;
      this.emitter.emit('connection_changed', 'connected');
      this.emitPresence();
    } catch {
      // 還沒真正恢復，維持「重新連線中」，supabase-js 會再試
    } finally {
      this.recovering = false;
    }
  }

  private async dropChannel() {
    const channel = this.channel;
    this.channel = null;
    this.historyReady = false;
    this.syncWaiters.splice(0).forEach((resolve) => resolve());
    if (channel) {
      try {
        await this.client.removeChannel(channel);
      } catch {
        /* ignore */
      }
    }
  }

  // ───────── 內部：在線名單 ─────────

  private meta(): PresenceMeta {
    return { nickname: this.self!.nickname, online_at: this.self!.online_at, client_id: this.clientId };
  }

  private metasOf(key: string): PresenceMeta[] {
    const state = (this.channel?.presenceState() ?? {}) as Record<string, unknown[]>;
    return (state[key] ?? []) as PresenceMeta[];
  }

  /** 用同一個代號、但不是我這個分頁的其他連線。 */
  private rivals(): PresenceMeta[] {
    if (!this.self) return [];
    return this.metasOf(this.self.key).filter((m) => m.client_id !== this.clientId);
  }

  /** 同時搶代號時：進入時間較早的留下（時間一樣就比編號），較晚的輸。 */
  private lostTieBreak(): boolean {
    if (!this.self) return false;
    const mine = this.meta();
    return this.rivals().some(
      (m) => m.online_at < mine.online_at || (m.online_at === mine.online_at && m.client_id < mine.client_id),
    );
  }

  private emitPresence() {
    if (!this.channel) return;
    const state = this.channel.presenceState() as Record<string, unknown[]>;
    const users: OnlineUser[] = Object.values(state)
      .map((metas) => (metas as PresenceMeta[]).slice().sort((a, b) => a.online_at.localeCompare(b.online_at))[0])
      .filter(Boolean)
      .map((m) => ({ nickname: m.nickname, online_at: m.online_at }))
      .sort((a, b) => a.online_at.localeCompare(b.online_at));
    this.emitter.emit('presence_updated', users);
  }

  private emitSystem(type: 'join' | 'leave', nickname: string) {
    this.emitter.emit(type === 'join' ? 'user_joined' : 'user_left', {
      type,
      nickname,
      time: new Date().toISOString(),
    });
  }

  private waitForSync(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.syncWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // ───────── 內部：訊息 ─────────

  private resetMessages() {
    this.queue = [];
    this.seen.clear();
    this.lastSeenId = 0;
    this.historyReady = false;
  }

  private remember(id: number) {
    this.seen.add(id);
    this.lastSeenId = Math.max(this.lastSeenId, id);
    if (this.seen.size > SEEN_IDS_MAX) {
      // 只留最近的一半，避免無限成長
      const keep = Array.from(this.seen).sort((a, b) => b - a).slice(0, SEEN_IDS_MAX / 2);
      this.seen = new Set(keep);
    }
  }

  private deliver(message: Message) {
    if (this.seen.has(message.id)) return;
    this.remember(message.id);
    this.emitter.emit('message_received', message);
  }

  private async fetchHistory(): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .order('id', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) throw error;
    const messages = (data as MessageRow[]).map(toMessage).reverse();
    messages.forEach((m) => this.remember(m.id));
    return messages;
  }

  /** 補上「最後看到的那則」之後新出現的訊息。 */
  private async backfill() {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .gt('id', this.lastSeenId)
      .order('id', { ascending: true })
      .limit(200);
    if (error) throw error;
    const fresh = (data as MessageRow[]).map(toMessage).filter((m) => !this.seen.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => this.remember(m.id));
    this.emitter.emit('history_loaded', fresh);
  }
}
