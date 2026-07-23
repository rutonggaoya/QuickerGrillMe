#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { startQuestionnaireServer } from "./server.js";
import { ValidationError } from "./errors.js";
import { validateQuestionnaire } from "./validate.js";

interface ParsedArguments {
  command: "serve" | "validate" | "help";
  questionnairePath: string;
  outputPath: string;
  round: 1 | 2;
  port?: number;
  openBrowser: boolean;
  exitOnSubmit: boolean;
}

function usage(): string {
  return `QuickerGrillMe

Usage:
  quickergrillme validate <questionnaire.json>
  quickergrillme serve <questionnaire.json> [options]

Options:
  --output <path>   Answer file path (default: ./answers.json)
  --round <1|2>     Questionnaire round (default: 1)
  --port <number>   Local port (default: automatically selected)
  --no-open         Print the URL without opening a browser
  --keep-open       Keep serving after a successful submission
  --help            Show this help
`;
}

function optionValue(argumentsList: string[], option: string): string | undefined {
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

function parseArguments(argumentsList: string[]): ParsedArguments {
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
  if (commandValue !== "serve" && commandValue !== "validate") {
    throw new Error(`Unknown command "${commandValue}"`);
  }
  const questionnaireArgument = argumentsList[1];
  if (questionnaireArgument === undefined || questionnaireArgument.startsWith("--")) {
    throw new Error(`${commandValue} requires a questionnaire JSON path`);
  }

  const portValue = optionValue(argumentsList, "--port");
  const port = portValue === undefined ? undefined : Number(portValue);
  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 0 || port > 65535)
  ) {
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
    outputPath: resolve(optionValue(argumentsList, "--output") ?? "answers.json"),
    round,
    ...(port === undefined ? {} : { port }),
    openBrowser: !argumentsList.includes("--no-open"),
    exitOnSubmit: !argumentsList.includes("--keep-open")
  };
}

async function loadQuestionnaire(path: string) {
  const text = await readFile(path, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown parse error";
    throw new ValidationError([`${path} is not valid JSON: ${detail}`]);
  }
  return validateQuestionnaire(value);
}

function openBrowser(url: string): void {
  const command =
    process.platform === "win32"
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

async function main(): Promise<void> {
  const argumentsParsed = parseArguments(process.argv.slice(2));
  if (argumentsParsed.command === "help") {
    process.stdout.write(usage());
    return;
  }

  const questionnaire = await loadQuestionnaire(argumentsParsed.questionnairePath);
  if (argumentsParsed.command === "validate") {
    process.stdout.write(
      `Valid questionnaire: ${questionnaire.metadata.title} (${questionnaire.questions.length} questions)\n`
    );
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
    }
  });

  process.stdout.write(`QuickerGrillMe is ready at ${running.url}\n`);
  process.stdout.write(`Answers will be saved to ${argumentsParsed.outputPath}\n`);
  if (argumentsParsed.exitOnSubmit) {
    process.stdout.write("The server will stop after a successful submission.\n");
  } else {
    process.stdout.write("Press Ctrl+C to stop the server.\n");
  }
  if (argumentsParsed.openBrowser) {
    openBrowser(running.url);
  }

  const stop = (): void => {
    void running.close().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : "unknown close error";
      process.stderr.write(`Failed to close server cleanly: ${detail}\n`);
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error: unknown) => {
  if (error instanceof ValidationError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${detail}\n`);
  }
  process.exitCode = 1;
});
