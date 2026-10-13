import type { ChatDebug } from '../services/ChatService';

/** 測試用的小面板，只有網址加上 ?debug 才會出現（見 README）。 */
export function DebugPanel({ debug }: { debug: ChatDebug }) {
  return (
    <div class="debug-panel" role="group" aria-label="測試工具">
      <strong>測試</strong>
      <button type="button" onClick={debug.disconnect}>模擬斷線</button>
      <button type="button" onClick={debug.reconnect}>恢復連線</button>
      <button type="button" onClick={debug.reconnectNicknameTaken}>恢復，但代號被占用</button>
      <button type="button" onClick={debug.botSay}>假用戶說一句話</button>
    </div>
  );
}
