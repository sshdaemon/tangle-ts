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
  const span = (node: ts.Node, base: string): FunctionSpan => {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const start = node.getStart(sf);
    const end = node.getEnd();
    return {
      name: n === 1 ? base : `${base}#${n}`,
      start,
      end,
      startLine: sf.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sf.getLineAndCharacterOfPosition(end).line + 1,
      hash: hashText(text.slice(start, end)),
    };
  };
  const visit = (node: ts.Node, scope: Scope) => {
    let next: Scope;
    // Overload signatures, `declare function` and abstract methods have no body and never carry hits.
    if (isFunctionLike(node) && node.body !== undefined) {
      const fn = span(node, joinName(scope, localName(node)));
      out.push(fn);
      next = { prefix: fn.name, inClass: false };
    } else if (ts.isClassLike(node)) {
      next = { prefix: joinName(scope, node.name?.text ?? '<class>'), inClass: true };
    } else {
      next = scope;
    }
    ts.forEachChild(node, (child) => visit(child, next));
  };
  visit(sf, { prefix: '', inClass: false });
  return out;
}

/** The name of the enclosing function or class; `inClass` when it is a class. */
interface Scope {
  readonly prefix: string;
  readonly inClass: boolean;
}

/** Class members join with `.`, nested functions with `/`. */
function joinName(scope: Scope, local: string): string {
  if (!scope.prefix) return local;
  return `${scope.prefix}${scope.inClass ? '.' : '/'}${local}`;
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

const FUNCTION_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
]);

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return FUNCTION_KINDS.has(node.kind);
}

function localName(node: FunctionLike): string {
  return ownName(node) ?? declaredName(node.parent) ?? callbackName(node) ?? unnamed(node);
}

function unnamed(node: FunctionLike): string {
  return ts.isJsxExpression(node.parent) ? '<jsx handler>' : '<anonymous>';
}

/** A name the function carries itself: `constructor`, `get x`, `function f`, method `m`. */
function ownName(node: FunctionLike): string | undefined {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isGetAccessorDeclaration(node)) return `get ${propertyName(node.name)}`;
  if (ts.isSetAccessorDeclaration(node)) return `set ${propertyName(node.name)}`;
  if (ts.isArrowFunction(node) || !node.name) return undefined;
  return propertyName(node.name);
}

/** The name it is assigned to: `const f = …`, a class field, an object key. */
function declaredName(parent: ts.Node): string | undefined {
  if (!ts.isVariableDeclaration(parent) && !ts.isPropertyDeclaration(parent) && !ts.isPropertyAssignment(parent)) return undefined;
  if (ts.isObjectBindingPattern(parent.name) || ts.isArrayBindingPattern(parent.name)) return undefined;
  return propertyName(parent.name);
}

/** A call argument: `it("title")` when the call's first argument is a title, else `<map callback>`. */
function callbackName(node: FunctionLike): string | undefined {
  const call = node.parent;
  if (!ts.isCallExpression(call) || !call.arguments.includes(node as ts.Expression)) return undefined;
  const callee = call.expression;
  let called = 'call';
  if (ts.isPropertyAccessExpression(callee)) called = callee.name.text;
  else if (ts.isIdentifier(callee)) called = callee.text;
  const title = call.arguments[0];
  if (!title || !(ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) return `<${called} callback>`;
  const t = title.text.replace(/\s+/g, ' ').replace(/`/g, "'").trim();
  return `${called}(${JSON.stringify(t.length > 50 ? `${t.slice(0, 47)}...` : t)})`;
}

function propertyName(name: ts.PropertyName | ts.DeclarationName): string {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return '<computed>';
}
