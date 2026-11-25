## Purpose

Shape findings flag an API shape that makes a method hard to call or change, such as a boolean that only picks a branch, wherever it lands on a changed line, so a reviewer looks at it.

## ADDED Requirements

### Requirement: Shape hits on changed lines

Each hit of a shape rule on a changed line SHALL be reported as a `low` finding with category `design`, a `tg-` id built like a bug finding's, and the enclosing function. Hits outside the changed lines SHALL NOT be reported.

#### Scenario: Flag in a changed method

- **WHEN** one of two methods with a selector parameter is on a changed line
- **THEN** the report has one low `tangle/selector-parameter` finding in category `design` for that method, with a `tg-` id

### Requirement: Selector parameter

`tangle/selector-parameter` SHALL flag a parameter of a public class method or exported top-level function that is typed `boolean`, has a `true` or `false` default, or is destructured with such a default or a `boolean` type, when every read of it in the body is a branch condition. A boolean that is stored, returned, compared or passed on SHALL NOT be flagged.

#### Scenario: Destructured flag with a default

- **WHEN** a method takes `{ compressed = false }` and reads it only as `compressed ? gzip() : plain()`
- **THEN** `compressed` is flagged

#### Scenario: Flag passed on

- **WHEN** `setActive(active: boolean)` stores `active` and passes it to another call
- **THEN** nothing is flagged

### Requirement: Callback in an options bag

`tangle/callback-in-options` SHALL flag a parameter of a public class method or exported top-level function whose object type has an optional function-typed property or optional method next to at least one other member. A required callback, alone or next to options, and a callback that is its own parameter SHALL NOT be flagged.

#### Scenario: Optional callback among options

- **WHEN** a method takes `{ onProgress?: (done: number) => void; compressed?: boolean }`
- **THEN** that parameter is flagged

#### Scenario: Execute-around

- **WHEN** methods take `{ prefix, mode, run }` with a required `run`, or `(name, kind, fn)`
- **THEN** nothing is flagged

### Requirement: Callback in a named options type

When the options type is an interface or type alias in the same file, a change to one of its optional callback members SHALL count as a change to the hit, which stays at the method's parameter.

#### Scenario: Callback added to a named options type

- **WHEN** a change adds only `onDone?: () => void` to a same-file interface that an unchanged method takes
- **THEN** that method's parameter is flagged, with the same id as when the method line changes

### Requirement: Lines that make the shape

A change on a line that makes a selector parameter or a carried-out result SHALL count as a change to the hit, which stays where it is: for a selector parameter, a line that branches on it; for a carried-out result, the `let` and the awaited call.

#### Scenario: Body starts branching on a flag

- **WHEN** a change rewrites only a method's body line to `return active ? id : null`, where `active: boolean` is an unchanged parameter
- **THEN** `active` is flagged at the parameter

#### Scenario: Await added before a call

- **WHEN** a change only adds `await` in front of a call whose callback assigns an outer `let`
- **THEN** the assignment is flagged

### Requirement: Result carried out of a closure

`tangle/result-out-of-closure` SHALL flag a `let` declared in a function and given a value with `=` inside a callback passed, directly or as an object literal property, to a call the same function awaits, when that callback does not read it. Compound assignments, counters, callbacks to calls that are not awaited, and callbacks nested inside another callback SHALL NOT be flagged.

#### Scenario: Flag set inside a retry callback

- **WHEN** a function has `let uploaded = false; await withRetry(url, { onUploaded: async () => { uploaded = await confirm() } })`
- **THEN** `uploaded` is flagged where the callback assigns it

#### Scenario: Accumulator and event handler

- **WHEN** a function sums into a `let` with `+=` in an awaited callback and sets a `let` inside an event handler
- **THEN** nothing is flagged
