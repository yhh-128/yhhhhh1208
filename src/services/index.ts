import type { ChatService } from './ChatService';
import { MockChatService } from './MockChatService';

// 階段二只需要改這裡：讓 VITE_CHAT_BACKEND=supabase 時回傳 SupabaseChatService。
// 畫面與其他程式都只透過 ChatService 介面使用它。
function createChatService(): ChatService {
  const backend = import.meta.env.VITE_CHAT_BACKEND ?? 'mock';
  if (backend !== 'mock') {
    console.warn(`未知的 VITE_CHAT_BACKEND="${backend}"，階段一只支援 mock，改用模擬服務。`);
  }
  return new MockChatService();
}

export const chatService: ChatService = createChatService();
