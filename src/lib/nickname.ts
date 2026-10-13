import { NICKNAME_MAX } from './rules';

// 控制字元與看不見的字元（零寬空白、方向控制字元等），用字元編號範圍表示。
// 不含 U+200D（零寬連字），因為 emoji 組合（例如家庭符號）需要它。
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200c],
  [0x200e, 0x200f],
  [0x2028, 0x202f],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
];

const isInvisible = (ch: string): boolean => {
  const cp = ch.codePointAt(0) ?? 0;
  return INVISIBLE_RANGES.some(([from, to]) => cp >= from && cp <= to);
};

export const charCount = (s: string): number => Array.from(s).length;

export const clipChars = (s: string, max: number): string => {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join('') : s;
};

/** 顯示用的代號：去掉看不見的字元、前後空白。 */
export const cleanNickname = (raw: string): string =>
  Array.from(raw)
    .filter((ch) => !isInvisible(ch))
    .join('')
    .trim();

/** 比對用的代號：全形半形統一、大小寫統一。 */
export const nicknameKey = (raw: string): string => cleanNickname(raw).normalize('NFKC').toLowerCase();

export type NicknameCheck = { ok: true; value: string } | { ok: false; error: 'empty' | 'too_long' };

export const validateNickname = (raw: string): NicknameCheck => {
  const value = cleanNickname(raw);
  if (value.length === 0) return { ok: false, error: 'empty' };
  if (charCount(value) > NICKNAME_MAX) return { ok: false, error: 'too_long' };
  return { ok: true, value };
};
