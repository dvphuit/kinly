import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const STYLE_ENTRY = join(SRC, 'index.css');

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

function productionSourceText() {
  const files = walk(SRC).filter((file) => {
    if (file.endsWith('.css')) return false;
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return false;
    return /\.[cm]?[jt]sx?$/.test(file);
  });
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}

function importedStylesheets() {
  const entry = readFileSync(STYLE_ENTRY, 'utf8');
  return [...entry.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function resolveStylesheet(importPath) {
  return join(SRC, importPath);
}

function classSelectors(css) {
  return new Set([...css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1]));
}

function buildReport() {
  const source = productionSourceText();
  const files = importedStylesheets();
  const selectorsByFile = new Map();
  const filesBySelector = new Map();

  for (const file of files) {
    const selectors = classSelectors(readFileSync(resolveStylesheet(file), 'utf8'));
    selectorsByFile.set(file, selectors);
    for (const selector of selectors) {
      const owners = filesBySelector.get(selector) ?? [];
      owners.push(file);
      filesBySelector.set(selector, owners);
    }
  }

  const summary = files.map((file) => {
    const selectors = selectorsByFile.get(file) ?? new Set();
    const used = [...selectors].filter((selector) => source.includes(selector));
    const unused = [...selectors].filter((selector) => !source.includes(selector));
    return {
      file,
      selectors: selectors.size,
      used: used.length,
      unused: unused.length,
      usedSelectors: used.length <= 50 ? used : used.slice(0, 20),
      unusedSample: unused.slice(0, 12),
    };
  });

  const pairCounts = new Map();
  const overlappingSelectors = [];
  for (const [selector, owners] of filesBySelector) {
    if (owners.length < 2) continue;
    overlappingSelectors.push({ selector, owners });
    for (let left = 0; left < owners.length; left += 1) {
      for (let right = left + 1; right < owners.length; right += 1) {
        const key = [owners[left], owners[right]].sort().join(' <> ');
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const overlaps = [...pairCounts.entries()]
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count);

  return { summary, overlaps, overlappingSelectors };
}

function forbiddenStyleResidues() {
  const forbiddenTokens = [
    'ai-live-dot',
    'ai-floating-speech-bubble',
    'ai-chat',
    'ai-doc-',
    'ai-suggestions',
    'header-ai-',
    'chat-bubble',
    'chat-input-field',
    'chat-send-btn',
    'Voice AI',
    'AI CHAT',
    'Freud.ai',
  ];

  return walk(SRC)
    .filter((file) => file.endsWith('.css'))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return forbiddenTokens
        .filter((token) => content.includes(token))
        .map((token) => `${relative(ROOT, file)}: ${token}`);
    });
}

describe('stylesheet architecture audit', () => {
  it('keeps removed AI and chat styles out of the stylesheet graph', () => {
    expect(forbiddenStyleResidues()).toEqual([]);
  });

  it('keeps feature and shared styles in explicit ownership folders', () => {
    expect(existsSync(join(SRC, 'styles'))).toBe(false);

    for (const featureFile of [
      join(SRC, 'features', 'home', 'home.css'),
      join(SRC, 'features', 'expenses', 'expenses.css'),
      join(SRC, 'features', 'growth', 'growth.css'),
      join(SRC, 'features', 'growth', 'growth-view.css'),
      join(SRC, 'features', 'timeline', 'timeline.css'),
      join(SRC, 'features', 'profile', 'profile.css'),
      join(SRC, 'app', 'onboarding', 'onboarding.css'),
    ]) {
      expect(existsSync(featureFile), `${relative(ROOT, featureFile)} should exist`).toBe(true);
    }

    for (const sharedFile of [
      join(SRC, 'shared', 'styles', 'tokens.css'),
      join(SRC, 'shared', 'styles', 'base.css'),
      join(SRC, 'shared', 'styles', 'shared.css'),
      join(SRC, 'shared', 'styles', 'header.css'),
      join(SRC, 'shared', 'styles', 'bottom-nav.css'),
      join(SRC, 'shared', 'styles', 'bottom-sheet.css'),
      join(SRC, 'shared', 'styles', 'modals.css'),
      join(SRC, 'shared', 'styles', 'tracker-primitives.css'),
      join(SRC, 'shared', 'styles', 'primitives.css'),
      join(SRC, 'shared', 'styles', 'native-animations.css'),
    ]) {
      expect(existsSync(sharedFile), `${relative(ROOT, sharedFile)} should exist`).toBe(true);
    }
  });

  it('keeps scrollable sheet content shrinkable so fixed footers remain visible', () => {
    const bottomSheetCss = readFileSync(join(SRC, 'shared', 'styles', 'bottom-sheet.css'), 'utf8');

    expect(bottomSheetCss).toMatch(/\.sheet-content-body\s*\{[^}]*min-height:\s*0\s*;/s);
  });

  it('keeps sheet placeholders visually subordinate without weakening the iOS focus-zoom guard', () => {
    const baseCss = readFileSync(join(SRC, 'shared', 'styles', 'base.css'), 'utf8');
    const bottomSheetCss = readFileSync(join(SRC, 'shared', 'styles', 'bottom-sheet.css'), 'utf8');

    expect(baseCss).toMatch(/html\.is-standalone\s+:is\(input, textarea, select\)[^{]*\{[^}]*font-size:\s*max\(16px, 1em\)\s*!important\s*;/s);
    expect(bottomSheetCss).toMatch(/\.bottom-sheet\s+:is\(input, textarea\)::placeholder\s*\{[^}]*font:\s*500 10\.5px\/1\.45/s);
  });

  it('keeps the timeline entry sheet chrome on the shared base', () => {
    const bottomSheetCss = readFileSync(join(SRC, 'shared', 'styles', 'bottom-sheet.css'), 'utf8');
    const timelineCss = readFileSync(join(SRC, 'features', 'timeline', 'timeline.css'), 'utf8');
    const modalsCss = readFileSync(join(SRC, 'shared', 'styles', 'modals.css'), 'utf8');

    expect(bottomSheetCss).toContain('--sheet-accent: #6f8b4a;');
    expect(bottomSheetCss).toContain('.sheet-action-primary');
    expect(bottomSheetCss).toContain('@media (max-width: 520px)');
    expect(modalsCss).toContain('justify-content: center;');
    expect(timelineCss).toContain('.journal-entry-sheet.tone-apricot');
    expect(timelineCss).not.toMatch(/\.journal-(activity|feeding-editor)-dialog/);
    expect(timelineCss).not.toMatch(/\.haven-dialog-(header|body|footer)/);
    expect(timelineCss).not.toContain('.haven-dialog-backdrop');
  });

  it('keeps primary route top spacing owned by the shared page shell', () => {
    const primaryRouteStyles = [
      ['features/home/home.css', '.haven-home'],
      ['features/timeline/timeline.css', '.journal-page'],
      ['features/growth/growth-view.css', '.haven-growth'],
      ['features/expenses/expenses.css', '.haven-expenses'],
    ];

    for (const [file, rootSelector] of primaryRouteStyles) {
      const css = readFileSync(join(SRC, file), 'utf8');
      expect(css, `${file} must not style the shared page wrapper`).not.toContain('.view-content-wrapper');
      expect(css, `${file} must not style the shared route surface`).not.toContain('.app-route-surface');
      expect(css, `${rootSelector} must not offset the shared top spacing`).not.toMatch(
        new RegExp(`\\${rootSelector}\\s*\\{[^}]*margin-top\\s*:`, 's'),
      );
    }
  });

  it('reports ownership overlap without changing runtime behavior', () => {
    const report = buildReport();
    console.info('[css-architecture-audit]', JSON.stringify({
      files: report.summary,
      overlapPairs: report.overlaps.slice(0, 20),
      overlapSample: report.overlappingSelectors.slice(0, 30),
    }, null, 2));

    expect(report.summary.length).toBeGreaterThan(0);
  });
});
