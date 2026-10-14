import { nicknameKey } from '../lib/nickname';
import { avatarColor, firstChar, SELF_AVATAR } from '../lib/format';
import type { OnlineUser } from '../services/ChatService';

type Props = { users: OnlineUser[]; self: string };

/** 在線名單的列表本體。電腦版放在右側欄，手機版放在展開的面板裡。 */
export function OnlineList({ users, self }: Props) {
  const selfKey = nicknameKey(self);
  return (
    <ul class="online-list" data-testid="online-list">
      {users.map((u) => {
        const isSelf = nicknameKey(u.nickname) === selfKey;
        return (
          <li key={nicknameKey(u.nickname)} class={isSelf ? 'online-item is-self' : 'online-item'}>
            <span class="avatar" aria-hidden="true" style={{ background: isSelf ? SELF_AVATAR : avatarColor(u.nickname) }}>
              {firstChar(u.nickname)}
            </span>
            <span class="online-name">{u.nickname}</span>
            {isSelf && <span class="you-tag">你</span>}
          </li>
        );
      })}
    </ul>
  );
}
