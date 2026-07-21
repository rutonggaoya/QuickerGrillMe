export class ValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ValidationError";
    this.issues = issues;
  }
}
