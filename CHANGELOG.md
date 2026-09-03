# 更改紀錄

## 2026-08-22 — 專案建立：全新視覺與後台重新設計

延用 `Yapo-x-Katy-s-wedding_page` 同一場婚禮的真實資料（新人姓名、日期、場地），但前後台整個重新設計，避免與原站放在一起看起來像同一份模板套版。

### 新增

- 前台賓客回函頁（`public/index.html`）：編輯誌風格設計 — 墨綠／米紙／陶土色配色、Fraunces 襯線 + Inter 無襯線字體、帳單式（ledger）倒數計時取代玻璃方塊、回函卡樣式的 RSVP 表單取代原本的圓角卡片表單、itinerary manifest 樣式的婚宴資訊取代純文字列表
- 捲動進度細線（progress rail）與「淡入 + 描線」的區塊進場動畫，取代原本單純的淡入
- 後台管理主控台（`public/admin.html` + `admin.css` + `admin.js`）：深色側邊欄 + 分頁式導覽（賓客名單／系統帳號／個人設定）、抽屜式（drawer）新增／編輯賓客表單取代置中彈窗、單色極簡按鈕與表格樣式取代原本的彩色圓角按鈕
- 後台賓客名單改用 `createElement` + `textContent` 動態組表格，不再用字串拼接 `innerHTML`：天生不會有 stored XSS，比原本「輸出前呼叫 escapeHtml／escapeForInlineJsAttr」的作法更不容易漏掉某個欄位忘記跳脫
- 共用的背景音樂自動播放解鎖模組 `public/audio-consent.js`：`index.html`／`login.html`／`admin.html` 三個頁面共用同一份邏輯，不再各自維護一份幾乎一樣、容易各自漂移出 bug 的實作
- 後端拆成 `src/`（`config.js`／`db.js`／`crypto.js`／`validators.js`／`middleware/auth.js`／`routes/*.js`）而非單一大檔案，`server.js` 只負責組裝
- 資料庫初始化改成回傳 Promise，`app.listen()` 等 `init()` 完成後才啟動，移除原本用 `setTimeout(migrateDatabase, 100)` 賭時間差的 schema migration 寫法
- 完整測試套件（`test/`，`node --test`）：RSVP 驗證規則、後台權限與 CRUD、靜態資源與前端行為的迴歸測試，共 30 項
- 專案文件：`README.md`、`CHANGELOG.md`、`CLAUDE.md`

### 修正（開發期間 QA 發現）

- Hero 區「Yapo & Katy」新人姓名幾乎看不見：全域 `h1, h2, h3 { color: var(--ink) }` 規則（給紙色底的區塊標題用）覆蓋掉 `.hero` 容器繼承下來的白色，導致深色森林背景上疊了幾乎同色的深綠字。改為在 `.hero-names` 明確覆寫 `color: var(--white)`
- 登入頁與後台的「密碼」欄位樣式跟其他欄位不一致（沒有底線風格，維持瀏覽器預設的方框外觀）：共用輸入框樣式的選擇器忘了列出 `input[type="password"]`，補上後 `login.html`、`admin.html`（修改密碼／重設密碼／新增帳號）三處的密碼欄位一併修正
