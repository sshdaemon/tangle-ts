# Design

## Context

tangle runs oxlint with sonarjs for its size and bug rules. sonarjs has `no-selector-parameter` (S2301), but the rule returns nothing without TypeScript type information, which oxlint's JavaScript plugins do not pass, and it ignores destructured parameters such as `{ compressed = false }`. tangle already parses every checked file with the TypeScript compiler to name functions.

## Goals / Non-Goals

**Goals:**
- Flag the three shapes on changed lines with no false hits on execute-around methods (`withTempDir({ run })`, `withSpan(name, kind, fn)`).
- Keep the rules deterministic and syntax-only, so they run on a commit's files without a project build.

**Non-Goals:**
- Judging whether the shape is right for the code. The reviewer still decides.
- Resolving types across files.

## Decisions

- The rules walk the TypeScript syntax tree in tangle and produce the same diagnostics oxlint does, so ids, accepting and the report work unchanged. They are listed apart from the oxlint rules and never written into the oxlint config.
- Selector and options-bag rules look only at a class's public methods and at exported top-level functions, named in lower camel case and not starting with `use` plus a capital. Components and hooks take props with optional handlers by design; private helpers are not an API.
- A parameter counts as boolean when its type is `boolean` (optionally with `undefined` or `null`), when it has no type and a `true` or `false` default, or when it is destructured with such a default or with `boolean` in an inline object type. It is a selector when every read of it in the body is an `if`, ternary or loop condition, possibly under `!`, `&&` or `||`, or the left of `flag && run()` as a statement.
- An options bag is an inline object type, or an interface or object type alias in the same file, with at least two members, one of them an optional function-typed property or optional method. A required callback is execute-around and is not flagged.
- A smuggled result is a `let` of the function given a value with plain `=` in a callback passed directly, or as a property of an object literal, to a call the same function awaits, where the callback never reads it. Compound assignments, `++`, callbacks nested deeper (event handlers, promise executors) and unawaited calls are left alone, so loop accumulators and progress handlers are not flagged.
- Each hit sits on one node, which its id is built from, and may name more lines that count for the changed-lines check: the reads that branch on a selector, the `let` and the awaited callee of a carried-out result, and the optional callbacks of a named options type. A change that makes the shape away from the hit's own line is still reported.
- Shape findings are `low`, category `design`, and follow the triage's size-rule switch, so spec files skip them by default.

## Risks / Trade-offs

- Syntax only: a boolean typed through an alias or an options type imported from another file is missed. Missing a hit is preferred over a false one.
- Existing code can hold many hits; only those on changed lines are reported.

## Open questions

- Whether `protected` methods should count as API. They are left out for now.
