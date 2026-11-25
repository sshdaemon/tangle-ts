## MODIFIED Requirements

### Requirement: Finding fields

Each finding SHALL carry an id, severity (`low` or `medium`), category (`complexity`, `correctness` or `design`), `where` (`path:line:column` of the first hit), a plain-language claim, evidence, rule and function, plus score or count for size findings.

#### Scenario: Size finding evidence

- **WHEN** a function crosses the cognitive complexity limit of 15
- **THEN** its evidence names the limit as "15 allowed"

#### Scenario: Shape finding category

- **WHEN** a changed public method takes a boolean it only branches on
- **THEN** its finding has category `design` and severity `low`
