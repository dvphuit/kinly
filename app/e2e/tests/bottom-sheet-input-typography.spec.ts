import { expect, test, type Locator } from '@playwright/test';

async function readFieldTypography(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
    };
  });
}

test('bottom-sheet native and custom field controls share one input text style in standalone mode', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    document.documentElement.classList.add('is-standalone');

    const featureOverride = document.createElement('style');
    featureOverride.textContent = `
      .growth-metric-input-wrap .growth-metric-input {
        font-family: var(--font-family-display);
        font-size: 15px;
        font-weight: 800;
      }
      .journal-edit-form label > span {
        font: 700 9px var(--font-family-body);
      }
      .journal-care-note > span {
        font: 760 9.5px/1.3 var(--font-family-body);
      }
    `;
    document.head.append(featureOverride);

    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet';
    sheet.innerHTML = `
      <div class="sheet-content-body">
        <input id="sheet-text" type="text" value="Kinly" />
        <textarea id="sheet-textarea">Kinly</textarea>
        <select id="sheet-select"><option>Kinly</option></select>
        <div class="growth-metric-input-wrap">
          <input id="sheet-growth" class="log-input-control growth-metric-input" type="number" value="8.6" />
        </div>
        <button id="sheet-dropdown" type="button" data-field-control="input-text">Mốc 8m</button>
        <button id="sheet-date" type="button" data-field-control="input-text">28/08/2026</button>
        <div class="journal-edit-form">
          <label class="journal-edit-wide">
            <span id="sheet-note-label">Ghi chú</span>
            <textarea id="sheet-note" rows="3">Kinly</textarea>
          </label>
        </div>
        <label class="journal-care-note">
          <span id="sheet-care-note-label">Ghi chú</span>
          <textarea id="sheet-care-note" rows="2">Kinly</textarea>
        </label>
      </div>
    `;
    document.body.append(sheet);
  });

  const bodyFontFamily = await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily);
  const selectors = [
    '#sheet-text',
    '#sheet-textarea',
    '#sheet-select',
    '#sheet-growth',
    '#sheet-dropdown',
    '#sheet-date',
    '#sheet-note',
    '#sheet-care-note',
  ];

  for (const selector of selectors) {
    const typography = await readFieldTypography(page.locator(selector));
    expect(typography.fontFamily).toBe(bodyFontFamily);
    expect(typography.fontSize).toBe('16px');
    expect(typography.fontWeight).toBe('600');
  }

  for (const selector of ['#sheet-note-label', '#sheet-care-note-label']) {
    const typography = await readFieldTypography(page.locator(selector));
    expect(typography.fontFamily).toBe(bodyFontFamily);
    expect(typography.fontSize).toBe('11px');
    expect(typography.fontWeight).toBe('700');
  }
});
