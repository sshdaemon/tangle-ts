import ts from 'typescript';
import { isFunctionLike } from './functions.ts';
import type { FunctionLike } from './functions.ts';
import type { Diagnostic } from './oxlint.ts';

export const SELECTOR_PARAMETER = 'tangle/selector-parameter';
export const OPTIONS_CALLBACK = 'tangle/callback-in-options';
export const CLOSURE_RESULT = 'tangle/result-out-of-closure';

/** API-shape smells in one file, found from its syntax alone. */
export function shapeDiagnostics(file: string, text: string): Diagnostic[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out: Diagnostic[] = [];
  const lines = (node: ts.Node) => ({ start: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, end: sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1 });
  const report = (rule: string, node: ts.Node, message: string, also: readonly ts.Node[] = []) => {
    const pos = node.getStart(sf);
    const at = sf.getLineAndCharacterOfPosition(pos);
    const d: Diagnostic = { file, rule, line: at.line + 1, column: at.character + 1, pos, endLine: lines(node).end, message };
    out.push(also.length > 0 ? { ...d, alsoLines: also.map(lines) } : d);
  };
  const checkApi = (fn: FunctionLike) => {
    // A body rewritten to branch on an existing parameter counts as a change too.
    for (const s of selectorParameters(fn)) report(SELECTOR_PARAMETER, s.node, `"${s.name}" only decides which branch runs; give each behaviour its own method.`, s.reads);
    for (const o of optionCallbacks(fn, sf)) {
      const names = o.callbacks.map((c) => `"${textOf(c.name!)}"`).join(', ');
      // A named type's callbacks sit apart from the method, so adding one there counts too.
      report(OPTIONS_CALLBACK, o.param.type!, `Optional callback ${names} sits in an options bag with other options; take it as its own parameter or let the caller wrap the call.`, o.named ? o.callbacks : []);
    }
  };
  const visit = (node: ts.Node) => {
    if (isFunctionLike(node) && node.body !== undefined) {
      if (isApi(node)) checkApi(node);
      for (const c of closureResults(node)) report(CLOSURE_RESULT, c.target, `"${c.name}" carries a result out of the callback passed to \`${c.callee}\`; return it from the callback instead.`, c.also);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** A public class method, or an exported top-level function; components and hooks are left out. */
function isApi(fn: FunctionLike): boolean {
  const name = apiName(fn);
  return name !== undefined && /^[a-z_$]/.test(name) && !/^use[A-Z0-9]/.test(name);
}

function apiName(fn: FunctionLike): string | undefined {
  if (ts.isMethodDeclaration(fn)) {
    if (!ts.isClassLike(fn.parent) || ts.isPrivateIdentifier(fn.name) || !ts.isIdentifier(fn.name)) return undefined;
    const hidden = ts.getCombinedModifierFlags(fn) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected);
    return hidden ? undefined : fn.name.text;
  }
  if (ts.isFunctionDeclaration(fn)) return fn.name && ts.isSourceFile(fn.parent) && isExported(fn) ? fn.name.text : undefined;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined;
  const decl = fn.parent;
  if (!ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) return undefined;
  const statement = decl.parent.parent;
  return ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent) && isExported(statement) ? decl.name.text : undefined;
}

function isExported(node: ts.FunctionDeclaration | ts.VariableStatement): boolean {
  return node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

// ---- selector parameter

interface Candidate {
  readonly name: string;
  readonly node: ts.Node;
}

/** A selector parameter, with the reads that branch on it. */
interface Selector extends Candidate {
  readonly reads: readonly ts.Identifier[];
}

function selectorParameters(fn: FunctionLike): Selector[] {
  const body = fn.body!;
  return booleanParameters(fn).flatMap((c) => {
    const reads = referencesTo(body, c.name);
    return reads.length > 0 && reads.every(isConditionUse) ? [{ ...c, reads }] : [];
  });
}

/** `flag: boolean`, `flag = false`, and destructured `{ flag = false }` or `{ flag }: { flag?: boolean }`. */
function booleanParameters(fn: FunctionLike): Candidate[] {
  return fn.parameters.flatMap((p): Candidate[] => {
    if (ts.isIdentifier(p.name)) return isBooleanType(p.type) || (!p.type && isBooleanLiteral(p.initializer)) ? [{ name: p.name.text, node: p }] : [];
    if (!ts.isObjectBindingPattern(p.name)) return [];
    const declared = p.type && ts.isTypeLiteralNode(p.type) ? memberTypes(p.type.members) : new Map<string, ts.TypeNode | undefined>();
    return p.name.elements.flatMap((el): Candidate[] => {
      if (el.dotDotDotToken || !ts.isIdentifier(el.name)) return [];
      const key = el.propertyName ? textOf(el.propertyName) : el.name.text;
      return isBooleanLiteral(el.initializer) || isBooleanType(declared.get(key)) ? [{ name: el.name.text, node: el }] : [];
    });
  });
}

function memberTypes(members: ts.NodeArray<ts.TypeElement>): Map<string, ts.TypeNode | undefined> {
  const out = new Map<string, ts.TypeNode | undefined>();
  for (const m of members) if (ts.isPropertySignature(m)) out.set(textOf(m.name), m.type);
  return out;
}

function isBooleanType(t: ts.TypeNode | undefined): boolean {
  if (!t) return false;
  if (t.kind === ts.SyntaxKind.BooleanKeyword) return true;
  if (!ts.isUnionTypeNode(t)) return false;
  return t.types.some((u) => u.kind === ts.SyntaxKind.BooleanKeyword) && t.types.every((u) => u.kind === ts.SyntaxKind.BooleanKeyword || isNullish(u));
}

function isNullish(u: ts.TypeNode): boolean {
  return u.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(u) && u.literal.kind === ts.SyntaxKind.NullKeyword);
}

function isBooleanLiteral(e: ts.Expression | undefined): boolean {
  return e?.kind === ts.SyntaxKind.TrueKeyword || e?.kind === ts.SyntaxKind.FalseKeyword;
}

/** Identifiers that read `name` in `body`, skipping nested functions whose parameters shadow it. */
function referencesTo(body: ts.Node, name: string): ts.Identifier[] {
  const out: ts.Identifier[] = [];
  const visit = (node: ts.Node) => {
    if (isFunctionLike(node) && node.parameters.some((p) => bindsName(p.name, name))) return;
    if (ts.isIdentifier(node) && node.text === name && isReference(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return out;
}

function bindsName(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some((el) => !ts.isOmittedExpression(el) && bindsName(el.name, name));
}

/** False for property names, keys and declarations that merely share the text. */
function isReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p)) return p.expression === id;
  if (ts.isQualifiedName(p)) return p.left === id;
  if (NAMED_KINDS.has(p.kind)) return (p as ts.NamedDeclaration).name !== id;
  return !NEVER_REFERENCE_KINDS.has(p.kind);
}

/** Declarations and keys whose own name is not a read. */
const NAMED_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.Parameter,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
]);

