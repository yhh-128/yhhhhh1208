-- 匿名聊天室：Supabase 設定檔
-- 貼到 Supabase 後台的 SQL Editor 執行（見 docs/architecture.md 第 3.2、3.3 節）。
-- 可以重複執行，不會出錯，也不會刪掉已經存在的訊息。

-- ───────── 1. 訊息資料表 ─────────
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  nickname   text        not null,
  content    text        not null,
  created_at timestamptz not null default now(),
  constraint messages_nickname_len check (char_length(nickname) between 1 and 12),
  constraint messages_content_len  check (char_length(content)  between 1 and 500)
);

-- 查「最近 N 則」與「某個時間之後的訊息」都靠這個索引
create index if not exists messages_created_at_idx on public.messages (created_at desc);


-- ───────── 2. 寫入前的檢查（資料庫端的最後一道防線）─────────
-- 前端也會檢查，但前端的檢查可以被繞過，這裡才是真正把關的地方。
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- 控制字元與看不見的字元（零寬空白、方向控制字元等）。
  -- 刻意不含零寬連字（8205），因為 emoji 組合需要它。
  bad_chars text :=
    '[' || chr(1) || '-' || chr(31)
        || chr(127) || '-' || chr(159)
        || chr(8203) || chr(8204)
        || chr(8206) || chr(8207)
        || chr(8232) || '-' || chr(8239)
        || chr(8288) || '-' || chr(8303)
        || chr(65279)
        || ']';
begin
  -- 去掉前後空白，以資料庫的時間為準（不信任使用者裝置的時間）
  new.nickname   := regexp_replace(new.nickname, '^\s+|\s+$', '', 'g');
  new.content    := regexp_replace(new.content,  '^\s+|\s+$', '', 'g');
  new.created_at := now();

  if char_length(new.nickname) not between 1 and 12 or new.nickname ~ bad_chars then
    raise exception 'invalid_nickname';
  end if;

  if char_length(new.content) not between 1 and 500 then
    raise exception 'invalid_content';
  end if;

  -- 防洗版：同一個代號（全形半形、大小寫視為相同）2 秒內只能送 1 則
  if exists (
    select 1
    from public.messages m
    where m.created_at > now() - interval '2 seconds'
      and lower(normalize(m.nickname, NFKC)) = lower(normalize(new.nickname, NFKC))
  ) then
    raise exception 'rate_limited';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();


-- ───────── 3. 權限：任何人只能「讀」和「新增」，不能改、不能刪 ─────────
alter table public.messages enable row level security;

-- Supabase 預設會給 anon 角色所有權限，先全部收回，再只開放需要的
revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to anon, authenticated;
grant usage on sequence public.messages_id_seq to anon, authenticated;

drop policy if exists "anyone can read messages" on public.messages;
create policy "anyone can read messages"
  on public.messages for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can insert messages" on public.messages;
create policy "anyone can insert messages"
  on public.messages for insert
  to anon, authenticated
  with check (true);

-- 沒有 update 和 delete 的規則，所以任何人都不能修改或刪除訊息。


-- ───────── 4. 開啟即時推送：有新訊息時自動推給所有連線的人 ─────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
