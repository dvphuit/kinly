import { expect, test, type Page } from '@playwright/test';

async function suppressPwaBadge(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.PWABadge { display: none !important; }' });
}

async function waitForPersistedFeedingAmount(page: Page, amountMl: number): Promise<void> {
  await expect.poll(async () => page.evaluate(async (expectedAmount) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('babygrowth-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open BabyGrowth IndexedDB'));
    });

    try {
      const rows = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('journalEntries', 'readonly').objectStore('journalEntries').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to read persisted activities'));
      });
      if (!Array.isArray(rows)) return false;
      return rows.some((row: unknown) => {
        if (typeof row !== 'object' || row === null || !('kind' in row) || row.kind !== 'activity' || !('payload' in row)) {
          return false;
        }
        const payload = row.payload;
        return typeof payload === 'object'
          && payload !== null
          && 'type' in payload
          && payload.type === 'feeding'
          && 'amountMl' in payload
          && payload.amountMl === expectedAmount;
      });
    } finally {
      db.close();
    }
  }, amountMl)).toBe(true);
}

async function completeOfflineOnboarding(page: Page, childName = 'Bé E2E'): Promise<void> {
  await page.goto('/');
  await suppressPwaBadge(page);
  await expect(page.locator('#stepGoogleAuth')).toBeVisible();

  await page.locator('#btnDevBypass').click();
  await expect(page.locator('#stepProfileForm')).toBeVisible();

  await page.locator('#inputChildName').fill(childName);
  await page.locator('#btnCompleteOnboarding').click();

  await expect(page.locator('#appMainContent')).toBeVisible();
  await expect(page.locator('#navTabHome')).toBeVisible();
}

async function beginPull(page: Page, distance: number) {
  const rootBox = await page.locator('.ptr-root').boundingBox();
  if (!rootBox) throw new Error('Pull-to-refresh root must be visible.');

  const client = await page.context().newCDPSession(page);
  const x = rootBox.x + rootBox.width / 2;
  const startY = rootBox.y + 18;
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: startY }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x, y: startY + distance }],
  });

  return client;
}

async function readTopGap(page: Page, contentSelector: string): Promise<number> {
  const [headerBox, cardBox] = await Promise.all([
    page.locator('#mainHeader').boundingBox(),
    page.locator(contentSelector).boundingBox(),
  ]);
  if (!headerBox || !cardBox) throw new Error(`Header and ${contentSelector} must be visible.`);
  return cardBox.y - (headerBox.y + headerBox.height);
}

const PRIMARY_TABS = [
  { key: 'home', navId: '#navTabHome', path: '/', contentSelector: '.haven-daily-summary-card' },
  { key: 'timeline', navId: '#navTabTimeline', path: '/timeline', contentSelector: '.journal-calendar' },
  { key: 'growth', navId: '#navTabGrowth', path: '/growth', contentSelector: '.haven-growth-summary-card' },
  { key: 'expenses', navId: '#navTabExpenses', path: '/expenses', contentSelector: '.haven-expense-summary-card' },
] as const;

type PrimaryTab = (typeof PRIMARY_TABS)[number];

async function openPrimaryTab(page: Page, tab: PrimaryTab): Promise<void> {
  await page.locator(tab.navId).click();
  await expect(page).toHaveURL(new RegExp(`${tab.path === '/' ? '/' : tab.path}$`));
  await expect(page.locator(tab.contentSelector)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

async function runSoftRefresh(page: Page): Promise<void> {
  await expect(page.locator('html')).not.toHaveAttribute('data-tab-direction', { timeout: 1_000 });
  const client = await beginPull(page, 140);
  await expect(page.locator('.ptr-label')).toHaveText('Thả để làm mới');
  await expect(page.locator('.ptr-sprout-icon')).toBeVisible();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();

  const root = page.locator('.ptr-root');
  await expect(root).toHaveClass(/is-refreshing/);
  await expect(root).not.toHaveClass(/is-refreshing/, { timeout: 2_000 });
  await expect.poll(() => page.locator('.ptr-content').evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    return transform === 'none' ? 0 : new DOMMatrix(transform).m42;
  })).toBe(0);
}