const NEVER_REFERENCE_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.BindingElement,
  ts.SyntaxKind.JsxAttribute,
  ts.SyntaxKind.LabeledStatement,
  ts.SyntaxKind.BreakStatement,
  ts.SyntaxKind.ContinueStatement,
]);

/** The flag decides control flow: an if, ternary or loop condition, or `flag && run()` as a statement. */
function isConditionUse(id: ts.Identifier): boolean {
  let n: ts.Node = id;
  for (;;) {
    const p: ts.Node = n.parent;
    if (ts.isParenthesizedExpression(p) || (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) || isLogical(p)) n = p;
    else break;
  }
  const p = n.parent;
  if (ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p)) return p.expression === n;
  if (ts.isConditionalExpression(p)) return p.condition === n;
  if (ts.isForStatement(p)) return p.condition === n;
  return ts.isExpressionStatement(p) && isLogical(n);
}

function isLogical(n: ts.Node): n is ts.BinaryExpression {
  if (!ts.isBinaryExpression(n)) return false;
  const k = n.operatorToken.kind;
  return k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken;
}

// ---- callback in an options bag

interface OptionCallbacks {
  readonly param: ts.ParameterDeclaration;
  readonly callbacks: readonly ts.TypeElement[];
  /** The options type is an interface or alias, not inline. */
  readonly named: boolean;
}

function optionCallbacks(fn: FunctionLike, sf: ts.SourceFile): OptionCallbacks[] {
  return fn.parameters.flatMap((param) => {
    const members = objectMembers(param.type, sf);
    if (members.length < 2) return [];
    const callbacks = members.filter(isOptionalCallback);
    return callbacks.length > 0 ? [{ param, callbacks, named: !ts.isTypeLiteralNode(param.type!) }] : [];
  });
}

/** Members of an inline object type, or of an interface or object type alias declared in the same file. */
function objectMembers(t: ts.TypeNode | undefined, sf: ts.SourceFile): readonly ts.TypeElement[] {
  if (!t) return [];
  if (ts.isTypeLiteralNode(t)) return t.members;
  if (!ts.isTypeReferenceNode(t) || !ts.isIdentifier(t.typeName)) return [];
  const name = t.typeName.text;
  for (const s of sf.statements) {
    if (ts.isInterfaceDeclaration(s) && s.name.text === name) return s.members;
    if (ts.isTypeAliasDeclaration(s) && s.name.text === name && ts.isTypeLiteralNode(s.type)) return s.type.members;
  }
  return [];
}

