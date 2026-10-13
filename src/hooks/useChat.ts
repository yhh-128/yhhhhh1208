import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { cleanNickname, nicknameKey, validateNickname } from '../lib/nickname';
import { clearSavedNickname, getSavedNickname, saveNickname } from '../lib/storage';
import type { ChatService, ConnectionState, Message, OnlineUser, SendResult } from '../services/ChatService';

export type ChatItem =
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'system'; key: string; type: 'join' | 'leave'; nickname: string };

export type Phase = 'join' | 'joining' | 'chat';

const TITLE = '匿名聊天室';

const JOIN_ERRORS = {
  empty: '請輸入代號',
  too_long: '代號最多 12 個字',
  taken: '這個代號已被使用，換一個試試',
  invalid: '這個代號不能使用，換一個試試',
  unavailable: '連線失敗，請稍後再試',
} as const;

const messageItem = (message: Message): ChatItem => ({ kind: 'message', key: `m${message.id}`, message });

/** 把畫面需要的狀態與操作集中在這裡；只透過 ChatService 介面與資料來源溝通。 */
export function useChat(service: ChatService) {
  const [phase, setPhase] = useState<Phase>('join');
  const [self, setSelf] = useState('');
  const [items, setItems] = useState<ChatItem[]>([]);
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connected');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lostNickname, setLostNickname] = useState<string | null>(null);
  const [draftNickname, setDraftNickname] = useState(() => getSavedNickname());

  const selfRef = useRef('');
  const sysCounter = useRef(0);
  const unread = useRef(0);

  const resetChat = useCallback(() => {
    setItems([]);
    setUsers([]);
    setConnection('connected');
  }, []);

  // 訂閱資料來源的事件（只訂一次）
  useEffect(() => {
    const offs = [
      service.on('history_loaded', (history) =>
        setItems((prev) => {
          const have = new Set(prev.filter((i) => i.kind === 'message').map((i) => i.key));
          const fresh = history.map(messageItem).filter((i) => !have.has(i.key));
          return fresh.length ? [...prev, ...fresh] : prev;
        }),
      ),
      service.on('message_received', (message) => {
        setItems((prev) =>
          prev.some((i) => i.key === `m${message.id}`) ? prev : [...prev, messageItem(message)],
        );
        if (document.hidden && nicknameKey(message.nickname) !== nicknameKey(selfRef.current)) {
          unread.current += 1;
          document.title = `(${unread.current}) ${TITLE}`;
        }
      }),
      service.on('presence_updated', setUsers),
      service.on('user_joined', (e) =>
        setItems((prev) => [...prev, { kind: 'system', key: `s${sysCounter.current++}`, type: 'join', nickname: e.nickname }]),
      ),
      service.on('user_left', (e) =>
        setItems((prev) => [...prev, { kind: 'system', key: `s${sysCounter.current++}`, type: 'leave', nickname: e.nickname }]),
      ),
      service.on('connection_changed', (state) => {
        if (state === 'nickname_lost') {
          setLostNickname(selfRef.current);
          setDraftNickname(selfRef.current);
          setJoinError(null);
          selfRef.current = '';
          setSelf('');
          resetChat();
          setPhase('join');
        } else {
          setConnection(state);
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [service, resetChat]);

  // 回到分頁時，清掉標題上的未讀數
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        unread.current = 0;
        document.title = TITLE;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const join = useCallback(
    async (raw: string) => {
      const check = validateNickname(raw);
      if (!check.ok) {
        setJoinError(JOIN_ERRORS[check.error]);
        return;
      }
      setJoinError(null);
      setLostNickname(null);
      setDraftNickname(check.value);
      resetChat();
      selfRef.current = check.value;
      setPhase('joining');
      const result = await service.join(check.value);
      if (!result.ok) {
        selfRef.current = '';
        setJoinError(JOIN_ERRORS[result.reason]);
        setPhase('join');
        return;
      }
      saveNickname(check.value);
      setSelf(check.value);
      setPhase('chat');
    },
    [service, resetChat],
  );

  const leave = useCallback(async () => {
    await service.leave();
    clearSavedNickname();
    selfRef.current = '';
    setSelf('');
    setDraftNickname('');
    setJoinError(null);
    setLostNickname(null);
    resetChat();
    setPhase('join');
  }, [service, resetChat]);

  const send = useCallback((content: string): Promise<SendResult> => service.send(content), [service]);

  // 打開網頁時，如果瀏覽器記得上次的代號，直接嘗試進入
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current) return;
    autoJoined.current = true;
    const saved = cleanNickname(getSavedNickname());
    if (saved) void join(saved);
  }, [join]);

  return { phase, self, items, users, connection, joinError, lostNickname, draftNickname, join, leave, send };
}
