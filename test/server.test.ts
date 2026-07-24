import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, test } from "node:test";
import { readFile as readSourceFile } from "node:fs/promises";
import { selectQuestions } from "../src/select.js";
import { startQuestionnaireServer, type RunningQuestionnaireServer } from "../src/server.js";
import type { AnswerRecord } from "../src/types.js";
import { validateQuestionnaire } from "../src/validate.js";

const runningServers: RunningQuestionnaireServer[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    runningServers.splice(0).map(async (server) => {
      try {
        await server.close();
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("not running")) {
          throw error;
        }
      }
    })
  );
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("local browser API", () => {
  test("previews pages and persists a valid submission", async () => {
    const questionnaire = validateQuestionnaire(
      JSON.parse(
        await readSourceFile(resolve("examples", "questionnaire.json"), "utf8")
      )
    );
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "quickergrillme-"));
    temporaryDirectories.push(temporaryDirectory);
    const outputPath = join(temporaryDirectory, "answers.json");
    const running = await startQuestionnaireServer({
      questionnaire,
      outputPath,
      round: 2,
      port: 0,
      exitOnSubmit: false
    });
    runningServers.push(running);

    const pageResponse = await fetch(running.url);
    assert.equal(pageResponse.status, 200);
    assert.match(await pageResponse.text(), /QuickerGrillMe/);
    const [scriptResponse, styleResponse] = await Promise.all([
      fetch(`${running.url}/app.js`),
      fetch(`${running.url}/app.css`)
    ]);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type") ?? "", /text\/javascript/);
    assert.equal(styleResponse.status, 200);
    assert.match(styleResponse.headers.get("content-type") ?? "", /text\/css/);
    const transportQuestionnaire = await (
      await fetch(`${running.url}/api/questionnaire`)
    ).json();
    const submissionToken: string = transportQuestionnaire.submissionToken;
    assert.equal(transportQuestionnaire.round, 2);

    const values = Object.fromEntries(
      questionnaire.questions.map((question) => [
        question.id,
        question.recommendedOptionId ?? question.recommendedOptionIds ?? []
      ])
    );
    const previewResponse = await fetch(`${running.url}/api/preview`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quickergrillme-token": submissionToken
      },
      body: JSON.stringify({ level: "standard", answers: values })
    });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.questionCount, 13);
    assert.ok(preview.pages.every((page: { weight: number }) => page.weight <= 6));

    const selected = selectQuestions(questionnaire, "standard", values);
    const answers: Record<string, AnswerRecord> = Object.fromEntries(
      selected.map((question) => [
        question.id,
        {
          questionId: question.id,
          status: "answered",
          value: question.recommendedOptionId ?? question.recommendedOptionIds ?? [],
          source: "recommended",
          confidence: question.confidence
        }
      ])
    );
    const sensitiveQuestion = questionnaire.questions.find(
      (question) => question.id === "sensitive-data"
    );
    assert.ok(sensitiveQuestion);
    answers["sensitive-data"] = {
      questionId: "sensitive-data",
      status: "deferred",
      value: "internal-design",
      source: "deferred",
      confidence: sensitiveQuestion.defer.confidence,
      temporaryDefault: "internal-design",
      validationTrigger: sensitiveQuestion.defer.validationTrigger
    };

    const submitResponse = await fetch(`${running.url}/api/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quickergrillme-token": submissionToken
      },
      body: JSON.stringify({
        schemaVersion: "1.0",
        questionnaireId: questionnaire.metadata.id,
        questionnaireVersion: questionnaire.metadata.version,
        level: "standard",
        round: 2,
        submittedAt: new Date().toISOString(),
        answers,
        changedFromRecommendations: ["sensitive-data"]
      })
    });
    assert.equal(submitResponse.status, 201);
    const result = await submitResponse.json();
    assert.equal(result.status, "complete");

    const persisted = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(persisted.round, 2);
    assert.equal(persisted.answers["sensitive-data"].status, "deferred");
    assert.deepEqual(persisted.changedFromRecommendations, ["sensitive-data"]);
  });

  test("rejects incomplete submissions with actionable issues", async () => {
    const questionnaire = validateQuestionnaire(
      JSON.parse(
        await readSourceFile(resolve("examples", "questionnaire.json"), "utf8")
      )
    );
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "quickergrillme-"));
    temporaryDirectories.push(temporaryDirectory);
    const running = await startQuestionnaireServer({
      questionnaire,
      outputPath: join(temporaryDirectory, "answers.json"),
      port: 0,
      exitOnSubmit: false
    });
    runningServers.push(running);
    const transportQuestionnaire = await (
      await fetch(`${running.url}/api/questionnaire`)
    ).json();
    const submissionToken: string = transportQuestionnaire.submissionToken;

    const response = await fetch(`${running.url}/api/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quickergrillme-token": submissionToken
      },
      body: JSON.stringify({
        schemaVersion: "1.0",
        questionnaireId: questionnaire.metadata.id,
        questionnaireVersion: questionnaire.metadata.version,
        level: "essential",
        round: 1,
        submittedAt: new Date().toISOString(),
        answers: {},
        changedFromRecommendations: []
      })
    });
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.equal(result.error, "validation_error");
    assert.ok(result.issues.some((issue: string) => issue.includes("design-goal")));
  });

  test("rejects forged or non-JSON mutation requests", async () => {
    const questionnaire = validateQuestionnaire(
      JSON.parse(
        await readSourceFile(resolve("examples", "questionnaire.json"), "utf8")
      )
    );
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "quickergrillme-"));
    temporaryDirectories.push(temporaryDirectory);
    const running = await startQuestionnaireServer({
      questionnaire,
      outputPath: join(temporaryDirectory, "answers.json"),
      port: 0,
      exitOnSubmit: false
    });
    runningServers.push(running);
    const transportQuestionnaire = await (
      await fetch(`${running.url}/api/questionnaire`)
    ).json();
    const submissionToken: string = transportQuestionnaire.submissionToken;

    const missingToken = await fetch(`${running.url}/api/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "essential", answers: {} })
    });
    assert.equal(missingToken.status, 403);

    const hostileOrigin = await fetch(`${running.url}/api/preview`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quickergrillme-token": submissionToken,
        origin: "https://example.invalid"
      },
      body: JSON.stringify({ level: "essential", answers: {} })
    });
    assert.equal(hostileOrigin.status, 403);

    const simpleContentType = await fetch(`${running.url}/api/preview`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-quickergrillme-token": submissionToken
      },
      body: JSON.stringify({ level: "essential", answers: {} })
    });
    assert.equal(simpleContentType.status, 415);
  });
});
