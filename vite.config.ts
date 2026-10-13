import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// GitHub Pages 的網址是 https://<帳號>.github.io/<repo 名稱>/，
// 所以 base 必須是 repo 名稱，否則上線後會找不到網頁檔案而變成空白頁。
export default defineConfig({
  base: '/yhhhhh1208/',
  plugins: [preact()],
});
