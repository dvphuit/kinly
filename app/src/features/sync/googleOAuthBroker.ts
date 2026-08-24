import { getLocalRecord, removeLocalRecord, setLocalRecord } from '@/data/localDb';

const BROKER_SESSION_KEY = 'babygrowth_v4_google_oauth_broker_session';
const COMPLETION_CHANNEL_PREFIX = 'kinly-google-oauth:';
const POPUP_TIMEOUT_MS = 2 * 60 * 1000;

export interface GoogleOAuthBrokerToken {
  accessToken: string;
  expiresIn: number;
}

interface BrokerStartResponse {
  authorizationUrl: string;
  attemptToken: string;
}

interface BrokerCompleteResponse extends GoogleOAuthBrokerToken {
  status: 'complete';
  attemptToken: string;
  sessionToken: string;
}

interface BrokerErrorResponse {
  status: 'error';
  attemptToken: string;
  error: string;
  errorDescription?: string;
}

type BrokerResultResponse = BrokerCompleteResponse | BrokerErrorResponse;

function getBrokerBaseUrl(): URL | null {
  const raw = import.meta.env.VITE_GOOGLE_AUTH_WORKER_URL;
  if (typeof raw !== 'string' || !raw.trim()) return null;

  try {
    const url = new URL(raw.trim());
    const localDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) return null;
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function parseTokenPayload(value: unknown): GoogleOAuthBrokerToken {
  if (typeof value !== 'object' || value === null) {
    throw new Error('OAuth broker trả về dữ liệu không hợp lệ.');
  }
  if (!('accessToken' in value) || typeof value.accessToken !== 'string' || !value.accessToken) {
    throw new Error('OAuth broker không trả về Google access token.');
  }
  const expiresIn = 'expiresIn' in value && typeof value.expiresIn === 'number' && Number.isFinite(value.expiresIn)
    ? value.expiresIn
    : 3600;
  return { accessToken: value.accessToken, expiresIn };
}

function parseStartPayload(value: unknown): BrokerStartResponse {
  if (
    typeof value !== 'object' || value === null
    || !('authorizationUrl' in value) || typeof value.authorizationUrl !== 'string'
    || !('attemptToken' in value) || typeof value.attemptToken !== 'string' || !value.attemptToken
  ) {
    throw new Error('OAuth broker không trả về yêu cầu xác thực hợp lệ.');
  }
  return { authorizationUrl: value.authorizationUrl, attemptToken: value.attemptToken };
}

function parseResultPayload(value: unknown): BrokerResultResponse {
  if (
    typeof value !== 'object' || value === null
    || !('status' in value) || typeof value.status !== 'string'
    || !('attemptToken' in value) || typeof value.attemptToken !== 'string' || !value.attemptToken
  ) {
    throw new Error('OAuth broker trả về trạng thái xác thực không hợp lệ.');
  }

  if (value.status === 'error' && 'error' in value && typeof value.error === 'string') {
    return {
      status: 'error',
      attemptToken: value.attemptToken,
      error: value.error,
      ...('errorDescription' in value && typeof value.errorDescription === 'string'
        ? { errorDescription: value.errorDescription }
        : {}),
    };
  }

  if (value.status === 'complete' && 'sessionToken' in value && typeof value.sessionToken === 'string' && value.sessionToken) {
    return {
      status: 'complete',
      attemptToken: value.attemptToken,
      sessionToken: value.sessionToken,
      ...parseTokenPayload(value),
    };
  }

  throw new Error('OAuth broker trả về trạng thái xác thực không hoàn chỉnh.');
}

async function readResponseError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === 'object' && payload !== null) {
    if ('message' in payload && typeof payload.message === 'string') return payload.message;
    if (
      'error' in payload && typeof payload.error === 'object' && payload.error !== null
      && 'message' in payload.error && typeof payload.error.message === 'string'
    ) {
      return payload.error.message;
    }
  }
  return `OAuth broker trả về lỗi ${response.status}.`;
}

