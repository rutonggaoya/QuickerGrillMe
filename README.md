# QuickerGrillMe

QuickerGrillMe is a local, decision-focused design questionnaire for coding Agents and developers. It asks only questions whose plausible answers materially change a design, preselects a recommendation for every question, and records uncertainty as an explicit temporary default with a validation trigger.

## Requirements

- Node.js 20 or newer

## Setup

```powershell
npm install
npm run build
```

Validate the included 21-question example:

```powershell
npm run validate:example
```

Launch the local browser workflow:

```powershell
npm start
```

The CLI binds only to `127.0.0.1`, opens the browser, writes `answers.json` after submission, and then stops. The page makes no external requests.

## CLI

```text
quickergrillme validate <questionnaire.json>
quickergrillme serve <questionnaire.json> [options]

--output <path>  Answer destination (default: ./answers.json)
--port <number>  Local port; omitted to choose an available port
--no-open        Print the URL without opening a browser
--keep-open      Continue serving after submission
```

During development, use `node dist/src/cli.js` in place of the installed command:

```powershell
node dist/src/cli.js serve examples/questionnaire.json --output .\tmp\answers.json --no-open
```

## Workflow

1. An Agent generates a questionnaire conforming to [`schema/questionnaire.schema.json`](schema/questionnaire.schema.json).
2. `quickergrillme validate` reports structural, reference, recommendation, and dependency errors.
3. `quickergrillme serve` renders the questionnaire. The user can switch depth, accept recommendations unchanged, choose another option, enter a custom answer, or defer.
4. The review shows only answers changed from recommendations.
5. Submission writes an artifact conforming to [`schema/answers.schema.json`](schema/answers.schema.json).
6. The Agent reads the answers and writes the complete design, decision summary, material defaults/assumptions, deferred validation items, and full default-ledger appendix.
7. The Agent may generate one final 3–5 question round only for contradictions, invalidated premises, or unresolved high-risk unknowns.

See [`DESIGN.md`](DESIGN.md) for the complete product and architecture specification.

## Example coverage

[`examples/questionnaire.json`](examples/questionnaire.json) demonstrates:

- Essential, Standard, and Deep depth switching;
- dependency-DAG ordering and stage progression;
- conditional questions that appear or disappear after upstream changes;
- complexity-weighted pages rather than fixed questions per page;
- recommendation rationale and confidence;
- custom answers and defer metadata;
- high-impact decisions and affected-design annotations.

## Non-browser fallback

The JSON contracts are the integration boundary. In a host that cannot open a loopback browser, an Agent can present the ordered questions in chat or another UI, ask the user only for changes from the preselected recommendations, preserve defer metadata, and write the same `answers.json` structure. The depth caps, dependencies, two-round limit, and stop rules still apply.

## Development

```powershell
npm test
```

The test suite covers runtime validation, DAG ordering, visibility and depth caps, page complexity grouping, atomic persistence, and the local HTTP preview/submission flow.
