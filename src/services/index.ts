import type { ChatService } from './ChatService';
import { MockChatService } from './MockChatService';
import { SupabaseChatService } from './SupabaseChatService';

// 用 VITE_CHAT_BACKEND 決定資料來源：mock（模擬服務，預設）或 supabase。
// 畫面與其他程式都只透過 ChatService 介面使用它，不知道背後是哪一個。
function createChatService(): ChatService {
  const backend = import.meta.env.VITE_CHAT_BACKEND ?? 'mock';
  if (backend === 'supabase') {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (url && key) return new SupabaseChatService(url, key);
    console.warn('VITE_CHAT_BACKEND=supabase，但缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，改用模擬服務。');
  } else if (backend !== 'mock') {
    console.warn(`未知的 VITE_CHAT_BACKEND="${backend}"，改用模擬服務。`);
  }
  return new MockChatService();
}

export const chatService: ChatService = createChatService();
