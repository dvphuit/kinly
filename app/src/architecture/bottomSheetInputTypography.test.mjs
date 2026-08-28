import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src');
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
  if (ts.isTemplateExpression(expression)) {
    return expression.getText();
  }
  return '';
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function findInlineTypographyViolations(file) {
  const sourceText = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];

  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(source);
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        const classNameAttribute = node.attributes.properties.find(
          (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === 'className',
        );
        const usesSharedInput = classNameAttribute
          && classNameText(classNameAttribute).includes('log-input-control');

        if (usesSharedInput) {
          const styleAttribute = node.attributes.properties.find(
            (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === 'style',
          );
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

describe('shared bottom-sheet input typography', () => {
  it('keeps log input font styling in the shared stylesheet instead of inline overrides', () => {
    const violations = listTsxFiles(ROOT).flatMap(findInlineTypographyViolations);

    expect(violations).toEqual([]);
  });
});
