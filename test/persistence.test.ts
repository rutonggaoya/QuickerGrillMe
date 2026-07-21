import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { persistAnswers } from "../src/persistence.js";
import type { AnswerSubmission } from "../src/types.js";

function submission(questionnaireVersion: string): AnswerSubmission {
  return {
    schemaVersion: "1.0",
    questionnaireId: "concurrency-test",
    questionnaireVersion,
    level: "essential",
    round: 1,
    submittedAt: "2026-07-21T09:00:00Z",
    answers: {},
    changedFromRecommendations: []
  };
}

test("serializes concurrent writes and leaves no shared temporary file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quickergrillme-persistence-"));
  const outputPath = join(directory, "answers.json");
  try {
    const first = persistAnswers(outputPath, submission("1"));
    const second = persistAnswers(outputPath, submission("2"));
    await Promise.all([first, second]);

    const persisted = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(persisted.questionnaireVersion, "2");
    assert.deepEqual(await readdir(directory), ["answers.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
