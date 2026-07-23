// Generated from dist/src/errors.js by tools/sync-skill.mjs. Do not edit.
export class ValidationError extends Error {
    issues;
    constructor(issues) {
        super(`Validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
        this.name = "ValidationError";
        this.issues = issues;
    }
}
