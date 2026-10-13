import { nicknameKey } from './nickname';

const timeFmt = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));

const AVATAR_COLORS = ['#F8B8CB', '#BDE8D5', '#FBE2A8', '#FAC9B8', '#B9DDF4', '#E3C7F0'];
export const SELF_AVATAR = '#C9B8F4';

export const avatarColor = (nickname: string): string => {
  let h = 0;
  for (const ch of nicknameKey(nickname)) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export const firstChar = (nickname: string): string => Array.from(nickname)[0] ?? '';
