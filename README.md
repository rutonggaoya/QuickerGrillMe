# QuickerGrillMe

Install the cross-agent skill from this repository:

```text
npx skills add rutonggaoya/QuickerGrillMe --skill quicker-grill-me
```

Invoke it as:

```text
/quicker-grill-me
```

If the host does not support slash invocation, say: **Use the quicker-grill-me skill to stress-test this design before implementation.**

The Agent inspects the proposal and available code for factual context, generates only questions whose answers materially change the design, and opens the bundled local questionnaire automatically. The questionnaire preselects recommendations, records explicit temporary defaults for deferred decisions, saves the answer artifact locally, and closes. End users do not clone the repository, install project dependencies, or compile TypeScript.

QuickerGrillMe is local-only and lightweight. The runtime binds to `127.0.0.1`, serves fixed bundled assets, makes no external browser requests, and writes a readable JSON answer artifact.

## What the skill produces

After at most two bounded questionnaire rounds, the Agent produces:

- a complete reconciled design;
- a decision summary and material consequences;
- material defaults and assumptions;
- deferred validation items with temporary defaults and triggers;
- a full default-ledger appendix.

The Agent stops before implementation and asks the user to confirm shared understanding.

## Update or remove

The `skills` CLI can update or remove the installed skill:

```text
npx skills update quicker-grill-me
npx skills remove quicker-grill-me
```

## Contributor development

The TypeScript/Node project is the reference implementation. Contributors need Node.js 20 or newer:

```text
npm ci
npm run build:skill
npm test
```

`npm run build:skill` compiles the source and deterministically synchronizes the committed, dependency-free distribution under [`skills/quicker-grill-me/`](skills/quicker-grill-me/). `npm test` fails when that generated runtime or its fixed assets/contracts are stale. The suite also copies the installed skill to an isolated path containing spaces, launches its bundled CLI without `node_modules`, submits through the browser API, verifies atomic persistence, and checks clean shutdown.

Additional source commands:

```text
npm run validate:example
npm start
```

The language-neutral contracts live in [`schema/`](schema/), and [`DESIGN.md`](DESIGN.md) describes the core, browser adapter, installable Agent Skill package, depth caps, stop rules, and security model.
