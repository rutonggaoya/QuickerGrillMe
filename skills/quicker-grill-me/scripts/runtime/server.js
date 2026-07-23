// Generated from dist/src/server.js by tools/sync-skill.mjs. Do not edit.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { groupQuestionsIntoPages } from "./paginate.js";
import { persistAnswers } from "./persistence.js";
import { selectQuestions } from "./select.js";
import { DEPTH_LEVELS } from "./types.js";
import { ValidationError } from "./errors.js";
import { validateAnswerSubmission } from "./validate.js";
import { orderQuestions } from "./order.js";
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(moduleDirectory, "..", "..", "public");
const maximumRequestBytes = 1_000_000;
function isDepthLevel(value) {
    return (typeof value === "string" &&
        DEPTH_LEVELS.some((depthLevel) => depthLevel === value));
}
function sendJson(response, statusCode, value) {
    const body = JSON.stringify(value);
    response.writeHead(statusCode, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-store"
    });
    response.end(body);
}
function contentType(path) {
    const extension = extname(path);
    if (extension === ".html") {
        return "text/html; charset=utf-8";
    }
    if (extension === ".js") {
        return "text/javascript; charset=utf-8";
    }
    if (extension === ".css") {
        return "text/css; charset=utf-8";
    }
    return "application/octet-stream";
}
async function sendStatic(response, fileName) {
    const path = join(publicDirectory, fileName);
    const body = await readFile(path);
    response.writeHead(200, {
        "content-type": contentType(path),
        "content-length": body.byteLength,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
    });
    response.end(body);
}
async function readJsonBody(request) {
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.byteLength;
        if (totalBytes > maximumRequestBytes) {
            throw new ValidationError([`Request body exceeds ${maximumRequestBytes} bytes`]);
        }
        chunks.push(buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    try {
        return JSON.parse(text);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : "unknown parse error";
        throw new ValidationError([`Request body must be valid JSON: ${detail}`]);
    }
}
function parsePreviewRequest(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new ValidationError(["Preview request must be an object"]);
    }
    const record = value;
    const level = record["level"];
    if (!isDepthLevel(level)) {
        throw new ValidationError([`Preview level must be one of: ${DEPTH_LEVELS.join(", ")}`]);
    }
    const rawAnswers = record["answers"];
    if (typeof rawAnswers !== "object" || rawAnswers === null || Array.isArray(rawAnswers)) {
        throw new ValidationError(["Preview answers must be an object"]);
    }
    const answers = Object.create(null);
    for (const [questionId, answer] of Object.entries(rawAnswers)) {
        if ((typeof answer !== "string" || answer.trim() === "") &&
            (!Array.isArray(answer) ||
                answer.length === 0 ||
                !answer.every((item) => typeof item === "string" && item.trim() !== ""))) {
            throw new ValidationError([
                `Preview answer "${questionId}" must be a non-empty string or string array`
            ]);
        }
        answers[questionId] = answer;
    }
    return { level, answers };
}
export function createQuestionnaireServer(options) {
    const requestToken = randomBytes(32).toString("hex");
    let server;
    server = createServer((request, response) => {
        void handleRequest(request, response).catch((error) => {
            if (response.headersSent) {
                response.end();
                return;
            }
            if (error instanceof ValidationError) {
                sendJson(response, 400, { error: "validation_error", issues: error.issues });
                return;
            }
            const message = error instanceof Error ? error.message : "Unexpected server error";
            sendJson(response, 500, { error: "server_error", message });
        });
    });
    async function handleRequest(request, response) {
        const address = server.address();
        if (address === null || typeof address === "string") {
            sendJson(response, 503, { error: "server_not_ready" });
            return;
        }
        const expectedOrigin = `http://127.0.0.1:${address.port}`;
        const expectedHost = `127.0.0.1:${address.port}`;
        if (request.headers.host !== expectedHost) {
            sendJson(response, 403, { error: "invalid_host" });
            return;
        }
        if (request.method === "POST") {
            const origin = request.headers.origin;
            if ((origin !== undefined && origin !== expectedOrigin) ||
                request.headers["x-quickergrillme-token"] !== requestToken) {
                sendJson(response, 403, { error: "request_forbidden" });
                return;
            }
            const requestContentType = request.headers["content-type"];
            if (typeof requestContentType !== "string" ||
                requestContentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
                sendJson(response, 415, { error: "json_content_type_required" });
                return;
            }
        }
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method === "GET" && requestUrl.pathname === "/") {
            await sendStatic(response, "index.html");
            return;
        }
        if (request.method === "GET" &&
            (requestUrl.pathname === "/app.js" || requestUrl.pathname === "/styles.css")) {
            await sendStatic(response, requestUrl.pathname.slice(1));
            return;
        }
        if (request.method === "GET" && requestUrl.pathname === "/api/questionnaire") {
            sendJson(response, 200, {
                ...options.questionnaire,
                questions: orderQuestions(options.questionnaire.questions),
                round: options.round ?? 1,
                submissionToken: requestToken
            });
            return;
        }
        if (request.method === "POST" && requestUrl.pathname === "/api/preview") {
            const preview = parsePreviewRequest(await readJsonBody(request));
            const selected = selectQuestions(options.questionnaire, preview.level, preview.answers);
            sendJson(response, 200, {
                level: preview.level,
                questionCount: selected.length,
                pages: groupQuestionsIntoPages(selected)
            });
            return;
        }
        if (request.method === "POST" && requestUrl.pathname === "/api/submit") {
            const submission = validateAnswerSubmission(await readJsonBody(request), options.questionnaire);
            await persistAnswers(options.outputPath, submission);
            sendJson(response, 201, {
                status: "complete",
                outputPath: options.outputPath,
                changedAnswers: submission.changedFromRecommendations.length,
                message: "Answers saved. The agent can now generate the final design document."
            });
            options.onSubmitted?.(options.outputPath);
            if (options.exitOnSubmit !== false) {
                setTimeout(() => server.close(), 100);
            }
            return;
        }
        sendJson(response, 404, { error: "not_found" });
    }
    return server;
}
export async function startQuestionnaireServer(options) {
    const server = createQuestionnaireServer(options);
    const port = options.port ?? 0;
    await new Promise((resolveStarted, rejectStarted) => {
        const onError = (error) => rejectStarted(error);
        server.once("error", onError);
        server.listen(port, "127.0.0.1", () => {
            server.off("error", onError);
            resolveStarted();
        });
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
        await new Promise((resolveClosed) => server.close(() => resolveClosed()));
        throw new Error("Unable to determine local server address");
    }
    return {
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClosed, rejectClosed) => {
            server.close((error) => {
                if (error !== undefined) {
                    rejectClosed(error);
                }
                else {
                    resolveClosed();
                }
            });
        })
    };
}
