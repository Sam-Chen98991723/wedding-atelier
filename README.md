# Wedding Atelier — Yapo × Katy

婚禮邀請 / RSVP 網站，含後台管理系統（賓客名單、Excel 匯出、帳號與權限管理、前台造訪次數統計）。

這個專案延用 [Yapo-x-Katy-s-wedding_page](../Yapo-x-Katy-s-wedding_page) 同一場婚禮的真實資料（新人姓名、日期、場地），但介面風格與後台系統整個重新設計，走「編輯誌 / 質感文具」路線（墨綠 + 米紙 + 陶土色、Fraunces 襯線字體、帳單式倒數計時、回函卡樣式的 RSVP 表單），刻意與原站的香檳金 / 玻璃霧面風格區隔開來，避免兩站放在一起看起來像同一份模板。

## 技術架構

- 後端：Node.js + Express，程式碼拆成 `src/`（config／db／crypto／validators／middleware／routes）而非單一大檔案
- 資料庫：SQLite（`atelier.db`，敏感欄位以 AES-256-CBC 加密後存入）
- 前端：純 HTML / CSS / JS（`public/`），無框架、無建置流程
- 後台賓客名單改用 `createElement` + `textContent` 組表格（不用字串拼接 `innerHTML`），天生不會有 stored XSS，也不需要額外的 escape 函式

## 環境需求

- Node.js 18 以上
- npm

## 安裝

```bash
npm install
```

## 環境變數設定

所有機密設定（加密金鑰、session 密鑰等）放在 `.env`，**這個檔案不會、也不應該被 commit 進 git**。

1. 複製範本：

   ```bash
   cp .env.example .env
   ```

2. 打開 `.env`，依需要調整下列變數：

   | 變數 | 說明 | 預設值 |
   |---|---|---|
   | `PORT` | 伺服器監聽的 port | `3000` |
   | `ENCRYPTION_KEY` | 資料庫欄位加密用的 AES-256 金鑰，**必須剛好 32 個字元** | 無，必填 |
   | `SESSION_SECRET` | Express session 簽章密鑰 | 無，必填 |
   | `COOKIE_SECURE` | 是否只允許 HTTPS 傳送 cookie，正式環境（有 HTTPS）請設 `true` | `false` |
   | `DEFAULT_ADMIN_USERNAME` | 首次啟動、users 資料表為空時建立的預設管理員帳號 | `admin` |
   | `DEFAULT_ADMIN_PASSWORD` | 對應的預設密碼（登入後請自行到後台修改） | `123456` |
   | `DB_PATH` | SQLite 資料庫檔案路徑，一般不用設定；測試套件會用這個變數指向暫存資料庫 | `./atelier.db` |
   | `TRUST_PROXY` | 部署在反向代理（Nginx、Render、Railway、Heroku 等）後面時才需要設定，通常設 `1` | 未設定（不信任任何代理） |

   產生隨機金鑰的指令：

   ```bash
   # ENCRYPTION_KEY 用（剛好 32 字元）
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

   # SESSION_SECRET 用
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   > ⚠️ **注意**：`ENCRYPTION_KEY` 一旦有資料寫入 `atelier.db` 之後就不能再更換，換掉的話舊資料會無法解密。

## 執行

```bash
npm start
```

伺服器啟動後可透過 `http://localhost:3000` 開啟（實際 port 依 `.env` 的 `PORT` 設定）。

- `/` 賓客回函頁（首頁）
- `/login.html` 後台登入
- `/admin.html` 後台管理主控台（需先登入）
- `/success.html` 送出回函後的確認頁

## 測試

```bash
npm test
```

使用 Node.js 內建的 `node --test`，不需要額外安裝測試框架。測試會另外啟動一個獨立的伺服器程序，用 `DB_PATH` 指向暫存的 SQLite 檔案，測試結束後自動刪除，**不會動到本機的 `atelier.db`**。涵蓋範圍：

- `test/rsvp.test.js`：`/submit-rsvp` 的驗證邏輯（姓名必填、電話須為 10 碼數字、喜帖 Email／地址必填規則、葷素食與兒童座椅的自動平衡／上限）
- `test/admin.test.js`：登入／登出、`/api/login` 流量限制、`admin`／`staff` 權限差異、賓客資料 CRUD、前台造訪次數統計、密碼重設、使用者權限修改（含禁止降級最後一位 admin）、`create-user` 缺欄位時正確回傳 400、admin 前端渲染是否走 DOM API（防 stored XSS 的迴歸測試）
- `test/static.test.js`：頁面與圖片資源是否正確載入、`style.css` 引用的圖片是否存在、`audio-consent.js` 的自動播放解鎖事件清單迴歸測試

## 資料庫

`atelier.db` 內含真實賓客個資（已加密），**不會被 commit 進 git**（見 `.gitignore`）。首次啟動時會自動建立資料表結構與預設管理員帳號。

如需備份，直接複製 `atelier.db` 檔案即可；還原時把檔案放回專案根目錄、並確保 `.env` 的 `ENCRYPTION_KEY` 與產生該備份時一致。

## 專案結構

```
.
├── server.js               # Express app 組裝、middleware、監聽
├── src/
│   ├── config.js            # 環境變數讀取與必填檢查
│   ├── db.js                 # SQLite 初始化、schema migration、預設管理員 seed
│   ├── crypto.js             # AES-256-CBC 欄位加解密
│   ├── validators.js         # 報名資料正規化／驗證（前後台共用規則）
│   ├── middleware/auth.js    # requireLogin／requireAdmin
│   └── routes/
│       ├── rsvp.js           # POST /submit-rsvp（公開）
│       ├── auth.js           # 登入／登出／改密碼
│       └── admin.js          # 賓客 CRUD、Excel 匯出、帳號管理、造訪統計
├── public/
│   ├── index.html            # 賓客回函頁
│   ├── login.html            # 後台登入
│   ├── admin.html            # 後台管理主控台
│   ├── success.html          # 回函成功頁
│   ├── style.css             # 前台＋共用設計系統（色彩／字體／表單元件）
│   ├── admin.css             # 後台主控台版面
│   ├── main.js                # 前台頁面邏輯（倒數、表單、捲動動畫）
│   ├── admin.js                # 後台主控台邏輯
│   ├── audio-consent.js        # 三個頁面共用的背景音樂自動播放解鎖邏輯
│   └── assets/                 # 婚禮照片、交通/停車圖、背景音樂
├── test/                    # node --test 測試（見上方「測試」章節）
├── .env.example              # 環境變數範本（可 commit）
└── atelier.db                # SQLite 資料庫（不會 commit）
```
