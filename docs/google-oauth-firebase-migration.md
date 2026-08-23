# Google OAuth Authorization Code + Refresh Token cho Kinly trên Firebase

## Phạm vi và kết luận

Kinly là **Vite SPA không có backend riêng**, được deploy trên **Firebase Hosting**. Vì vậy, không cần dựng một server độc lập. Mô hình phù hợp là:

> **Firebase Hosting → Firebase Functions 2nd gen → Google OAuth/Drive**

Firebase Functions đóng vai trò backend-for-frontend (BFF). Firebase Authentication xác định người dùng Kinly, Firestore lưu metadata và refresh token đã mã hóa, còn Secret Manager giữ Google client secret và khóa mã hóa. Browser chỉ nhận Firebase ID token của chính Kinly và dữ liệu nghiệp vụ; browser không bao giờ nhận Google refresh token hoặc Google client secret.

| Thành phần | Vai trò trong Kinly |
|---|---|
| Firebase Hosting | Phục vụ SPA và rewrite `/api/**` tới Cloud Functions |
| Firebase Authentication | Định danh user Kinly; Firebase SDK tự duy trì/refresh Firebase ID token |
| Firebase Functions 2nd gen | OAuth start/callback, xác thực Firebase ID token, refresh Google token và gọi Drive |
| Firestore | Lưu liên kết user–Google, trạng thái `needsReauth`, audit timestamps và refresh token ciphertext |
| Secret Manager | Lưu `GOOGLE_CLIENT_SECRET` và `TOKEN_ENCRYPTION_KEY` |
| Google OAuth Web client | Cấp authorization code, access token và refresh token |
| Google Drive API | Lưu backup trong `appDataFolder` |

Google web-server OAuth hỗ trợ backend đổi authorization code lấy access token và refresh token; backend dùng refresh token để lấy access token mới sau khi access token hết hạn [1]. Firebase Hosting có thể rewrite request tới Cloud Functions từ cùng domain [2]. Firebase Auth cung cấp ID token để backend xác thực danh tính người dùng [3].

## 1. Vì sao Firebase Auth không tự giải quyết Google Drive refresh token

Firebase Auth và Google Drive OAuth là hai mục đích khác nhau. Firebase Auth giúp Kinly biết người dùng là ai và cho phép Functions xác thực `uid`. Firebase Auth tự refresh **Firebase ID token**, nhưng điều đó không đồng nghĩa với việc browser có một refresh token để gọi Google Drive API.

Không nên dùng `GoogleAuthProvider` của Firebase Auth như nguồn refresh token cho Drive. Có thể dùng Firebase Auth để đăng nhập Kinly, nhưng quyền Drive `drive.appdata` nên được cấp bằng authorization-code flow riêng, xử lý ở Functions. Nếu tiếp tục dùng `google.accounts.oauth2.initTokenClient()` trong SPA, access token vẫn chỉ sống ở browser và không có refresh token backend.

## 2. Cấu hình Google Cloud OAuth

### 2.1. Chọn project

Firebase project được liên kết với một Google Cloud project. Trong chính project đó, bật:

```text
Google Drive API
Cloud Functions API
Secret Manager API
Firestore API
```

Trong Google Cloud OAuth consent screen, khai báo tên Kinly, email hỗ trợ, domain production và privacy policy nếu môi trường production yêu cầu. Nếu consent screen đang ở trạng thái Testing, thêm các Google account dùng để kiểm thử.

### 2.2. Tạo OAuth client loại Web application

Tạo credential **OAuth client ID → Web application**. Không dùng client Android/iOS cho Functions.

Với Firebase Hosting production, redirect URI nên là:

```text
https://<firebase-site>.web.app/api/google/oauth/callback
```

Nếu có custom domain:

```text
https://kinly.example.com/api/google/oauth/callback
```

Local emulator dùng một URI riêng, ví dụ:

```text
http://127.0.0.1:5001/<firebase-project>/us-central1/googleApi/api/google/oauth/callback
```

Các URI phải được khai báo chính xác, không wildcard. Không dùng một redirect URI production cho staging hoặc local.

Giữ scope hiện tại của Kinly trong lần migration đầu tiên:

```text
https://www.googleapis.com/auth/drive.appdata
```

Scope này phù hợp với backup riêng của ứng dụng trong `appDataFolder`. Không tự đổi sang `drive` nếu Kinly không cần truy cập toàn bộ Drive của người dùng.

