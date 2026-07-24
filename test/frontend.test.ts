import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { test } from "node:test";

test("prebuilt React questionnaire stays within its startup asset budget", async () => {
  const [index, javascript, css] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/app.js"),
    readFile("public/app.css")
  ]);

  assert.match(index, /rel="modulepreload" href="\/app\.js"/);
  assert.match(index, /rel="stylesheet" href="\/app\.css"/);
  assert.ok(javascript.byteLength <= 560_000, `app.js is ${javascript.byteLength} bytes`);
  assert.ok(
    gzipSync(javascript).byteLength <= 160_000,
    `gzipped app.js is ${gzipSync(javascript).byteLength} bytes`
  );
  assert.ok(css.byteLength <= 10_000, `app.css is ${css.byteLength} bytes`);
});
