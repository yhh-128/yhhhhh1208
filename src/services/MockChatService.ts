import { Emitter } from '../lib/emitter';
import { charCount, nicknameKey, validateNickname } from '../lib/nickname';
import { HISTORY_LIMIT, MESSAGE_MAX, SEND_INTERVAL_MS } from '../lib/rules';
import type {
  ChatDebug,
  ChatEvents,
  ChatService,
  JoinResult,
  Message,
  OnlineUser,
  SendResult,
} from './ChatService';

// 階段一的「假後端」：在瀏覽器裡假裝成聊天室的另一端。
// - 訊息存在 localStorage，模擬資料庫（重新整理後歷史還在）。
// - 同一個瀏覽器的其他分頁，透過 BroadcastChannel 互相傳話，所以開兩個分頁就能「兩個人」互相聊天。
// - 幾個假用戶偶爾說話、進來、離開，讓進出提示與在線名單看得到效果。

const STORE_KEY = 'anon-chat:mock-messages';
const CHANNEL = 'anon-chat:mock';
const STORE_MAX = 500;

type Wire =
  | { t: 'who'; from: string }
  | { t: 'here'; from: string; to: string; nickname: string; online_at: string }
  | { t: 'join'; from: string; nickname: string; online_at: string }
  | { t: 'leave'; from: string; nickname: string }
  | { t: 'msg'; from: string; message: Message };

const BOT_POOL = ['小華', '阿哲', 'Tom', '貓貓', '小明', 'Amy'];
const BOT_LINES = [
  '大家午安～',
  '今天天氣好好',
  '有人吃午餐了嗎？',
  '哈哈哈哈真的',
  '我剛下班，好累喔',
  '推薦大家一部新的影集',
  '週末有人要出去玩嗎？',
  '這個聊天室不用登入耶，好方便',
  '剛剛那個笑話太好笑了',
  '好想喝珍珠奶茶',
  '晚上要吃什麼呢',
  '我也是！',
];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

export class MockChatService implements ChatService {
  private emitter = new Emitter<ChatEvents>();
  private channel: BroadcastChannel | null = null;
  private tabId = Math.random().toString(36).slice(2);

  private self: { nickname: string; key: string; online_at: string } | null = null;
  private peers = new Map<string, OnlineUser>(); // 其他分頁的真人
  private bots = new Map<string, OnlineUser>(); // 假用戶，key 為統一後的代號
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  private offline = false;
  private lastSentAt = 0;
  private lastSeenId = 0;
  private idCounter = 0;

