import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { persistDesignReview, renderDesignReview } from "../src/review.js";
import type { AnswerSubmission } from "../src/types.js";
import { makeQuestion, makeQuestionnaire } from "./helpers.js";

test("renders and persists a self-contained review with the full decision record", async () => {
  const question = makeQuestion("delivery", {
    prompt: "How should <delivery> work?",
    affectedDecisions: ["Deployment model"]
  });
  const questionnaire = makeQuestionnaire([question]);
  questionnaire.metadata.title = "Design <review>";
  const submission: AnswerSubmission = {
    schemaVersion: "1.0",
    questionnaireId: questionnaire.metadata.id,
    questionnaireVersion: questionnaire.metadata.version,
    level: "standard",
    round: 1,
    submittedAt: "2026-07-24T00:00:00Z",
    answers: {
      delivery: {
        questionId: "delivery",
        status: "deferred",
        value: "no",
        source: "deferred",
        confidence: "medium",
        temporaryDefault: "no",
        validationTrigger: "Before launch"
      }
    },
    changedFromRecommendations: ["delivery"]
  };
  const html = renderDesignReview(
    questionnaire,
    submission,
    "# Final design\n\nUse **controlled rollout**.\n\n<script>alert('no')</script>",
    { generatedAt: "2026-07-24T01:00:00Z" }
  );

  assert.match(html, /<h1>Final design<\/h1>/);
  assert.match(html, /<strong>controlled rollout<\/strong>/);
  assert.match(html, /Questionnaire decision record/);
  assert.match(html, /How should &lt;delivery&gt; work\?/);
  assert.match(html, /Validate when:<\/strong> Before launch/);
  assert.match(html, /organization or invited reviewers only/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(&#39;no&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /src=|href=/);

  const directory = await mkdtemp(join(tmpdir(), "quickergrillme-review-"));
  const outputPath = join(directory, "design-review.html");
  try {
    await persistDesignReview(outputPath, html);
    assert.equal(await readFile(outputPath, "utf8"), html);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
