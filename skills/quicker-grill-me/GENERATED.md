# Generated distribution files

`scripts/runtime/`, `public/`, `references/`, `assets/questionnaire.example.json`, and `generated-manifest.json` are produced from the repository's TypeScript source and canonical assets by `tools/sync-skill.mjs`.

Contributors should edit the source files, then run:

```text
npm run build:skill
```

`npm test` verifies byte-for-byte generated content and fails when the committed skill runtime is stale.