  readonly debug: ChatDebug = {
    disconnect: () => this.goOffline(),
    reconnect: () => this.comeBack(false),
    reconnectNicknameTaken: () => this.comeBack(true),
    botSay: () => this.botSay(),
  };

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e: MessageEvent<Wire>) => this.onWire(e.data);
    }
    window.addEventListener('pagehide', () => {
      if (this.self) this.post({ t: 'leave', from: this.tabId, nickname: this.self.nickname });
    });
  }

  on<K extends keyof ChatEvents>(event: K, cb: (payload: ChatEvents[K]) => void): () => void {
    return this.emitter.on(event, cb);
  }

  // ───────── 指令 ─────────

  async join(raw: string): Promise<JoinResult> {
    const check = validateNickname(raw);
    if (!check.ok) return { ok: false, reason: 'invalid' };
    if (this.self) await this.leave();

    // 問問其他分頁，現在有誰在線
    this.peers.clear();
    this.post({ t: 'who', from: this.tabId });
    await sleep(350);

    this.seedBots();
    const key = nicknameKey(check.value);
    const taken =
      this.bots.has(key) || Array.from(this.peers.values()).some((u) => nicknameKey(u.nickname) === key);
    if (taken) {
      this.bots.clear();
      return { ok: false, reason: 'taken' };
    }

    const online_at = new Date().toISOString();
    this.self = { nickname: check.value, key, online_at };
    this.offline = false;
    this.lastSentAt = 0;
    this.post({ t: 'join', from: this.tabId, nickname: check.value, online_at });

    const history = this.readStore().slice(-HISTORY_LIMIT);
    this.lastSeenId = history.length ? history[history.length - 1].id : 0;
    this.emitter.emit('history_loaded', history);
    this.emitPresence();
    this.scheduleBot();
    return { ok: true };
  }

  async send(raw: string): Promise<SendResult> {
    if (!this.self || this.offline) return { ok: false, reason: 'offline' };
    const content = raw.trim();
    if (content.length === 0 || charCount(content) > MESSAGE_MAX) return { ok: false, reason: 'invalid' };
    const now = Date.now();
    if (now - this.lastSentAt < SEND_INTERVAL_MS) return { ok: false, reason: 'rate_limited' };
    this.lastSentAt = now;

    await sleep(80); // 模擬網路來回
    const message: Message = {
      id: now * 1000 + (this.idCounter++ % 1000),
      nickname: this.self.nickname,
      content,
      created_at: new Date().toISOString(),
    };
    this.writeStore(message);
    this.post({ t: 'msg', from: this.tabId, message });
    this.deliver(message);
    return { ok: true };
  }

  async leave(): Promise<void> {
    if (this.self) this.post({ t: 'leave', from: this.tabId, nickname: this.self.nickname });
    this.reset();
  }

  // ───────── 內部：分頁之間的傳話 ─────────

  private post(wire: Wire) {
    this.channel?.postMessage(wire);
  }

  private onWire(w: Wire) {
    if (w.from === this.tabId) return;
    switch (w.t) {
      case 'who':
        if (this.self) {
          this.post({
            t: 'here',
            from: this.tabId,
            to: w.from,
            nickname: this.self.nickname,
            online_at: this.self.online_at,
          });
        }
        break;
      case 'here':
        if (w.to === this.tabId) this.peers.set(w.from, { nickname: w.nickname, online_at: w.online_at });
        break;
      case 'join': {
        this.peers.set(w.from, { nickname: w.nickname, online_at: w.online_at });
        if (!this.self) break;
        // 兩個分頁幾乎同時搶同一個代號：比較早進來的留下，較晚的退出
        if (nicknameKey(w.nickname) === this.self.key && w.online_at < this.self.online_at) {
          this.loseNickname();
          break;
        }
        this.emitSystem('join', w.nickname);
        this.emitPresence();
        break;
      }
      case 'leave':
        this.peers.delete(w.from);
        if (this.self) {
          this.emitSystem('leave', w.nickname);
          this.emitPresence();
        }
        break;
      case 'msg':
        if (this.self) this.deliver(w.message);
        break;
    }
  }

  // ───────── 內部：送給畫面 ─────────

  private deliver(message: Message) {
    if (this.offline) return; // 離線時不送達，重連後由 history_loaded 補上
    this.lastSeenId = Math.max(this.lastSeenId, message.id);
    this.emitter.emit('message_received', message);
  }

  private emitSystem(type: 'join' | 'leave', nickname: string) {
    if (this.offline) return;
    this.emitter.emit(type === 'join' ? 'user_joined' : 'user_left', {
      type,
      nickname,
      time: new Date().toISOString(),
    });
  }

  private emitPresence() {
    if (this.offline || !this.self) return;
    const users: OnlineUser[] = [
      { nickname: this.self.nickname, online_at: this.self.online_at },
      ...this.peers.values(),
      ...this.bots.values(),
    ].sort((a, b) => a.online_at.localeCompare(b.online_at));
    this.emitter.emit('presence_updated', users);
  }

  // ───────── 內部：訊息存放（模擬資料庫）─────────

  private readStore(): Message[] {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw) as Message[];
    } catch {
      /* 讀不到就用種子資料 */
    }
    return this.seedMessages();
  }

  private writeStore(message: Message) {
    try {
      const list = [...this.readStore(), message].slice(-STORE_MAX);
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch {
      /* 存不了就只留在目前畫面 */
    }
  }

  private seedMessages(): Message[] {
    const lines: Array<[string, string]> = [
      ['小華', '大家午安～今天天氣好好'],
      ['阿哲', '有人吃午餐了嗎？'],
      ['Tom', '剛吃完，你們呢？'],
      ['小華', '我在吃便當，今天的滷肉飯超好吃'],
      ['阿哲', '好想吃，下次一起去'],
      ['貓貓', '哈囉，我剛進來'],
    ];
    const base = Date.now() - lines.length * 90_000;
    const seeded = lines.map(([nickname, content], i) => ({
      id: i + 1,
      nickname,
      content,
      created_at: new Date(base + i * 90_000).toISOString(),
    }));
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(seeded));
    } catch {
      /* ignore */
    }
    return seeded;
  }

  // ───────── 內部：假用戶 ─────────

  private seedBots() {
    this.bots.clear();
    const t = Date.now();
    ['小華', '阿哲', 'Tom', '貓貓'].forEach((name, i) => {
      this.bots.set(nicknameKey(name), { nickname: name, online_at: new Date(t - (10 - i) * 60_000).toISOString() });
    });
  }

  private scheduleBot() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = setTimeout(() => {
      this.botTick();
      if (this.self) this.scheduleBot();
    }, 5000 + Math.random() * 6000);
  }

  private botTick() {
    if (!this.self || this.offline) return;
    const r = Math.random();
    const absent = BOT_POOL.filter((n) => !this.bots.has(nicknameKey(n)) && nicknameKey(n) !== this.self?.key);
    if (r < 0.65 || (r < 0.85 && this.bots.size <= 2 && absent.length === 0)) {
      this.botSay();
    } else if (r < 0.85 && this.bots.size > 2) {
      const bot = pick(Array.from(this.bots.values()));
      this.bots.delete(nicknameKey(bot.nickname));
      this.emitSystem('leave', bot.nickname);
      this.emitPresence();
    } else if (absent.length > 0) {
      const name = pick(absent);
      this.bots.set(nicknameKey(name), { nickname: name, online_at: new Date().toISOString() });
      this.emitSystem('join', name);
      this.emitPresence();
    }
  }

  private botSay() {
    if (!this.self || this.offline || this.bots.size === 0) return;
    const bot = pick(Array.from(this.bots.values()));
    const message: Message = {
      id: Date.now() * 1000 + (this.idCounter++ % 1000),
      nickname: bot.nickname,
      content: pick(BOT_LINES),
      created_at: new Date().toISOString(),
    };
    // 假用戶的話只出現在目前這個分頁，不存進「資料庫」
    this.deliver(message);
  }

  // ───────── 內部：斷線測試 ─────────

  private goOffline() {
    if (!this.self || this.offline) return;
    this.offline = true;
    this.emitter.emit('connection_changed', 'reconnecting');
  }

  private comeBack(nicknameTaken: boolean) {
    if (!this.self || !this.offline) return;
    if (nicknameTaken) {
      this.loseNickname();
      return;
    }
    this.offline = false;
    this.emitter.emit('connection_changed', 'connected');
    const missed = this.readStore().filter((m) => m.id > this.lastSeenId);
    if (missed.length) this.lastSeenId = missed[missed.length - 1].id;
    this.emitter.emit('history_loaded', missed);
    this.emitPresence();
  }

  private loseNickname() {
    if (this.self) this.post({ t: 'leave', from: this.tabId, nickname: this.self.nickname });
    this.reset();
    this.emitter.emit('connection_changed', 'nickname_lost');
  }

  private reset() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    this.self = null;
    this.offline = false;
    this.bots.clear();
    this.peers.clear();
  }
}
