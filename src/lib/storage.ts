// 用瀏覽器儲存空間記住代號。無痕模式或被封鎖時可能丟錯，所以全部包 try/catch。
const KEY = 'anon-chat:nickname';

export const getSavedNickname = (): string => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

export const saveNickname = (nickname: string): void => {
  try {
    localStorage.setItem(KEY, nickname);
  } catch {
    /* 存不了就算了，只是下次要重新輸入 */
  }
};

export const clearSavedNickname = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