## 3. Cấu trúc thư mục Firebase đề xuất

Nếu repository hiện tại chưa có Functions, có thể bổ sung:

```text
kinly/
├─ app/                         # Vite SPA hiện tại
│  ├─ src/
│  └─ dist/                     # output deploy lên Hosting
├─ functions/
│  ├─ src/
│  │  ├─ index.ts               # export googleApi
│  │  ├─ auth/firebaseAuth.ts   # verify Firebase ID token
│  │  ├─ oauth/googleFlow.ts    # start/callback/state/PKCE
│  │  ├─ oauth/googleTokens.ts  # decrypt + refresh token
│  │  ├─ drive/googleDrive.ts   # Drive API proxy
│  │  └─ db/googleAccounts.ts   # Firestore helpers
│  ├─ package.json
│  └─ tsconfig.json
├─ firebase.json
└─ firestore.rules
```

Khuyến nghị dùng **Functions 2nd gen** với Node.js hiện hành được Firebase hỗ trợ. Không dùng `functions.config()` cho code mới; Firebase đã deprecate API này và khuyến nghị parameterized configuration/Secret Manager [4].

## 4. Firebase Authentication ở frontend

Firebase Auth dùng để xác định user Kinly trước khi gọi `/api/google/oauth/start`. Ví dụ cấu hình client:

```ts
// app/src/shared/firebase/firebaseClient.ts
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

export async function configureAuthPersistence(): Promise<void> {
  await setPersistence(firebaseAuth, browserLocalPersistence);
}
```

Firebase config public như `VITE_FIREBASE_API_KEY` không thay thế cho server secret. Sau khi user đăng nhập, frontend lấy Firebase ID token khi gọi API:

```ts
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('KINLY_AUTH_REQUIRED');

  const idToken = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${idToken}`);
  headers.set('Content-Type', 'application/json');

  return fetch(path, { ...init, headers, credentials: 'same-origin' });
}
```

`getIdToken()` có thể tự lấy Firebase ID token mới khi cần. Đây là refresh của **Firebase session**, không phải refresh token Google Drive. Backend vẫn phải tự refresh Google Drive token bằng refresh token đã lưu.

## 5. Secret Manager và biến môi trường

Từ thư mục gốc Firebase, tạo secrets:

```bash
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY
```

`GOOGLE_CLIENT_SECRET` là secret từ Google Cloud. `TOKEN_ENCRYPTION_KEY` là khóa mã hóa refresh token, không dùng lại `SESSION_SECRET` hoặc Firebase API key. Tạo khóa ngoài source code:

```bash
openssl rand -base64 32
```

Client ID và redirect URI không cần giữ như secret, nhưng vẫn nên cấu hình server-side để không hard-code theo environment:

```ts
// functions/src/config.ts
import { defineSecret, defineString } from 'firebase-functions/params';

