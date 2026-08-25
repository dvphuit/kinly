export type DiagnosticLogLevel = 'info' | 'warn' | 'error';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  level: DiagnosticLogLevel;
  scope: string;
  message: string;
  details?: unknown;
}

const STORAGE_KEY = 'babygrowth_diagnostic_logs';
const MAX_ENTRIES = 200;
const listeners = new Set<(entries: DiagnosticLogEntry[]) => void>();

function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/(access_token|authorization|token)(["'\s:=]+)[^\s,"'}]+/gi, '$1$2[redacted]')
    .slice(0, 4000);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message), stack: value.stack ? redactText(value.stack) : undefined };
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) return { type: value.type, size: value.size };
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [
      key,
      /access_token|authorization|token/i.test(key) ? '[redacted]' : sanitize(item, depth + 1),
    ]));
  }
  return String(value);
}

export function getDiagnosticLogs(): DiagnosticLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function logDiagnostic(
  scope: string,
  level: DiagnosticLogLevel,
  message: string,
  details?: unknown,
): void {
  const entry: DiagnosticLogEntry = {
    id: globalThis.crypto?.randomUUID?.() ?? `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    level,
    scope: redactText(scope),
    message: redactText(message),
    details: details === undefined ? undefined : sanitize(details),
  };
  const logs = getDiagnosticLogs();
  logs.push(entry);
  const trimmed = logs.length > MAX_ENTRIES ? logs.slice(-MAX_ENTRIES) : logs;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Diagnostics must never interrupt the app when storage is unavailable.
    }
  }
  listeners.forEach((listener) => listener(trimmed));
}

export function clearDiagnosticLogs(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage might be unavailable
    }
  }
  listeners.forEach((listener) => listener([]));
}

export function subscribeDiagnosticLogs(listener: (entries: DiagnosticLogEntry[]) => void): () => void {
  listeners.add(listener);
  listener(getDiagnosticLogs());
  return () => listeners.delete(listener);
}

export function formatDiagnosticLogs(entries = getDiagnosticLogs()): string {
  return entries.map((entry) => {
    const header = `${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`;
    return entry.details === undefined ? header : `${header}\n${JSON.stringify(entry.details, null, 2)}`;
  }).join('\n\n');
}

export function installGlobalDiagnosticLogging(): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleError = (event: ErrorEvent) => logDiagnostic('runtime', 'error', event.message || 'Uncaught error', {
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error,
  });
  const handleRejection = (event: PromiseRejectionEvent) => logDiagnostic('runtime', 'error', 'Unhandled promise rejection', event.reason);
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);
  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
