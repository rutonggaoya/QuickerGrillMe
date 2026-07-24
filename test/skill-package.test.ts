import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { test } from "node:test";

type RuntimeChild = ChildProcessByStdio<null, Readable, Readable>;

function waitForUrl(child: RuntimeChild): Promise<string> {
  return new Promise((resolveUrl, rejectUrl) => {
    let output = "";
    const timer = setTimeout(() => {
      rejectUrl(new Error(`Timed out waiting for runtime URL. Output:\n${output}`));
    }, 10_000);

    const finish = (callback: () => void): void => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
      callback();
    };
    const onData = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      const match = /QuickerGrillMe is ready at (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      const url = match?.[1];
      if (url !== undefined) {
        finish(() => resolveUrl(url));
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(() => {
        rejectUrl(
          new Error(
            `Runtime exited before becoming ready (code ${String(code)}, signal ${String(signal)}).\n${output}`
          )
        );
      });
    };

    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}

test("bundled skill runs without project dependencies from a path containing spaces", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "quicker grill me package "));
  const installedSkill = join(temporaryRoot, "installed skill");
  const questionnairePath = join(
    installedSkill,
    "assets",
    "questionnaire.example.json"
  );
  const outputPath = join(temporaryRoot, "round 2 answers.json");
  let child: RuntimeChild | undefined;

  try {
    await cp(resolve("skills", "quicker-grill-me"), installedSkill, { recursive: true });
    const runtimePackage = JSON.parse(
      await readFile(join(installedSkill, "package.json"), "utf8")
    );
    assert.equal(runtimePackage.type, "module");
    assert.equal(runtimePackage.dependencies, undefined);
    assert.equal(runtimePackage.devDependencies, undefined);
    const runtimePath = join(installedSkill, "scripts", "runtime", "cli.js");
    const validation = spawnSync(process.execPath, [runtimePath, "validate", questionnairePath], {
      cwd: temporaryRoot,
      encoding: "utf8"
    });
    assert.equal(validation.status, 0, validation.stderr);
    assert.match(validation.stdout, /Valid questionnaire:/);

    const runtimeChild = spawn(
      process.execPath,
      [
        runtimePath,
        "serve",
        questionnairePath,
        "--output",
        outputPath,
        "--round",
        "2",
        "--no-open"
      ],
      {
        cwd: temporaryRoot,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    child = runtimeChild;
    const exitPromise = once(runtimeChild, "exit");
    const url = await waitForUrl(runtimeChild);

    const pageResponse = await fetch(url);
    assert.equal(pageResponse.status, 200);
    assert.match(await pageResponse.text(), /QuickerGrillMe/);

    const transport = await (await fetch(`${url}/api/questionnaire`)).json();
    assert.equal(transport.round, 2);
    const submissionToken: string = transport.submissionToken;
    const values = Object.fromEntries(
      transport.questions.map(
        (question: {
          id: string;
          recommendedOptionId?: string;
          recommendedOptionIds?: string[];
        }) => [
          question.id,
          question.recommendedOptionId ?? question.recommendedOptionIds ?? []
        ]
      )
    );

    const forgedResponse = await fetch(`${url}/api/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "essential", answers: values })
    });
    assert.equal(forgedResponse.status, 403);

    const previewResponse = await fetch(`${url}/api/preview`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quickergrillme-token": submissionToken
      },
      body: JSON.stringify({ level: "standard", answers: values })
    });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    const selectedQuestions = preview.pages.flatMap(
      (page: { questions: unknown[] }) => page.questions
    ) as Array<{
      id: string;
      confidence: "low" | "medium" | "high";
      recommendedOptionId?: string;
      recommendedOptionIds?: string[];
    }>;
    const answers = Object.fromEntries(
      selectedQuestions.map((question) => [
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

    const submitResponse = await fetch(`${url}/api/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quickergrillme-token": submissionToken
      },
      body: JSON.stringify({
        schemaVersion: "1.0",
        questionnaireId: transport.metadata.id,
        questionnaireVersion: transport.metadata.version,
        level: "standard",
        round: 2,
        submittedAt: new Date().toISOString(),
        answers,
        changedFromRecommendations: []
      })
    });
    assert.equal(submitResponse.status, 201);
    const [exitCode, signal] = await exitPromise;
    assert.equal(signal, null);
    assert.equal(exitCode, 0);
    child = undefined;

    const persisted = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(persisted.round, 2);
    assert.equal(persisted.questionnaireId, transport.metadata.id);

    const designPath = join(temporaryRoot, "final design.md");
    const reviewPath = join(temporaryRoot, "design review.html");
    await writeFile(
      designPath,
      "# Final design\n\n## Goal\n\nProvide a durable, reviewable design artifact.\n",
      "utf8"
    );
    const review = spawnSync(
      process.execPath,
      [
        runtimePath,
        "render-review",
        questionnairePath,
        outputPath,
        designPath,
        "--output",
        reviewPath
      ],
      {
        cwd: temporaryRoot,
        encoding: "utf8"
      }
    );
    assert.equal(review.status, 0, review.stderr);
    assert.match(review.stdout, /Design review saved to/);
    assert.match(review.stdout, /Final HTML: file:\/\/\//);
    assert.match(review.stdout, /Plan Markdown: file:\/\/\//);
    const reviewHtml = await readFile(reviewPath, "utf8");
    assert.match(reviewHtml, /<h1>Final design<\/h1>/);
    assert.match(reviewHtml, /Questionnaire decision record/);
    assert.doesNotMatch(reviewHtml, /<script>/);
  } finally {
    if (child !== undefined && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test(
  "bundled skill exits cleanly when the questionnaire page closes",
  { timeout: 10_000 },
  async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "quicker grill me close "));
    const outputPath = join(temporaryRoot, "answers.json");
    const runtimePath = resolve(
      "skills",
      "quicker-grill-me",
      "scripts",
      "runtime",
      "cli.js"
    );
    const questionnairePath = resolve(
      "skills",
      "quicker-grill-me",
      "assets",
      "questionnaire.example.json"
    );
    const child = spawn(
      process.execPath,
      [
        runtimePath,
        "serve",
        questionnairePath,
        "--output",
        outputPath,
        "--no-open"
      ],
      {
        cwd: temporaryRoot,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    try {
      const exitPromise = once(child, "exit");
      const url = await waitForUrl(child);
      const transport = await (await fetch(`${url}/api/questionnaire`)).json();
      const closeResponse = await fetch(`${url}/api/session/close`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quickergrillme-token": transport.submissionToken
        },
        body: "{}"
      });

      assert.equal(closeResponse.status, 202);
      const [exitCode, signal] = await exitPromise;
      assert.equal(signal, null);
      assert.equal(exitCode, 0);
      await assert.rejects(access(outputPath));
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
);