function isOptionalCallback(m: ts.TypeElement): boolean {
  if (!m.questionToken || !m.name) return false;
  if (ts.isMethodSignature(m)) return true;
  return ts.isPropertySignature(m) && isFunctionType(m.type);
}

function isFunctionType(t: ts.TypeNode | undefined): boolean {
  if (!t) return false;
  if (ts.isFunctionTypeNode(t)) return true;
  if (ts.isParenthesizedTypeNode(t)) return isFunctionType(t.type);
  return ts.isUnionTypeNode(t) && t.types.some(isFunctionType);
}

// ---- result smuggled out of a closure

interface ClosureResult {
  readonly name: string;
  readonly callee: string;
  readonly target: ts.Identifier;
  /** The `let` and the awaited call's callee: a change to either makes the shape too. */
  readonly also: readonly ts.Node[];
}

/**
 * A `let` of `fn` given a value with `=` inside a callback passed straight to a call `fn` awaits, where
 * the callback never reads it. Compound assignments and `++` are accumulators, and a callback that also
 * reads the variable keeps state between calls, like a progress handler; both are left alone.
 */
function closureResults(fn: FunctionLike): ClosureResult[] {
  const lets = new Map<string, ts.VariableDeclaration>();
  const awaited: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (node !== fn && isFunctionLike(node)) return;
    if (ts.isVariableDeclarationList(node) && node.flags & ts.NodeFlags.Let && !isLoopHead(node)) {
      for (const d of node.declarations) if (ts.isIdentifier(d.name)) lets.set(d.name.text, d);
    }
    if (ts.isAwaitExpression(node)) {
      const call = skipParens(node.expression);
      if (ts.isCallExpression(call)) awaited.push(call);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body!);
  if (lets.size === 0) return [];
  return awaited.flatMap((call) => resultsOfCall(call, lets));
}

/** At most one hit per variable and call. */
function resultsOfCall(call: ts.CallExpression, lets: ReadonlyMap<string, ts.VariableDeclaration>): ClosureResult[] {
  const out = new Map<string, ClosureResult>();
  for (const closure of call.arguments.flatMap(closuresIn)) {
    for (const target of assignedIn(closure)) {
      const name = target.text;
      const decl = lets.get(name);
      if (decl && !out.has(name) && !readsOrDeclares(closure, name)) out.set(name, { name, callee: calleeName(call), target, also: [decl, call.expression] });
    }
  }
  return [...out.values()];
}

function readsOrDeclares(closure: FunctionLike, name: string): boolean {
  let declares = false;
  const visit = (node: ts.Node) => {
    if (node !== closure && isFunctionLike(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) declares = true;
    ts.forEachChild(node, visit);
  };
  visit(closure);
  return declares || closure.parameters.some((p) => bindsName(p.name, name)) || referencesTo(closure.body!, name).some((id) => !isWrite(id));
}

function isWrite(id: ts.Identifier): boolean {
  return ts.isBinaryExpression(id.parent) && id.parent.left === id && id.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
}

function isLoopHead(list: ts.VariableDeclarationList): boolean {
  const p = list.parent;
  return (ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === list;
}

function skipParens(e: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(e) ? skipParens(e.expression) : e;
}

/** A callback argument, or a callback held by a property of an object literal argument. */
function closuresIn(arg: ts.Expression): FunctionLike[] {
  const e = skipParens(arg);
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return [e];
  if (!ts.isObjectLiteralExpression(e)) return [];
  return e.properties.flatMap((p): FunctionLike[] => {
    if (ts.isMethodDeclaration(p)) return [p];
    if (!ts.isPropertyAssignment(p)) return [];
    const v = skipParens(p.initializer);
    return ts.isArrowFunction(v) || ts.isFunctionExpression(v) ? [v] : [];
  });
}

/** Names given a value with plain `=` in the closure's own body, not in functions nested in it. */
function assignedIn(closure: FunctionLike): ts.Identifier[] {
  const out: ts.Identifier[] = [];
  const visit = (node: ts.Node) => {
    if (node !== closure && isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) out.push(node.left);
    ts.forEachChild(node, visit);
  };
  if (closure.body) visit(closure.body);
  return out;
}

function calleeName(call: ts.CallExpression): string {
  const c = call.expression;
  if (ts.isPropertyAccessExpression(c)) return c.name.text;
  if (ts.isIdentifier(c)) return c.text;
  return 'call';
}

function textOf(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return '<computed>';
}
