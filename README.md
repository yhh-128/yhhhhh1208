# 匿名聊天室

不用登入的匿名聊天室。設計與架構見 `docs/architecture.md` 與 `docs/design.md`。

目前是**階段二**：已接上 Supabase。資料來源用 `VITE_CHAT_BACKEND` 切換：`supabase`（真正的後端）或 `mock`（階段一的模擬服務，不需要任何金鑰）。Supabase 的設定紀錄在 `supabase/setup.sql`。

## 指令

```
npm install       安裝套件（第一次或 package.json 更新後）
npm run dev       本機預覽，網址 http://localhost:5173/yhhhhh1208/
npm run build     檢查型別並打包到 dist/
npm run preview   預覽打包後的結果
```

網址後面有 `/yhhhhh1208/`，因為 GitHub Pages 的網址就是這樣，本機預覽刻意保持一致。

## 測試工具

網址最後加上 `?debug`，畫面左下角會出現測試面板：

- **模擬斷線**／**恢復連線**：測試「重新連線中」與補訊息。
- **恢復，但代號被占用**：測試回到輸入畫面並顯示原因。
- **假用戶說一句話**：馬上收到一則別人的訊息，用來測試「有新訊息」按鈕。

同一個瀏覽器開兩個分頁，這兩個分頁可以互相聊天。不同裝置之間互相看不到（要等階段二）。

## 部署

push 到 `main` 後，`.github/workflows/deploy.yml` 會自動打包並發佈到 GitHub Pages。
第一次使用要到 GitHub 專案的 Settings → Pages，把來源（Source）選成「GitHub Actions」。
