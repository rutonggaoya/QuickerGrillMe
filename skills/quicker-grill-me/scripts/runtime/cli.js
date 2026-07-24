#!/usr/bin/env node
// Generated from dist/src/cli.js by tools/sync-skill.mjs. Do not edit.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { persistDesignReview, renderDesignReview } from "./review.js";
import { startQuestionnaireServer } from "./server.js";
import { ValidationError } from "./errors.js";
import { validateAnswerSubmission, validateQuestionnaire } from "./validate.js";
function usage() {
    return `QuickerGrillMe

Usage:
  quickergrillme validate <questionnaire.json>
  quickergrillme serve <questionnaire.json> [options]
  quickergrillme render-review <questionnaire.json> <answers.json> <final-design.md> [options]

Options:
  --output <path>   Answer or review HTML path
  --round <1|2>     Questionnaire round (default: 1)
  --port <number>   Local port (default: automatically selected)
  --no-open         Print the URL without opening a browser
  --keep-open       Keep serving after a successful submission
  --help            Show this help
`;
}
function optionValue(argumentsList, option) {
    const index = argumentsList.indexOf(option);
    if (index === -1) {
        return undefined;
    }
    const value = argumentsList[index + 1];
    if (value === undefined || value.startsWith("--")) {
        throw new Error(`${option} requires a value`);
    }
    return value;
}
function requiredPath(value, label) {
    if (value === undefined) {
        throw new Error(`${label} path is required`);
    }
    return value;
}
function parseArguments(argumentsList) {
    if (argumentsList.length === 0 || argumentsList.includes("--help")) {
        return {
            command: "help",
            questionnairePath: "",
            outputPath: "",
            round: 1,
            openBrowser: false,
            exitOnSubmit: true
        };
    }
    const commandValue = argumentsList[0];
    if (commandValue !== "serve" &&
        commandValue !== "validate" &&
        commandValue !== "render-review") {
        throw new Error(`Unknown command "${commandValue}"`);
    }
    const questionnaireArgument = argumentsList[1];
    if (questionnaireArgument === undefined || questionnaireArgument.startsWith("--")) {
        throw new Error(`${commandValue} requires a questionnaire JSON path`);
    }
    const answersArgument = argumentsList[2];
    const designArgument = argumentsList[3];
    if (commandValue === "render-review" &&
        (answersArgument === undefined ||
            answersArgument.startsWith("--") ||
            designArgument === undefined ||
            designArgument.startsWith("--"))) {
        throw new Error("render-review requires questionnaire JSON, answers JSON, and final design Markdown paths");
    }
    const portValue = optionValue(argumentsList, "--port");
    const port = portValue === undefined ? undefined : Number(portValue);
    if (port !== undefined &&
        (!Number.isInteger(port) || port < 0 || port > 65535)) {
        throw new Error("--port must be an integer from 0 through 65535");
    }
    const roundValue = optionValue(argumentsList, "--round");
    const round = roundValue === undefined ? 1 : Number(roundValue);
    if (round !== 1 && round !== 2) {
        throw new Error("--round must be 1 or 2");
    }
    return {
        command: commandValue,
        questionnairePath: resolve(questionnaireArgument),
        ...(commandValue === "render-review"
            ? {
                answersPath: resolve(requiredPath(answersArgument, "Answers")),
                designPath: resolve(requiredPath(designArgument, "Final design"))
            }
            : {}),
        outputPath: resolve(optionValue(argumentsList, "--output") ??
            (commandValue === "render-review" ? "design-review.html" : "answers.json")),
        round,
        ...(port === undefined ? {} : { port }),
        openBrowser: !argumentsList.includes("--no-open"),
        exitOnSubmit: !argumentsList.includes("--keep-open")
    };
}
async function loadQuestionnaire(path) {
    const text = await readFile(path, "utf8");
    let value;
    try {
        value = JSON.parse(text);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : "unknown parse error";
        throw new ValidationError([`${path} is not valid JSON: ${detail}`]);
    }
    return validateQuestionnaire(value);
}
async function loadJson(path) {
    const text = await readFile(path, "utf8");
    try {
        return JSON.parse(text);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : "unknown parse error";
        throw new ValidationError([`${path} is not valid JSON: ${detail}`]);
    }
}
function openBrowser(url) {
    const command = process.platform === "win32"
        ? { executable: "cmd", arguments: ["/c", "start", "", url] }
        : process.platform === "darwin"
            ? { executable: "open", arguments: [url] }
            : { executable: "xdg-open", arguments: [url] };
    const child = spawn(command.executable, command.arguments, {
        detached: true,
        stdio: "ignore"
    });
    child.on("error", (error) => {
        process.stderr.write(`Could not open the browser automatically: ${error.message}\n`);
    });
    child.unref();
}
async function main() {
    const argumentsParsed = parseArguments(process.argv.slice(2));
    if (argumentsParsed.command === "help") {
        process.stdout.write(usage());
        return;
    }
    const questionnaire = await loadQuestionnaire(argumentsParsed.questionnairePath);
    if (argumentsParsed.command === "validate") {
        process.stdout.write(`Valid questionnaire: ${questionnaire.metadata.title} (${questionnaire.questions.length} questions)\n`);
        return;
    }
    if (argumentsParsed.command === "render-review") {
        const submission = validateAnswerSubmission(await loadJson(requiredPath(argumentsParsed.answersPath, "Answers")), questionnaire);
        const designMarkdown = await readFile(requiredPath(argumentsParsed.designPath, "Final design"), "utf8");
        await persistDesignReview(argumentsParsed.outputPath, renderDesignReview(questionnaire, submission, designMarkdown));
        process.stdout.write(`Design review saved to ${argumentsParsed.outputPath}\n`);
        process.stdout.write(`Final HTML: ${pathToFileURL(argumentsParsed.outputPath).href}\n`);
        process.stdout.write(`Plan Markdown: ${pathToFileURL(requiredPath(argumentsParsed.designPath, "Final design")).href}\n`);
        return;
    }
    const running = await startQuestionnaireServer({
        questionnaire,
        outputPath: argumentsParsed.outputPath,
        round: argumentsParsed.round,
        ...(argumentsParsed.port === undefined ? {} : { port: argumentsParsed.port }),
        exitOnSubmit: argumentsParsed.exitOnSubmit,
        onSubmitted: (outputPath) => {
            process.stdout.write(`Submission complete. Answers saved to ${outputPath}\n`);
        },
        onPageClosed: () => {
            process.stdout.write("Questionnaire closed before submission. No answers were saved.\n");
        }
    });
    process.stdout.write(`QuickerGrillMe is ready at ${running.url}\n`);
    process.stdout.write(`Answers will be saved to ${argumentsParsed.outputPath}\n`);
    if (argumentsParsed.exitOnSubmit) {
        process.stdout.write("The server will stop after a successful submission or when the questionnaire is closed.\n");
    }
    else {
        process.stdout.write("The server will keep serving after submission and stop when the questionnaire is closed or Ctrl+C is pressed.\n");
    }
    if (argumentsParsed.openBrowser) {
        openBrowser(running.url);
    }
    const stop = () => {
        void running.close().catch((error) => {
            const detail = error instanceof Error ? error.message : "unknown close error";
            process.stderr.write(`Failed to close server cleanly: ${detail}\n`);
        });
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
}
main().catch((error) => {
    if (error instanceof ValidationError) {
        process.stderr.write(`${error.message}\n`);
    }
    else {
        const detail = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${detail}\n`);
    }
    process.exitCode = 1;
});
