# QuickerGrillMe

QuickerGrillMe is an Agent Skill that stress-tests a software design before implementation. It asks only questions whose answers materially change the design, then produces a reconciled plan and a readable decision summary.

## Install

Prerequisites: Node.js 20 or newer and a local browser.

```text
npx skills add rutonggaoya/QuickerGrillMe --skill quicker-grill-me
```

The installed skill is self-contained. End users do not need to clone this repository, install project dependencies, or compile TypeScript.

## Use

Give your Agent a proposal, then invoke:

```text
/quicker-grill-me
```

If the host does not support slash commands, say:

```text
Use the quicker-grill-me skill to stress-test this design before implementation.
```

The Agent inspects the proposal and relevant code, opens a local questionnaire with recommended answers preselected, and asks you to review only the decisions that materially affect the design.

## What you get

The workflow stops before implementation and returns two local artifacts:

| Artifact | Purpose |
| --- | --- |
| `final-design.md` | The editable Agent Design Plan and source of truth for later implementation |
| `design-review.html` | A self-contained review of key decisions, consequences, defaults, and the reconciled design |

The final design covers the applicable architecture, interfaces, behavior, failure handling, security, operations, rollout, and validation strategy. Deferred decisions retain an explicit temporary default and a concrete validation trigger instead of becoming hidden unknowns.

## End-to-end example

The [`examples/global-feature-flags/`](examples/global-feature-flags/) example designs a global Feature Flag platform with in-process evaluation, multi-region distribution, bounded consistency, safe rollout, and failure recovery.

Start with this proposal:

```text
Design a global Feature Flag platform for services running in multiple regions.
Flag evaluation is on the request path, changes must propagate quickly, and
applications must keep working during control-plane or regional failures.

Use the quicker-grill-me skill to stress-test this design before implementation.
```

The completed example includes:

| Artifact | What it shows |
| --- | --- |
| [Questionnaire](examples/global-feature-flags/questionnaire.html) | The material decisions, available options, recommendations, and submitted selections |
| [Agent Design Plan](examples/global-feature-flags/final-design.md) | The resulting architecture, contracts, failure behavior, rollout, and validation plan |
| [Design Review](examples/global-feature-flags/design-review.html) | A self-contained view of the decisions and reconciled design |

Supporting JSON artifacts are included in the same folder for inspection and reproducibility.

## Design and technology

The workflow follows four rules:

- ask only when plausible answers lead to materially different designs;
- preselect a recommendation so the questionnaire is useful without busywork;
- make consequential defaults and uncertainty visible;
- cap the process at two rounds, with a second round only when risk or contradictions warrant it.

Questions and answers use language-neutral JSON contracts. The reference implementation is written in TypeScript, with a short-lived local Node.js server and a React browser UI. The installable skill ships generated, dependency-free runtime assets.

The browser runtime binds only to `127.0.0.1`, serves bundled assets, makes no external browser requests, and writes readable local artifacts. See [DESIGN.md](DESIGN.md) for the workflow, contracts, stop rules, architecture, and security model.

## Update or remove

```text
npx skills update quicker-grill-me
npx skills remove quicker-grill-me
```

## Local development and debugging

Clone the repository and install contributor dependencies:

```text
npm ci
npm start
```

`npm start` builds the project and opens the example questionnaire. Other useful commands:

```text
npm run validate:example
npm run build:skill
npm test
```

`npm run build:skill` synchronizes the committed distribution under [`skills/quicker-grill-me/`](skills/quicker-grill-me/). `npm test` also verifies that the generated distribution is current and can run without repository dependencies.

## Feedback and contributions

Open an issue for bugs, unclear behavior, or design suggestions. Pull requests are welcome; keep changes focused, run `npm test`, and include the generated skill distribution when source changes affect it.

The normative contracts live in [`schema/`](schema/), and the end-user skill instructions live in [`skills/quicker-grill-me/SKILL.md`](skills/quicker-grill-me/SKILL.md).
