# 匿名聊天室

一個不用登入的匿名聊天室，網頁放在 GitHub Pages，即時傳訊用 Supabase。

- 開始任何工作前，先讀 `docs/architecture.md`；做畫面時再讀 `docs/design.md`。
- 目前在「階段二」：已接上 Supabase。資料來源由 VITE_CHAT_BACKEND 決定（mock 是階段一的模擬服務，supabase 是真正的後端）。
- 不可以把金鑰檔案（`.env.local` 等 `.env*` 檔案）commit 進 git；只有 `.env.example` 可以。
