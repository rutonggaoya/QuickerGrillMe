import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, test } from "node:test";
import { ValidationError } from "../src/errors.js";
import { validateAnswerSubmission, validateQuestionnaire } from "../src/validate.js";
import { makeQuestion, makeQuestionnaire } from "./helpers.js";

describe("questionnaire validation", () => {
  test("accepts the realistic example", async () => {
    const value: unknown = JSON.parse(
      await readFile(resolve("examples", "questionnaire.json"), "utf8")
    );
    const questionnaire = validateQuestionnaire(value);

    assert.equal(questionnaire.questions.length, 22);
    assert.equal(questionnaire.metadata.recommendedLevel, "standard");
  });

  test("reports invalid references and recommendations clearly", () => {
    const value = {
      schemaVersion: "1.1",
      metadata: {
        id: "broken",
        title: "Broken",
        description: "Broken questionnaire",
        version: "1",
        recommendedLevel: "essential"
      },
      questions: [
        {
          id: "q1",
          prompt: "Choose",
          topic: "Test",
          minLevel: "essential",
          complexity: 2,
          dependsOn: ["missing"],
          stage: "goals",
          impact: "high",
          questionType: "single-choice",
          options: [
            { id: "a", label: "A", description: "A" },
            { id: "b", label: "B", description: "B" }
          ],
          recommendedOptionId: "missing-option",
          recommendationRationale: "Reason",
          recommendationConfidence: "high",
          defer: {
            allowed: true,
            temporaryDefaultOptionId: "also-missing",
            validationTrigger: "Later"
          },
          allowCustom: false,
          affectedDecisions: ["test"]
        }
      ]
    };

    assert.throws(
      () => validateQuestionnaire(value),
      (error: unknown) =>
        error instanceof ValidationError &&
        error.issues.some((issue) => issue.includes("references unknown question")) &&
        error.issues.some((issue) => issue.includes("recommends unknown option")) &&
        error.issues.some((issue) => issue.includes("defers to unknown option"))
    );
  });

  test("rejects unknown properties instead of silently normalizing them", () => {
    const questionnaire = makeQuestionnaire([
      makeQuestion("q1")
    ]);
    assert.throws(
      () =>
        validateQuestionnaire({
          ...questionnaire,
          questions: [
            {
              ...questionnaire.questions[0],
              visibileWhen: {
                all: [{ questionId: "q1", operator: "equals", value: "yes" }]
              }
            }
          ]
        }),
      /visibileWhen is not allowed/
    );
  });

  test("requires at least one affected decision", () => {
    const questionnaire = makeQuestionnaire([
      makeQuestion("q1", { affectedDecisions: [] })
    ]);
    assert.throws(
      () => validateQuestionnaire(questionnaire),
      /affectedDecisions must contain at least one item/
    );
  });

  test("rejects invalid visibility semantics and deeper prerequisites", () => {
    const questionnaire = makeQuestionnaire([
      makeQuestion("single"),
      makeQuestion("deep", { minLevel: "deep" }),
      makeQuestion("dependent", {
        dependsOn: ["deep"],
        visibleWhen: {
          all: [{ questionId: "single", operator: "includes", value: "missing" }]
        }
      })
    ]);

    assert.throws(
      () => validateQuestionnaire(questionnaire),
      (error: unknown) =>
        error instanceof ValidationError &&
        error.issues.some((issue) => issue.includes('unknown option "missing"')) &&
        error.issues.some((issue) => issue.includes("includes only with a multiple-choice")) &&
        error.issues.some((issue) => issue.includes("cannot depend on deeper question"))
    );
  });

  test("requires RFC 3339 timestamps in questionnaires and submissions", () => {
    const questionnaire = makeQuestionnaire([makeQuestion("q1")]);
    for (const invalidDate of [
      "1",
      "2023-02-29T00:00:00Z",
      "2023-04-31T00:00:00Z",
      "2023-01-01T24:00:00Z"
    ]) {
      assert.throws(
        () =>
          validateQuestionnaire({
            ...questionnaire,
            metadata: { ...questionnaire.metadata, generatedAt: invalidDate }
          }),
        /RFC 3339/
      );
    }

    assert.throws(
      () =>
        validateAnswerSubmission(
          {
            schemaVersion: "1.1",
            questionnaireId: questionnaire.metadata.id,
            questionnaireVersion: questionnaire.metadata.version,
            level: "essential",
            round: 1,
            submittedAt: "1",
            answers: {
              q1: {
                questionId: "q1",
                status: "answered",
                value: "yes",
                source: "recommended"
              }
            },
            changedFromRecommendations: []
          },
          questionnaire
        ),
      /RFC 3339/
    );
  });

  test("rejects the removed answer confidence property", () => {
    const questionnaire = makeQuestionnaire([
      makeQuestion("q1", { recommendationConfidence: "low" })
    ]);
    assert.throws(
      () =>
        validateAnswerSubmission(
          {
            schemaVersion: "1.1",
            questionnaireId: questionnaire.metadata.id,
            questionnaireVersion: questionnaire.metadata.version,
            level: "essential",
            round: 1,
            submittedAt: "2026-07-21T09:00:00Z",
            answers: {
              q1: {
                questionId: "q1",
                status: "answered",
                value: "no",
                source: "changed",
                answerConfidence: "high"
              }
            },
            changedFromRecommendations: ["q1"]
          },
          questionnaire
        ),
      /answerConfidence is not allowed/
    );
  });

  test("rejects hidden answers and inconsistent deferred state", () => {
    const questionnaire = makeQuestionnaire([
      makeQuestion("gate"),
      makeQuestion("dependent", {
        dependsOn: ["gate"],
        visibleWhen: {
          all: [{ questionId: "gate", operator: "equals", value: "yes" }]
        }
      })
    ]);
    const base = {
      schemaVersion: "1.1",
      questionnaireId: questionnaire.metadata.id,
      questionnaireVersion: questionnaire.metadata.version,
      level: "essential",
      round: 1,
      submittedAt: "2026-07-21T09:00:00Z",
      changedFromRecommendations: []
    };

    assert.throws(
      () =>
        validateAnswerSubmission(
          {
            ...base,
            answers: {
              gate: {
                questionId: "gate",
                status: "answered",
                value: "no",
                source: "changed"
              },
              dependent: {
                questionId: "dependent",
                status: "answered",
                value: "yes",
                source: "recommended"
              }
            }
          },
          questionnaire
        ),
      /hidden or unselected/
    );

    assert.throws(
      () =>
        validateAnswerSubmission(
          {
            ...base,
            answers: {
              gate: {
                questionId: "gate",
                status: "answered",
                value: "yes",
                source: "deferred"
              },
              dependent: {
                questionId: "dependent",
                status: "answered",
                value: "yes",
                source: "recommended"
              }
            }
          },
          questionnaire
        ),
      /pair deferred status/
    );
  });

  test("requires own answer properties and preserves configured defer metadata", () => {
    const prototypeQuestionnaire = makeQuestionnaire([makeQuestion("constructor")]);
    assert.throws(
      () =>
        validateAnswerSubmission(
          {
            schemaVersion: "1.1",
            questionnaireId: prototypeQuestionnaire.metadata.id,
            questionnaireVersion: prototypeQuestionnaire.metadata.version,
            level: "essential",
            round: 1,
            submittedAt: "2026-07-21T09:00:00Z",
            answers: {},
            changedFromRecommendations: []
          },
          prototypeQuestionnaire
        ),
      /must include visible/
    );

    const deferredQuestionnaire = makeQuestionnaire([
      makeQuestion("deferred", {
        defer: {
          allowed: true,
          temporaryDefaultOptionId: "yes",
          validationTrigger: "Use the configured trigger."
        }
      })
    ]);
    assert.throws(
      () =>
        validateAnswerSubmission(
          {
            schemaVersion: "1.1",
            questionnaireId: deferredQuestionnaire.metadata.id,
            questionnaireVersion: deferredQuestionnaire.metadata.version,
            level: "essential",
            round: 1,
            submittedAt: "2026-07-21T09:00:00Z",
            answers: {
              deferred: {
                questionId: "deferred",
                status: "deferred",
                value: "yes",
                source: "deferred",
                temporaryDefault: "yes",
                validationTrigger: "A different trigger."
              }
            },
            changedFromRecommendations: ["deferred"]
          },
          deferredQuestionnaire
        ),
      /preserve its configured validation trigger/
    );
  });
});