async function revokeBrokerSession(sessionToken: string): Promise<void> {
  const base = getBrokerBaseUrl();
  if (!base) return;
  await fetch(new URL('/oauth/session', base), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

function waitForAuthorizationResult(attemptToken: string): Promise<BrokerCompleteResponse> {
  if (typeof BroadcastChannel === 'undefined') {
    throw new Error('Trình duyệt này chưa hỗ trợ hoàn tất xác thực Google an toàn.');
  }

  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(`${COMPLETION_CHANNEL_PREFIX}${attemptToken}`);
    const timeout = window.setTimeout(() => {
      channel.close();
      reject(new Error('Xác thực Google hết thời gian chờ. Hãy thử lại.'));
    }, POPUP_TIMEOUT_MS);

    channel.onmessage = (event: MessageEvent<unknown>) => {
      let result: BrokerResultResponse;
      try {
        result = parseResultPayload(event.data);
      } catch {
        return;
      }
      if (result.attemptToken !== attemptToken) return;

      window.clearTimeout(timeout);
      channel.close();
      if (result.status === 'complete') {
        resolve(result);
        return;
      }
      reject(new Error(result.errorDescription || result.error));
    };
  });
}

export function isGoogleOAuthBrokerConfigured(): boolean {
  return getBrokerBaseUrl() !== null;
}

export async function restoreGoogleAccessTokenFromBroker(): Promise<GoogleOAuthBrokerToken | null> {
  const base = getBrokerBaseUrl();
  if (!base) return null;
  const sessionToken = await getLocalRecord(BROKER_SESSION_KEY);
  if (!sessionToken) return null;

  const response = await fetch(new URL('/oauth/token', base), {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  if (response.status === 401) {
    await removeLocalRecord(BROKER_SESSION_KEY);
    return null;
  }
  if (!response.ok) throw new Error(await readResponseError(response));
  return parseTokenPayload(await response.json());
}

export async function requestGoogleAccessTokenFromBroker(options: {
  selectAccount?: boolean;
  loginHint?: string;
} = {}): Promise<GoogleOAuthBrokerToken> {
  const base = getBrokerBaseUrl();
  if (!base) throw new Error('Google OAuth broker chưa được cấu hình.');
  if (typeof window === 'undefined') throw new Error('Google OAuth chỉ khả dụng trong trình duyệt.');

  const popup = window.open(
    'about:blank',
    'kinly-google-oauth',
    'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes',
  );
  if (!popup) throw new Error('Trình duyệt đã chặn cửa sổ Google. Hãy cho phép popup rồi thử lại.');

  try {
    popup.document.title = 'Kinly · Google Drive';
    popup.document.body.textContent = 'Đang mở Google để cấp quyền cho Kinly…';
  } catch {
    // about:blank is normally same-origin; failure here should not block OAuth.
  }

  const previousSessionPromise = getLocalRecord(BROKER_SESSION_KEY);

  try {
    const response = await fetch(new URL('/oauth/start', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectAccount: options.selectAccount === true,
        ...(options.loginHint ? { loginHint: options.loginHint } : {}),
      }),
    });
    if (!response.ok) throw new Error(await readResponseError(response));

    const start = parseStartPayload(await response.json());
    const resultPromise = waitForAuthorizationResult(start.attemptToken);
    popup.location.href = start.authorizationUrl;
    const result = await resultPromise;

    const previousSession = await previousSessionPromise;
    await setLocalRecord(BROKER_SESSION_KEY, result.sessionToken);
    if (previousSession && previousSession !== result.sessionToken) {
      await revokeBrokerSession(previousSession).catch(() => {});
    }
    try {
      popup.close();
    } catch {
      // Ignore popup cleanup failures.
    }
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  } catch (error) {
    try {
      popup.close();
    } catch {
      // Ignore popup cleanup failures.
    }
    throw error;
  }
}

export async function clearGoogleOAuthBrokerSession(): Promise<void> {
  const sessionToken = await getLocalRecord(BROKER_SESSION_KEY);
  await removeLocalRecord(BROKER_SESSION_KEY);
  if (!sessionToken) return;
  await revokeBrokerSession(sessionToken).catch(() => {});
}
