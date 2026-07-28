import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startQuestionnaireServer } from "../src/server.js";
import { validateQuestionnaire } from "../src/validate.js";

const questionnaire = validateQuestionnaire(
  JSON.parse(await readFile(resolve("examples", "questionnaire.json"), "utf8"))
);
const server = await startQuestionnaireServer({
  questionnaire,
  outputPath: join(tmpdir(), "quickergrillme-e2e-answers.json"),
  round: 2,
  port: 4173,
  exitOnSubmit: false,
  exitOnPageClose: false
});

console.log(`QuickerGrillMe E2E server listening at ${server.url}`);

const close = (): void => {
  void server.close();
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
