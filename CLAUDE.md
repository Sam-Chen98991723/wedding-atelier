# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

婚禮邀請 / RSVP 報名網站，含後台管理系統（賓客名單、Excel 匯出、帳號與權限管理、前台造訪次數統計）。Express 後端拆成 `src/` 底下的模組（config／db／crypto／validators／middleware／routes），`server.js` 只負責組裝；`public/` 是純 HTML/CSS/JS 靜態前端，沒有前端框架或建置流程。

這個專案與 `../Yapo-x-Katy-s-wedding_page` 是同一場婚禮（同樣的新人姓名、日期、場地），但介面與後台整個重新設計過，兩份程式碼彼此獨立，改一邊不會影響另一邊。

## Commands

```bash
npm install       # 安裝依賴
cp .env.example .env   # 首次 clone 後必做，見下方「環境變數」
npm start         # 啟動伺服器，預設 http://localhost:3000
npm test          # 執行全部測試（node --test，內建，不需額外測試框架）
node --test test/rsvp.test.js       # 只跑單一測試檔
node --test --test-name-pattern="last remaining admin" test/admin.test.js  # 只跑符合名稱的測試
```

沒有 lint 或 build 指令（無 TypeScript、無 bundler）。

## 環境變數（`.env`，不會 commit）

`src/config.js` 啟動時會直接 `throw` 拒絕啟動，如果：
- `ENCRYPTION_KEY` 未設定或長度不是剛好 32 個字元
- `SESSION_SECRET` 未設定

`.env.example` 有完整範本與金鑰產生指令。**`ENCRYPTION_KEY` 一旦資料庫有資料後就不能更換**（否則舊資料無法解密）——接手既有 `atelier.db` 時金鑰必須跟原本產生資料庫時的值完全一致。

## Architecture

### 後端模組拆分

- `src/config.js`：讀取並驗證環境變數，其他模組一律從這裡 `require`，不要直接讀 `process.env`
- `src/db.js`：SQLite 初始化、schema migration（`migrateRegistrationTable()` 用 `PRAGMA table_info` 檢查欄位是否存在、缺的用 `ALTER TABLE` 補上）、預設管理員 seed。`init()` 回傳 Promise，`server.js` 會 `await` 它完成後才 `app.listen()`——新增欄位時，`REQUIRED_REGISTRATION_COLUMNS` 陣列跟 `CREATE TABLE IF NOT EXISTS` 語句要同步改，兩處都要涵蓋才能同時支援全新資料庫與既有資料庫升級
- `src/crypto.js`：AES-256-CBC 的 `encrypt()`/`decrypt()`，金鑰來自 `config.ENCRYPTION_KEY`
- `src/validators.js`：`normalizeRegistrationPayload()` 是前後台三個寫入路由（`/submit-rsvp`、後台新增、後台編輯）共用的正規化與驗證邏輯，內部呼叫 `normalizeChildSeats()`／`normalizeMealCounts()`。**任何人數／餐點規則變動只要改這一個檔案**，不像過去分散在四個路由各自重複一份
- `src/middleware/auth.js`：`requireLogin`（只檢查是否登入）／`requireAdmin`（檢查 `role === 'admin'`，要接在 `requireLogin` 之後用）
- `src/routes/rsvp.js`、`src/routes/auth.js`、`src/routes/admin.js`：路由本身。`src/routes/admin.js` 用 `router.use(requireLogin)` 統一套用登入檢查，再對需要 admin 權限的個別路由套用 `requireAdmin`

### 欄位加密

`registration` 表所有欄位（姓名、電話、地址、祝福留言、人數等，全部轉成字串再加密）在寫入資料庫前用 `encrypt()` 加密、讀出後用 `decrypt()` 解密。新增任何要存進 `registration` 的欄位都要記得加密，讀取（`/api/admin/registrations`、Excel 匯出）都要記得解密——`src/routes/admin.js` 的 `decryptRegistrationRow()` 是唯一的解密出口，Excel 匯出跟 JSON API 都呼叫它，不要另外寫第二份解密邏輯。`users` 表不走這套加密，密碼是 bcrypt hash。

### 權限模型

兩種角色：`admin`、`staff`。`src/routes/admin.js` 所有路由都先過 `requireLogin`，需要 admin 權限的路由再疊加 `requireAdmin`。系統保護機制：`update-role` 禁止把最後一位 admin 降級（`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'` 那段）。

### async 路由 handler 裡，存取 `req.body` 欄位前一定要防呆

Express 4 不會自動接住 async handler 裡同步丟出的例外，未處理的 promise rejection 在現代 Node 預設會讓整個 process 當機——不是回傳 500，是**整個伺服器程序死掉，所有訪客斷線**。`src/routes/admin.js` 的 `create-user`、`reset-password`、`src/routes/auth.js` 的 `change-password` 都先用 `!newPassword ||` 短路再存取 `.length`／`.trim()`。新增任何讀取 `req.body` 欄位的路由，都要先假設該欄位可能是 `undefined`。

### 前台輸入資料在後台不需要額外跳脫（改用 DOM API 渲染）

