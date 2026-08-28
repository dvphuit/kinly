import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src');
const BOTTOM_SHEET_CSS = join(ROOT, 'shared', 'styles', 'bottom-sheet.css');
const BASE_CSS = join(ROOT, 'shared', 'styles', 'base.css');
const HAVEN_DROPDOWN = join(ROOT, 'shared', 'ui', 'HavenDropdown.tsx');
const HAVEN_DATE_PICKER = join(ROOT, 'shared', 'ui', 'HavenDatePicker.tsx');
const FIELD_TEXT_SELECTOR = ".bottom-sheet .sheet-content-body :is(input, textarea, select, [data-field-control='input-text'])";
const TEXTAREA_LABEL_SELECTOR = '.bottom-sheet .sheet-content-body label:has(> textarea) > span';
const INLINE_TYPOGRAPHY_PROPERTIES = new Set(['fontFamily', 'fontSize', 'fontWeight']);

function listTsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTsxFiles(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function classNameText(attribute) {
  const initializer = attribute.initializer;
  if (!initializer) return '';
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return '';

  const expression = initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isTemplateExpression(expression)) return expression.getText();
  return '';
}

function attributeText(attribute) {
  const initializer = attribute?.initializer;
  if (!initializer) return '';
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return '';
  if (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  return initializer.expression.getText();
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function jsxAttribute(node, source, name) {
  return node.attributes.properties.find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === name,
  );
}

function hasInputTextMarker(file, triggerClassName) {
  const sourceText = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;

  function visit(node) {
    if (found) return;
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'button') {
      const marker = jsxAttribute(node, source, 'data-field-control');
      if (node.getText(source).includes(triggerClassName) && attributeText(marker) === 'input-text') {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return found;
}

function cssRuleBody(css, selector) {
  const selectorStart = css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS selector: ${selector}`);
  const openBrace = css.indexOf('{', selectorStart + selector.length);
  const closeBrace = css.indexOf('}', openBrace + 1);
  if (openBrace < 0 || closeBrace < 0) throw new Error(`Malformed CSS rule: ${selector}`);
  return css.slice(openBrace + 1, closeBrace);
}

function findInlineTypographyViolations(file) {
  const sourceText = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];

  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(source);
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        const classNameAttribute = jsxAttribute(node, source, 'className');
        const usesSharedInput = classNameAttribute
          && classNameText(classNameAttribute).includes('log-input-control');

        if (usesSharedInput) {
          const styleAttribute = jsxAttribute(node, source, 'style');
          const expression = styleAttribute?.initializer;
          const styleObject = expression && ts.isJsxExpression(expression)
            ? expression.expression
            : undefined;

          if (styleObject && ts.isObjectLiteralExpression(styleObject)) {
            const inlineTypography = styleObject.properties
              .filter(ts.isPropertyAssignment)
              .map((property) => propertyNameText(property.name))
              .filter((property) => INLINE_TYPOGRAPHY_PROPERTIES.has(property));

            if (inlineTypography.length > 0) {
              const position = source.getLineAndCharacterOfPosition(node.getStart(source));
              violations.push(
                `${relative(ROOT, file)}:${position.line + 1} (${inlineTypography.join(', ')})`,
              );
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return violations;
}

describe('bottom-sheet input text typography', () => {
  it('owns native and custom field value typography at the bottom-sheet boundary', () => {
    const css = readFileSync(BOTTOM_SHEET_CSS, 'utf8');
    const fieldRule = cssRuleBody(css, FIELD_TEXT_SELECTOR);

    expect(fieldRule).toContain('font: 600 16px/1.25 var(--font-family-body);');
  });

  it('keeps textarea labels readable instead of inheriting feature-level 9px captions', () => {
    const css = readFileSync(BOTTOM_SHEET_CSS, 'utf8');
    const labelRule = cssRuleBody(css, TEXTAREA_LABEL_SELECTOR);

    expect(labelRule).toContain('font: 700 11px/1.35 var(--font-family-body);');
  });

  it('opts shared dropdown and date-picker triggers into the same field text contract', () => {
    expect(hasInputTextMarker(HAVEN_DROPDOWN, 'haven-dropdown-trigger')).toBe(true);
    expect(hasInputTextMarker(HAVEN_DATE_PICKER, 'haven-date-picker-trigger')).toBe(true);
  });

  it('keeps the standalone iOS anti-zoom floor aligned with the sheet field size', () => {
    const css = readFileSync(BASE_CSS, 'utf8');
    const antiZoomRule = cssRuleBody(css, 'html.is-standalone :is(input, textarea, select)');

    expect(antiZoomRule).toContain('font-size: max(16px, 1em) !important;');
  });

  it('keeps shared native field typography out of inline style overrides', () => {
    const violations = listTsxFiles(ROOT).flatMap(findInlineTypographyViolations);

    expect(violations).toEqual([]);
  });
});
