import type { AnswerSubmission, DepthLevel, Questionnaire } from "./types.js";

export interface AdapterContext {
  recommendedLevel: DepthLevel;
  outputPath: string;
}

export interface QuestionnaireAdapter {
  readonly id: string;
  collect(
    questionnaire: Questionnaire,
    context: AdapterContext
  ): Promise<AnswerSubmission>;
}