async function addMomentFromQuickLog(page: Page, title: string): Promise<void> {
  await page.locator('#fabCenterBtn').click();
  await page.getByRole('button', { name: 'Khoảnh khắc', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Khoảnh khắc' });
  await dialog.getByLabel('Tiêu đề').fill(title);
  await dialog.getByRole('button', { name: 'Lưu ghi nhận' }).click();
  await expect(dialog).not.toBeVisible();
}

test.describe('critical browser journeys', () => {
  test('offline onboarding persists across a reload', async ({ page }) => {
    await completeOfflineOnboarding(page);

    await page.reload();

    await expect(page.locator('#appMainContent')).toBeVisible();
    await expect(page.locator('#navTabHome')).toBeVisible();
    await expect(page.locator('#onboardingScreen')).toHaveCount(0);
  });

  test('soft pull-to-refresh settles below the sticky app bar', async ({ page }) => {
    await completeOfflineOnboarding(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const initialGap = await readTopGap(page, '.haven-daily-summary-card');

    await page.locator('#navTabExpenses').click();
    await expect(page).toHaveURL(/\/expenses$/);
    await page.locator('#navTabHome').click();
    await expect(page).toHaveURL(/\/$/);
    const gapAfterTabSwitch = await readTopGap(page, '.haven-daily-summary-card');
    expect(gapAfterTabSwitch).toBeCloseTo(initialGap, 1);

    await runSoftRefresh(page);

    const gapAfterRefresh = await readTopGap(page, '.haven-daily-summary-card');
    expect(gapAfterRefresh).toBeCloseTo(initialGap, 1);
    expect(gapAfterRefresh).toBeGreaterThanOrEqual(1);
  });

  test('all primary tabs use the same top gap below the app bar', async ({ page }) => {
    await completeOfflineOnboarding(page);
    const expectedGap = await page.locator('#appMainContent').evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).paddingTop)
    ));
    const expectedGaps = Object.fromEntries(PRIMARY_TABS.map((tab) => [tab.key, expectedGap]));
    const directLoadGaps: Record<string, number> = {};

    for (const tab of PRIMARY_TABS) {
      await page.goto(tab.path);
      await expect(page.locator('#mainHeader')).toBeVisible();
      await expect(page.locator(tab.contentSelector)).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      directLoadGaps[tab.key] = await readTopGap(page, tab.contentSelector);
    }
    expect(directLoadGaps).toEqual(expectedGaps);

    const forwardGaps: Record<string, number> = {};
    await page.goto('/');

    for (const tab of PRIMARY_TABS) {
      await openPrimaryTab(page, tab);
      forwardGaps[tab.key] = await readTopGap(page, tab.contentSelector);
    }
    expect(forwardGaps).toEqual(expectedGaps);

    const reverseGaps: Record<string, number> = {};
    for (const tab of [...PRIMARY_TABS].reverse()) {
      await openPrimaryTab(page, tab);
      reverseGaps[tab.key] = await readTopGap(page, tab.contentSelector);
    }
    expect(reverseGaps).toEqual(expectedGaps);

  });

  test('primary tab transitions follow navigation direction without shifting vertically', async ({ page }) => {
    await completeOfflineOnboarding(page);
    await expect(page.locator('.haven-daily-summary-card')).toBeVisible();
    await expect.poll(async () => readTopGap(page, '.haven-daily-summary-card')).toBe(4);
    const baselineGap = await readTopGap(page, '.haven-daily-summary-card');
    const root = page.locator('html');
    await expect(root).toHaveClass(/has-vt/);
    await page.evaluate(() => {
      const startViewTransition = document.startViewTransition.bind(document);
      document.startViewTransition = (callback) => {
        document.documentElement.dataset.vtStarted = 'true';
        return startViewTransition(callback);
      };
    });

    await page.locator('#navTabGrowth').click();
    await expect(page).toHaveURL(/\/growth$/);
    await expect(root).toHaveAttribute('data-vt-started', 'true');
    await expect(root).toHaveAttribute('data-tab-direction', 'forward');
    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement, '::view-transition-new(app-route-surface)').animationName
    ))).toBe('havenRouteTabIn');
    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement, '::view-transition-new(bottom-nav-active-tab)').animationName
    ))).toBe('havenRouteTabIn');
    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement, '::view-transition-old(bottom-nav-active-tab)').display
    ))).toBe('none');
    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement, '::view-transition-group(bottom-nav-active-tab)').zIndex
    ))).toBe('51');
    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement, '::view-transition-old(bottom-nav)').display
    ))).toBe('none');
    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement, '::view-transition-new(bottom-nav)').mixBlendMode
    ))).toBe('normal');
    await expect(page.locator('.haven-growth-summary-card')).toBeVisible();
    await expect.poll(async () => readTopGap(page, '.haven-growth-summary-card')).toBe(baselineGap);

    await expect(root).not.toHaveAttribute('data-tab-direction', { timeout: 1_000 });
    await page.locator('#navTabTimeline').click();
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(root).toHaveAttribute('data-tab-direction', 'backward');
    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement, '::view-transition-new(app-route-surface)').animationName
    ))).toBe('havenRouteTabIn');
    await expect(page.locator('.journal-calendar')).toBeVisible();
    await expect.poll(async () => readTopGap(page, '.journal-calendar')).toBe(baselineGap);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(root).not.toHaveAttribute('data-tab-direction', { timeout: 1_000 });
    await page.locator('#navTabExpenses').click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(root).toHaveAttribute('data-tab-direction', 'forward');
    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement, '::view-transition-new(app-route-surface)').animationName
    ))).toBe('none');
  });

  test('primary tabs keep a directional fallback when the View Transition API is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: undefined,
      });
    });
    await completeOfflineOnboarding(page);
    await expect(page.locator('.haven-daily-summary-card')).toBeVisible();
    await expect.poll(async () => readTopGap(page, '.haven-daily-summary-card')).toBe(4);
    const baselineGap = await readTopGap(page, '.haven-daily-summary-card');
    const root = page.locator('html');
    await expect(root).not.toHaveClass(/has-vt/);

    await page.locator('#navTabGrowth').click();
    await expect(page).toHaveURL(/\/growth$/);
    await expect(root).toHaveAttribute('data-tab-direction', 'forward');
    await expect(page.locator('.app-route-surface')).toHaveCSS('animation-name', 'havenRouteTabIn');
    await expect(page.locator('#navTabGrowth .nav-tab-active-pill')).toHaveCSS('animation-name', 'havenRouteTabIn');
    await expect(page.locator('.haven-growth-summary-card')).toBeVisible();
    await expect.poll(async () => readTopGap(page, '.haven-growth-summary-card')).toBe(baselineGap);
  });

  test('quick feeding log persists and rehydrates its details', async ({ page }) => {
    await completeOfflineOnboarding(page);

    await page.locator('#fabCenterBtn').click();
    await expect(page.getByRole('dialog', { name: 'Ghi nhanh cho Bé' })).toBeVisible();
    await page.getByRole('button', { name: 'Cữ bú' }).click();

    const saveButton = page.getByRole('button', { name: 'Lưu ghi nhận' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await expect(page.getByText('Đã lưu cữ bú.', { exact: true })).toBeVisible();
    await waitForPersistedFeedingAmount(page, 90);

    await page.locator('#navTabTimeline').click();
    await expect(page).toHaveURL(/\/timeline$/);
    const feedingSummary = page.getByRole('button', { name: /^Cữ bú,/ }).first();
    await expect(feedingSummary).toBeVisible();
    await expect(feedingSummary).toContainText('90 ml');

    await page.reload();

    await expect(page).toHaveURL(/\/timeline$/);
    const feedingEntry = page.getByRole('button', { name: /^Cữ bú,/ }).first();
    await expect(feedingEntry).toBeVisible();
    await feedingEntry.click();
    await page.getByRole('button', { name: 'Chỉnh sửa' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Lượng sữa (ml)' })).toHaveValue('90');
  });

  test('gallery keeps every photo and video from one multi-file selection', async ({ page }) => {
    await completeOfflineOnboarding(page);

    await page.locator('#fabCenterBtn').click();
    await page.getByRole('button', { name: 'Khoảnh khắc', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Khoảnh khắc' });
    const galleryInput = dialog.getByLabel('Chọn từ thư viện');
    await galleryInput.setInputFiles([
      { name: 'first.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('first-photo') },
      { name: 'second.mp4', mimeType: 'video/mp4', buffer: Buffer.from('second-video') },
      { name: 'third.webp', mimeType: 'image/webp', buffer: Buffer.from('third-photo') },
    ]);

    await expect(dialog.getByText('3 mục · có thể thêm tiếp')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Bỏ media/ })).toHaveCount(3);
  });

  test('new moments appear on the current Home and Timeline pages without a tab switch', async ({ page }) => {
    await completeOfflineOnboarding(page);

    await addMomentFromQuickLog(page, 'Hiện ngay ở Trang chủ');
    await expect(page.locator('.journal-story-title', { hasText: 'Hiện ngay ở Trang chủ' })).toBeVisible();

    await page.locator('#navTabTimeline').click();
    await expect(page).toHaveURL(/\/timeline$/);
    await addMomentFromQuickLog(page, 'Hiện ngay ở Nhật ký');
    await expect(page.locator('.journal-story-title', { hasText: 'Hiện ngay ở Nhật ký' })).toBeVisible();
  });

  test('shared overlay is a bottom sheet on mobile and a centered dialog on desktop', async ({ page }) => {
    await completeOfflineOnboarding(page);

    await page.locator('#fabCenterBtn').click();
    const quickSheet = page.getByRole('dialog', { name: 'Ghi nhanh cho Bé' });
    await expect(quickSheet).toBeVisible();
    await expect(quickSheet.locator('.sheet-handle-bar')).toBeVisible();
    await quickSheet.getByRole('button', { name: 'Cữ bú' }).click();

    const feedingSheet = page.getByRole('dialog', { name: 'Cữ bú' });
    await expect(feedingSheet).toBeVisible();
    await expect(feedingSheet.locator('.sheet-handle-bar')).toBeVisible();
    await page.waitForTimeout(220);
    const dragHandle = feedingSheet.locator('.sheet-handle-bar');
    const handleBox = await dragHandle.boundingBox();
    if (!handleBox) throw new Error('Mobile sheet handle must be visible.');
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 120, { steps: 4 });
    await page.mouse.up();
    await expect(feedingSheet).toHaveCount(0);

    await page.locator('#fabCenterBtn').click();
    await page.getByRole('dialog', { name: 'Ghi nhanh cho Bé' }).getByRole('button', { name: 'Cữ bú' }).click();
    await page.getByRole('dialog', { name: 'Cữ bú' }).getByRole('button', { name: 'Lưu ghi nhận' }).click();
    await expect(page.getByText('Đã lưu cữ bú.', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('#fabCenterBtn').click();
    const desktopSheet = page.getByRole('dialog', { name: 'Ghi nhanh cho Bé' });
    await expect(desktopSheet).toBeVisible();
    await expect(desktopSheet.locator('.sheet-handle-bar')).toBeHidden();
    await page.waitForTimeout(220);
    const desktopBox = await desktopSheet.boundingBox();
    if (!desktopBox) throw new Error('Desktop sheet dialog must be visible.');
    expect(desktopBox.x).toBeGreaterThan(0);
    expect(desktopBox.y).toBeGreaterThan(0);
    expect(desktopBox.y + desktopBox.height).toBeLessThan(800);
    await page.keyboard.press('Escape');
    await expect(desktopSheet).toHaveCount(0);
  });

  test('growth preview keeps its edit action visible above the mobile viewport edge', async ({ page }) => {
    await completeOfflineOnboarding(page);

    await page.locator('#navTabGrowth').click();
    await expect(page).toHaveURL(/\/growth$/);
    await page.locator('#btnQuickAddGrowthMeasurement').click();
    await page.getByRole('button', { name: 'Lưu số đo' }).click();

    await page.locator('.haven-growth-history-row').first().click();
    const preview = page.getByRole('dialog', { name: 'Chi tiết cân đo' });
    const sheetFooter = preview.locator('.sheet-footer');
    await expect(sheetFooter.getByRole('button', { name: 'Chỉnh sửa' })).toBeVisible();

    const [sheetBox, footerBox] = await Promise.all([
      preview.boundingBox(),
      sheetFooter.boundingBox(),
    ]);
    expect(sheetBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    expect((footerBox?.y ?? 0) + (footerBox?.height ?? 0))
      .toBeLessThanOrEqual((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0) + 1);

    await sheetFooter.getByRole('button', { name: 'Chỉnh sửa' }).click();
    await expect(page.getByRole('dialog', { name: 'Chỉnh sửa số đo' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Cân nặng (kg)' })).toBeVisible();
  });
});
