/** Thresholds for the size rules, from the tool config. */
export interface Thresholds {
  /** Cognitive complexity above this is reported. */
  readonly cognitiveComplexity: number;
  /** Control flow nested deeper than this is reported. */
  readonly nesting: number;
  /** A boolean expression with more conditional operators than this is reported. */
  readonly expressionOperators: number;
}

/**
 * `size` rules judge how hard a function is to follow: reported per function, and only when the change
 * made that function worse. `bug` rules flag code that is almost always a mistake: reported wherever
 * they hit a changed line.
 */
export type RuleKind = 'size' | 'bug';

export interface Rule {
  /** oxlint rule id, also the name in reports. */
  readonly id: string;
  readonly kind: RuleKind;
  readonly category: 'complexity' | 'correctness';
  /** Plain words for the claim in a finding. */
  readonly what: string;
  /** Options passed to oxlint. Scored rules run with a zero limit so every score is known. */
  options?(t: Thresholds): unknown;
  /** Reads the score from the diagnostic message, for scored rules. */
  score?(message: string): number | undefined;
  /** Scores above this count; scored rules only. */
  limit?(t: Thresholds): number;
}

const firstNumber = (re: RegExp) => (message: string) => {
  const m = re.exec(message);
  return m?.[1] === undefined ? undefined : Number(m[1]);
};

export const RULES: readonly Rule[] = [
  {
    id: 'sonarjs/cognitive-complexity',
    kind: 'size',
    category: 'complexity',
    what: 'cognitive complexity',
    options: () => 0,
    score: firstNumber(/Complexity from (\d+)/),
    limit: (t) => t.cognitiveComplexity,
  },
  {
    id: 'sonarjs/expression-complexity',
    kind: 'size',
    category: 'complexity',
    what: 'conditional operators in one expression',
    options: () => ({ max: 0 }),
    score: firstNumber(/conditional operators \((\d+)\)/),
    limit: (t) => t.expressionOperators,
  },
  {
    id: 'sonarjs/nested-control-flow',
    kind: 'size',
    category: 'complexity',
    what: 'control flow nested too deep',
    options: (t) => ({ maximumNestingLevel: t.nesting }),
  },
  { id: 'sonarjs/no-nested-conditional', kind: 'size', category: 'complexity', what: 'nested ternary' },
  { id: 'sonarjs/no-identical-expressions', kind: 'bug', category: 'correctness', what: 'same expression on both sides of an operator' },
  { id: 'sonarjs/no-identical-conditions', kind: 'bug', category: 'correctness', what: 'condition repeated in an if/else-if chain, so its branch never runs' },
  { id: 'sonarjs/no-all-duplicated-branches', kind: 'bug', category: 'correctness', what: 'every branch does the same thing' },
  { id: 'sonarjs/no-duplicated-branches', kind: 'bug', category: 'correctness', what: 'two branches with identical bodies' },
  { id: 'sonarjs/no-gratuitous-expressions', kind: 'bug', category: 'correctness', what: 'condition that is always true or always false here' },
  { id: 'sonarjs/no-inverted-boolean-check', kind: 'bug', category: 'correctness', what: 'negated comparison instead of the opposite operator' },
  { id: 'sonarjs/no-identical-functions', kind: 'bug', category: 'correctness', what: 'function body identical to another one' },
  { id: 'sonarjs/no-invariant-returns', kind: 'bug', category: 'correctness', what: 'function returns the same value on every path' },
  { id: 'sonarjs/no-redundant-assignments', kind: 'bug', category: 'correctness', what: 'assignment of a value the variable already holds' },
  { id: 'sonarjs/no-unused-collection', kind: 'bug', category: 'correctness', what: 'collection filled but never read' },
];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}
