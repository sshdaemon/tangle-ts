/** A finding in the shape a review consumer reads; the first six fields match weakspot-ts. */
export interface Finding {
  readonly id: string;
  readonly severity: 'low' | 'medium';
  readonly category: 'complexity' | 'correctness';
  readonly where: string;
  readonly claim: string;
  readonly evidence: string;
  readonly rule: string;
  /** Qualified function name, or `<module>`. */
  readonly function: string;
  /** Scored size rules: the function's highest score before and after. `before` is null for new code, absent when not compared. */
  readonly score?: { readonly before?: number | null; readonly after: number };
  /** Unscored size rules: places over the limit before and after. `before` is null for new code, absent when not compared. */
  readonly count?: { readonly before?: number | null; readonly after: number };
}

export interface Report {
  readonly tool: 'tangle-ts';
  readonly version: string;
  readonly createdAt: string;
  readonly repo: string;
  readonly command: string;
  /** The ref compared against, and the commit the before versions were read at; null for `files`. */
  readonly base: { readonly ref: string; readonly commit: string } | null;
  readonly checked: readonly string[];
  readonly dropped: readonly { path: string; reason: string }[];
  readonly warnings: readonly string[];
  readonly durationMs: number;
  readonly findings: readonly Finding[];
}
