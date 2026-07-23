// Generated from dist/src/persistence.js by tools/sync-skill.mjs. Do not edit.
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const writeQueues = new Map();
async function writeAnswers(outputPath, submission) {
    await mkdir(dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporaryPath, `${JSON.stringify(submission, null, 2)}\n`, "utf8");
        await rename(temporaryPath, outputPath);
    }
    catch (error) {
        try {
            await rm(temporaryPath, { force: true });
        }
        catch (cleanupError) {
            throw new AggregateError([error, cleanupError], `Failed to persist answers and clean up ${temporaryPath}`);
        }
        throw error;
    }
}
export async function persistAnswers(outputPath, submission) {
    const normalizedPath = resolve(outputPath);
    const previous = writeQueues.get(normalizedPath) ?? Promise.resolve();
    const write = () => writeAnswers(normalizedPath, submission);
    const operation = previous.then(write, write);
    writeQueues.set(normalizedPath, operation);
    try {
        await operation;
    }
    finally {
        if (writeQueues.get(normalizedPath) === operation) {
            writeQueues.delete(normalizedPath);
        }
    }
}