`registration` 表的內容全部來自公開、未登入即可呼叫的 `/submit-rsvp`，任何人都能填入 `<script>`／`onerror=` 之類的內容。`public/admin.js` 刻意**不用**字串拼接 `innerHTML` 或 inline `onclick="...('${value}')"` 組畫面，而是用 `document.createElement()` + `el.textContent = value` 組表格列、用 `addEventListener` 綁定事件（`row-actions` 裡的編輯／刪除按鈕、帳號清單的權限下拉選單）。這樣使用者輸入永遠只會被當成文字內容，不會被瀏覽器當成 HTML／JS 解析，天生不會有 stored XSS，也不需要另外維護一組 `escapeHtml()`／`escapeForInlineJsAttr()`。**新增任何把使用者輸入塞進 `admin.html` 畫面的程式碼，一律走 `textContent`／`createElement`，不要開後門用 `innerHTML` 字串樣板或 inline `onclick` 屬性**——`test/admin.test.js` 有對應的迴歸測試會抓這件事。API 本身（`/api/admin/registrations` 等）刻意回傳未跳脫的原始值，安全處理是前端渲染時的責任。

### 前端

`public/` 內純靜態頁面，無框架、無 build step，改完直接重整生效：
- `index.html` + `main.js`：賓客回函頁（表單驗證邏輯與後端的 `normalizeChildSeats`/`normalizeMealCounts` 對應，前後端要保持規則一致；hero 區塊有倒數計時，目標時間寫死在 `main.js` 的 `WEDDING_DATE`）
- `login.html`：後台登入
- `admin.html` + `admin.css` + `admin.js`：後台管理主控台（分頁式導覽：賓客名單／系統帳號／個人設定；新增／編輯賓客走右側抽屜）
- `success.html`：回函成功頁
- `style.css`：前台與共用設計系統（CSS variables、`.field` 表單元件、`.reveal` 進場動畫、`.sound-toggle` 音樂按鈕），`admin.css` 是在 `style.css` 之上疊加的後台專屬版面，兩者都要引入才能讓 `admin.html` 正常顯示
- `audio-consent.js`：`index.html`／`login.html`／`admin.html` 三個頁面共用的背景音樂「靜音自動播放 → 等待有效使用者手勢解除靜音」邏輯，見下方「背景音樂自動播放」

**共用輸入框樣式的選擇器要記得列齊所有 `input[type]`**：`.field input[type="text"], input[type="tel"], input[type="email"], input[type="number"], input[type="password"], select, textarea` 這組選擇器決定了表單欄位的底線樣式；新增任何新的 `input[type=...]`（例如 `type="date"`、`type="search"`）都要記得加進這個選擇器列表，否則該欄位會退回瀏覽器預設的方框樣式，跟其他欄位不一致（開發期間 `login.html`／`admin.html` 的密碼欄位就漏掉 `type="password"`，見 `CHANGELOG.md`）。

**在深色背景（`.hero`、`.divider-scene`、`.site-footer`）裡使用 `<h1>`/`<h2>`/`<h3>`，要記得明確覆寫 `color`**：全域 `h1, h2, h3 { color: var(--ink) }` 是給紙色底的區塊標題用的預設值，直接宣告在元素本身，會蓋掉從深色容器繼承下來的白色文字——不是特異度問題，是「直接宣告永遠贏過繼承值」。`.hero-names` 已經這樣修過一次，新增任何深色背景裡的標題元素都要檢查對比度。

### 背景音樂自動播放

瀏覽器的 autoplay 政策只承認 `click`／`touchstart`／`keydown` 是「有效使用者手勢」，`wheel`／`scroll`／`pointerdown` 不算數——用它們解除靜音會被瀏覽器悄悄擋下。`public/audio-consent.js` 的 `AudioConsent.attach()` 封裝了這套邏輯，三個頁面（`index.html`／`login.html`／`admin.html`）都呼叫它，**不要**再各自寫一份。修改自動播放解鎖邏輯時，只需要改 `audio-consent.js` 一個檔案，`test/static.test.js` 有迴歸測試確認實際程式碼（排除註解）裡沒有出現 `wheel`／`scroll`／`pointerdown`。

### 測試（`test/`）

`node --test`，無 Jest/Mocha。`test/helpers.js` 的 `startServer()` 會另外 spawn 一個獨立的 `node server.js` 子程序，透過環境變數（`PORT`、獨立的 `DB_PATH`、固定測試用 `ENCRYPTION_KEY`/`SESSION_SECRET`）跑在隔離的暫存 SQLite 檔案上，測試結束 `stopServer()` 會清掉暫存檔，**不會碰到本機的 `atelier.db`**：
- `test/rsvp.test.js`：`/submit-rsvp` 驗證邏輯
- `test/admin.test.js`：登入、登出、流量限制、admin/staff 權限差異、報名資料 CRUD（含未跳脫值原樣回傳）、瀏覽次數統計、密碼重設、角色修改、`create-user` 缺欄位時回 400、`admin.js`／`admin.html` 的 DOM 渲染／無 inline onclick 迴歸測試
- `test/static.test.js`：前台頁面與圖片資源是否正確載入、`style.css` 引用的圖片是否存在、`audio-consent.js` 觸發事件迴歸測試

改動 `normalizeChildSeats`/`normalizeMealCounts` 或任何驗證規則時，`test/rsvp.test.js` 和 `test/admin.test.js` 都可能要一併更新。

## 變更紀錄慣例

專案用 `CHANGELOG.md` 手動記錄每次變更（時間戳 + 變更/新增/修正分類，中文撰寫）。做完有意義的修改後，習慣上會在檔案最上方補一筆記錄。