export const googleClientId = defineString('GOOGLE_CLIENT_ID');
export const googleRedirectUri = defineString('GOOGLE_REDIRECT_URI');
export const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');
export const tokenEncryptionKey = defineSecret('TOKEN_ENCRYPTION_KEY');
```

Chỉ bind secrets vào function thực sự cần chúng:

```ts
export const googleApi = onRequest(
  {
    region: 'asia-southeast1',
    secrets: [googleClientSecret, tokenEncryptionKey],
  },
  handler,
);
```

Firebase ghi rõ secret chỉ khả dụng cho function đã bind secret đó; không nên đọc secret ở global scope trước khi runtime khởi tạo [4].

## 6. Xác thực Firebase ID token trong Functions

Mọi endpoint `/api/google/*` phải xác định user từ Firebase ID token, không nhận `uid` từ request body.

```ts
// functions/src/auth/firebaseAuth.ts
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'express';

if (getApps().length === 0) initializeApp();

export async function requireFirebaseUser(req: Request) {
  const authorization = req.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'KINLY_AUTH_REQUIRED');

  try {
    return await getAuth().verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, 'KINLY_AUTH_REQUIRED');
  }
}
```

Firebase Admin SDK có thể dùng Application Default Credentials trong môi trường Cloud Functions; không package service-account JSON vào repository [5].

## 7. OAuth start/callback trên Functions

### 7.1. Endpoint start

Frontend chỉ redirect sau khi người dùng bấm **Kết nối Google Drive**:

```text
GET /api/google/oauth/start
Authorization: Bearer <Firebase ID token>
```

Function phải tạo `state`, `code_verifier` và `code_challenge` bằng random cryptographic bytes. Lưu hash của state, verifier đã mã hóa, Firebase `uid`, redirect URI và thời hạn khoảng 10 phút vào Firestore.

```ts
import crypto from 'node:crypto';
import { google } from 'googleapis';

function createPkce() {
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { state, verifier, challenge };
}

export async function startGoogleOAuth(req: Request, res: Response) {
  const firebaseUser = await requireFirebaseUser(req);
  const { state, verifier, challenge } = createPkce();

  await firestore.collection('oauthTransactions').doc(hash(state)).set({
    uid: firebaseUser.uid,
    codeVerifierCiphertext: encryptSecret(verifier),
    redirectUri: googleRedirectUri.value(),
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60_000),
    consumedAt: null,
  });

  const client = new google.auth.OAuth2(
    googleClientId.value(),
    googleClientSecret.value(),
    googleRedirectUri.value(),
  );

  const authorizationUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.appdata'],
    include_granted_scopes: true,
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return res.redirect(authorizationUrl);
}
```

`prompt: 'consent'` chỉ nên dùng khi liên kết lần đầu hoặc khi backend không còn refresh token. Sau khi đã có token, không dùng `prompt=consent` trong auto-sync hoặc reload.

### 7.2. Endpoint callback

Callback nhận:

```text
GET /api/google/oauth/callback?code=...&state=...
```

Function phải kiểm tra state hash, TTL, `consumedAt`, code verifier và callback error trước khi exchange code. Transaction phải được consume atomically để callback bị gửi lại không thể đổi code lần hai.

```ts
export async function googleOAuthCallback(req: Request, res: Response) {
  const { code, state, error } = req.query;
  if (typeof state !== 'string') return redirectError(res, 'google_state_invalid');
  if (typeof error === 'string') return redirectError(res, 'google_denied');
  if (typeof code !== 'string') return redirectError(res, 'google_code_missing');

  const transaction = await loadValidOAuthTransaction(hash(state));
  if (!transaction) return redirectError(res, 'google_state_invalid');

  const verifier = decryptSecret(transaction.codeVerifierCiphertext);
  const client = new google.auth.OAuth2(
    googleClientId.value(),
    googleClientSecret.value(),
    transaction.redirectUri,
  );

  const { tokens } = await client.getToken({
    code,
    codeVerifier: verifier,
  });

  if (!tokens.access_token) return redirectError(res, 'google_token_missing');

  client.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: client });
  const about = await drive.about.get({
    fields: 'user(permissionId,emailAddress,displayName,photoLink)',
  });

  const existing = await loadGoogleAccount(transaction.uid);
  const refreshToken = tokens.refresh_token
    ?? existing?.refreshTokenCiphertext
    ?? null;
  if (!refreshToken) return redirectError(res, 'google_refresh_token_missing');

  await saveGoogleAccount(transaction.uid, {
    permissionId: about.data.user?.permissionId ?? null,
    email: about.data.user?.emailAddress ?? null,
    refreshTokenCiphertext: tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : existing!.refreshTokenCiphertext,
    scopes: tokens.scope ?? 'https://www.googleapis.com/auth/drive.appdata',
    needsReauth: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await consumeOAuthTransaction(transaction.id);

  return res.redirect(`${frontendOrigin}/profile/data?google=connected`);
}
```

Không đưa `code`, `state`, access token, refresh token hoặc lỗi raw của Google vào URL redirect về frontend. Chỉ dùng mã lỗi nội bộ ngắn hạn. Nếu không có refresh token mới, phải giữ refresh token cũ thay vì ghi đè bằng `null`.

## 8. Refresh token ở backend

Dùng `googleapis` ở Functions. Helper này lấy account theo Firebase `uid`, giải mã refresh token, gọi Google và để Google client lấy access token mới. Browser không tham gia bước này.

```ts
const refreshInFlight = new Map<string, Promise<string>>();

export async function getDriveClient(uid: string) {
  const account = await loadGoogleAccount(uid);
  if (!account || account.needsReauth || !account.refreshTokenCiphertext) {
    throw new GoogleReauthRequiredError();
  }

  const refreshToken = decryptSecret(account.refreshTokenCiphertext);
  const oauth = new google.auth.OAuth2(
    googleClientId.value(),
    googleClientSecret.value(),
    googleRedirectUri.value(),
  );
  oauth.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: 'v3', auth: oauth });
  return { drive, oauth };
}

export async function withDriveClient<T>(uid: string, work: (drive: drive_v3.Drive) => Promise<T>) {
  const running = refreshInFlight.get(uid);
  if (running) await running;

  const refreshPromise = (async () => {
    const { oauth } = await getDriveClient(uid);
    await oauth.getAccessToken();
  })();
  refreshInFlight.set(uid, refreshPromise);

  try {
    await refreshPromise;
    const { drive } = await getDriveClient(uid);
    return await work(drive);
  } catch (error) {
    if (isInvalidGrant(error)) {
      await markGoogleAccountNeedsReauth(uid);
      throw new GoogleReauthRequiredError();
    }
    throw error;
  } finally {
    refreshInFlight.delete(uid);
  }
}
```

Trong code production, nên dùng cache/lock phân tán như Firestore lease hoặc Redis nếu Functions có nhiều instance. `Map` chỉ chống refresh trùng trong cùng một instance. Có thể đơn giản hóa bằng cách để `googleapis` tự refresh trong từng request, nhưng vẫn phải xử lý `invalid_grant` và tránh nhiều request đồng thời ghi đè refresh token.

Nếu Google trả refresh token mới, cập nhật ciphertext bằng transaction/optimistic versioning. Nếu trả `invalid_grant`, đánh dấu `needsReauth: true`, ngừng retry vô hạn và trả về:

```json
{
  "error": {
    "code": "GOOGLE_REAUTH_REQUIRED",
    "message": "Google Drive cần được kết nối lại."
  }
}
```

## 9. API proxy cho Google Drive

Frontend gọi API của Kinly, không gọi `www.googleapis.com` trực tiếp:

```text
GET    /api/google/status
GET    /api/google/media
POST   /api/google/backup
DELETE /api/google/media/:fileId
POST   /api/google/disconnect
```

Mỗi endpoint lấy `uid` từ Firebase ID token rồi gọi `withDriveClient(uid, ...)`. Ví dụ:

```ts
export async function listMedia(req: Request, res: Response) {
  const user = await requireFirebaseUser(req);
  const result = await withDriveClient(user.uid, (drive) =>
    drive.files.list({
      spaces: 'appDataFolder',
      q: "trashed = false",
      fields: 'files(id,name,mimeType,size,modifiedTime,md5Checksum)',
      pageSize: 100,
    }),
  );

  return res.json({ files: result.data.files ?? [] });
}
```

Không nhận `uid` từ body. Với delete/backup, kiểm tra path, file ID, ownership và CSRF/origin policy. Nếu chỉ dùng Firebase ID token qua `Authorization` header và API cùng origin, vẫn nên chặn origin lạ cho mutation.

## 10. Firebase Hosting rewrites

Ví dụ `firebase.json`:

```json
{
  "hosting": {
    "public": "app/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "function": {
          "functionId": "googleApi",
          "region": "asia-southeast1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "functions": {
    "source": "functions"
  }
}
```

Rewrite `/api/**` phải đứng trước catch-all `**`; nếu đặt sau, request callback/API có thể bị trả về SPA `index.html` thay vì tới Function. Firebase Hosting hỗ trợ route tới Functions qua rewrite và giữ nguyên path/query gốc khi chuyển request [2].

Nếu tên output build hiện tại của Kinly khác `app/dist`, thay `public` đúng theo pipeline đang dùng. Kiểm tra lại bằng `firebase emulators:start` trước khi deploy production.

## 11. Thay đổi frontend Kinly

Trong `GoogleDriveDataView`, `GoogleSyncCard` và `googleDriveSync.ts`:

| Hiện tại | Cần chuyển thành |
|---|---|
| Load `https://accounts.google.com/gsi/client` | Xóa sau khi migration ổn định |
| `initTokenClient()`/`requestAccessToken()` | `window.location.assign('/api/google/oauth/start')` sau click |
| Access token trong module memory | Không giữ Google token ở browser |
| Gọi Drive API trực tiếp | Gọi `/api/google/media`, `/api/google/backup` |
| `isGoogleLinked()` từ localStorage | `GET /api/google/status` |
| Auto-sync tự kiểm tra token Google | Auto-sync gọi backend bằng Firebase ID token |
| `auth-required` sau reload vì memory mất | Backend refresh ngầm; chỉ `GOOGLE_REAUTH_REQUIRED` khi refresh token bị revoke/hỏng |

Frontend vẫn có thể dùng localStorage cho UI preference như `autoSyncEnabled`, nhưng không dùng localStorage làm nguồn sự thật về quyền Google. Sau callback, gọi lại `/api/google/status` để lấy trạng thái server.

## 12. Deploy và kiểm thử

### Local emulator

```bash
firebase use <project-id>
firebase emulators:start --only auth,functions,firestore,hosting
```

Dùng redirect URI của emulator đã đăng ký riêng trong Google Cloud. Không trộn redirect URI production với local.

### Deploy secrets và Functions

```bash
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY
firebase deploy --only functions,hosting,firestore
```

Firebase yêu cầu deploy lại function sau khi đổi secret để version function nhận secret mới [4].

### Test bắt buộc

| Test | Kỳ vọng |
|---|---|
| Reload SPA | Không mở Google OAuth; Firebase Auth khôi phục user; status Drive lấy từ backend |
| Access token Google hết hạn | Backend tự refresh và request Drive tiếp tục thành công |
| Hai request Drive đồng thời | Không tạo refresh storm hoặc ghi đè token sai |
| `invalid_grant` | Đánh dấu `needsReauth`, trả `GOOGLE_REAUTH_REQUIRED`, không retry vô hạn |
| Callback state sai | Từ chối callback |
| Callback state dùng lại | Từ chối lần hai |
| PKCE verifier sai | Token exchange thất bại |
| User A gọi account User B | Không thể vì account lookup theo Firebase `uid` |
| Refresh token bị thiếu | UI hiện nút kết nối lại, không hiển thị token/raw error |
| Log/response | Không có code, access token, refresh token, client secret |
| Disconnect | Xóa hoặc vô hiệu hóa refresh token; auto-sync dừng |

## 13. Thứ tự migration khuyến nghị

**Bước 1:** Thiết lập Firebase Auth user identity, Functions 2nd gen, Firestore collection và Secret Manager. Chưa xóa GIS cũ.

**Bước 2:** Thêm `/api/google/oauth/start`, `/api/google/oauth/callback`, `/api/google/status` và kiểm thử callback/PKCE/state.

**Bước 3:** Chuyển list/upload/download/delete Drive sang Functions proxy. Giữ format response tương thích với UI hiện tại.

**Bước 4:** Chuyển nút kết nối Google sang backend redirect và bật feature flag cho nhóm test nhỏ.

**Bước 5:** Chuyển auto-sync sang API proxy. Kiểm thử reload, token hết hạn và `invalid_grant`.

**Bước 6:** Xóa Google GIS token client, code gọi Drive trực tiếp từ browser và mọi logic coi localStorage là nguồn sự thật về liên kết Google.

## 14. Checklist bảo mật cuối

> Refresh token chỉ xuất hiện trong backend memory trong khoảng thời gian cần thiết để refresh; bản lưu lâu dài phải được mã hóa trong Firestore và khóa mã hóa phải nằm trong Secret Manager/KMS.

| Mục | Điều kiện đạt |
|---|---|
| Google client secret | Chỉ Functions được bind Secret Manager secret |
| Refresh token | Encrypted at rest, gắn với Firebase `uid`, không có trong response/log/URL |
| Firebase ID token | Backend verify bằng Admin SDK; không tin `uid` từ request |
| OAuth state | Random, one-time, TTL ngắn, gắn với `uid` |
| PKCE | S256, verifier lưu server-side dưới dạng ciphertext |
| Redirect URI | Exact match theo environment |
| Hosting rewrite | `/api/**` đứng trước `**` |
| Firestore rules | Client không đọc collection token; Functions dùng Admin SDK có kiểm soát |
| Google scopes | Giữ `drive.appdata` nếu chỉ backup riêng của app |
| Refresh failure | `invalid_grant` chuyển sang reauth có kiểm soát |
| Multi-instance | Có lock/lease khi refresh song song |
| Disconnect | Xóa/invalidate token và tắt auto-sync |

### References

[1]: https://developers.google.com/identity/protocols/oauth2/web-server "Google Developers — Using OAuth 2.0 for Web Server Applications"

[2]: https://firebase.google.com/docs/hosting/full-config "Firebase — Configure Hosting behavior"

[3]: https://firebase.google.com/docs/auth "Firebase — Authentication"

[4]: https://firebase.google.com/docs/functions/config-env "Firebase — Configure your environment"

[5]: https://firebase.google.com/docs/auth/admin/create-custom-tokens "Firebase — Create Custom Tokens"
