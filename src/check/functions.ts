import { createHash } from 'node:crypto';
import ts from 'typescript';

/** A function-like node with a stable name: `Class.method`, `outer/inner`, `Comp/<callback>#2`. */
export interface FunctionSpan {
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  /** UTF-16 positions in the source text. */
  readonly start: number;
  readonly end: number;
  /** Hash of the function's text with whitespace collapsed, for keys that survive edits elsewhere. */
  readonly hash: string;
}

export const MODULE = '<module>';

/** Every function in the file, outermost first. */
export function functionsOf(fileName: string, text: string): FunctionSpan[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const out: FunctionSpan[] = [];
  const seen = new Map<string, number>();
  /** `inClass`: the prefix is a class name, so members join with `.`; nested functions join with `/`. */
  const visit = (node: ts.Node, prefix: string, inClass: boolean) => {
    let next = prefix;
    let nextInClass = false;
    // Overload signatures, `declare function` and abstract methods have no body and never carry hits.
    if (isFunctionLike(node) && node.body !== undefined) {
      const base = prefix ? `${prefix}${inClass ? '.' : '/'}${localName(node)}` : localName(node);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const name = n === 1 ? base : `${base}#${n}`;
      const start = node.getStart(sf);
      const end = node.getEnd();
      out.push({
        name,
        start,
        end,
        startLine: sf.getLineAndCharacterOfPosition(start).line + 1,
        endLine: sf.getLineAndCharacterOfPosition(end).line + 1,
        hash: hashText(text.slice(start, end)),
      });
      next = name;
    } else if (ts.isClassLike(node)) {
      const cls = node.name?.text ?? '<class>';
      next = prefix ? `${prefix}${inClass ? '.' : '/'}${cls}` : cls;
      nextInClass = true;
    } else {
      nextInClass = inClass;
    }
    ts.forEachChild(node, (child) => visit(child, next, nextInClass));
  };
  visit(sf, '', false);
  return out;
}

/** The innermost function containing a UTF-16 position, or undefined at module level. */
export function enclosing(functions: readonly FunctionSpan[], pos: number): FunctionSpan | undefined {
  let best: FunctionSpan | undefined;
  for (const f of functions) {
    if (f.start <= pos && pos < f.end && (!best || f.end - f.start < best.end - best.start)) best = f;
  }
  return best;
}

export function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

export function hashText(text: string): string {
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);
}

type FunctionLike = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ConstructorDeclaration | ts.AccessorDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  );
}

function localName(node: FunctionLike): string {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isGetAccessorDeclaration(node)) return `get ${propertyName(node.name)}`;
  if (ts.isSetAccessorDeclaration(node)) return `set ${propertyName(node.name)}`;
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) && node.name) return propertyName(node.name);
  const parent = node.parent;
  if ((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.name && !ts.isObjectBindingPattern(parent.name) && !ts.isArrayBindingPattern(parent.name)) {
    return propertyName(parent.name);
  }
  if (ts.isCallExpression(parent) && parent.arguments.includes(node as ts.Expression)) {
    const callee = parent.expression;
    const called = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : 'call';
    // `it('creates a booking', () => …)` reads better by its title than as the nth callback.
    const title = parent.arguments[0];
    if (title && title !== node && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) {
      const t = title.text.replace(/\s+/g, ' ').replace(/`/g, "'").trim();
      return `${called}(${JSON.stringify(t.length > 50 ? `${t.slice(0, 47)}...` : t)})`;
    }
    return `<${called} callback>`;
  }
  if (ts.isJsxExpression(parent)) return '<jsx handler>';
  return '<anonymous>';
}

function propertyName(name: ts.PropertyName | ts.DeclarationName): string {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return '<computed>';
}
