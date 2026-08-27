import { afterEach, describe, expect, it, vi } from 'vitest';

type ActivateEventHandler = (event: {
  type: 'activate';
  waitUntil: (promise: Promise<unknown>) => void;
}) => void;

async function activateServiceWorker({ hasActiveWorker }: { hasActiveWorker: boolean }) {
  const activateHandlers: ActivateEventHandler[] = [];
  const navigate = vi.fn().mockResolvedValue(undefined);
  const appUrl = new URL('https://baby-growth.test/');
  const cache = {
    delete: vi.fn().mockResolvedValue(true),
    keys: vi.fn().mockResolvedValue([]),
  };
  const caches = {
    delete: vi.fn().mockResolvedValue(true),
    keys: vi.fn().mockResolvedValue([]),
    open: vi.fn().mockResolvedValue(cache),
  };
  const serviceWorker = {
    __WB_MANIFEST: [{ revision: 'test', url: 'index.html' }],
    addEventListener: vi.fn((type: string, handler: ActivateEventHandler) => {
      if (type === 'activate') activateHandlers.push(handler);
    }),
    caches,
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue([{ url: appUrl.href, navigate }]),
      openWindow: vi.fn(),
    },
    location: appUrl,
    registration: {
      active: hasActiveWorker ? { scriptURL: `${appUrl.href}sw.js` } : null,
      scope: appUrl.href,
    },
    skipWaiting: vi.fn(),
  };

  vi.stubGlobal('self', serviceWorker);
  vi.stubGlobal('caches', caches);
  vi.stubGlobal('location', appUrl);
  vi.stubGlobal('registration', serviceWorker.registration);

  await import('./sw');

  const lifetimePromises: Promise<unknown>[] = [];
  for (const handler of activateHandlers) {
    handler({
      type: 'activate',
      waitUntil: (promise) => lifetimePromises.push(promise),
    });
  }
  await Promise.all(lifetimePromises);

  return { navigate, serviceWorker };
}

describe('service worker activation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('claims clients without navigating an app window during first activation', async () => {
    const { navigate, serviceWorker } = await activateServiceWorker({ hasActiveWorker: false });

    expect(serviceWorker.clients.claim).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps an open app window intact when an updated worker activates', async () => {
    const { navigate, serviceWorker } = await activateServiceWorker({ hasActiveWorker: true });

    expect(serviceWorker.clients.claim).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});
