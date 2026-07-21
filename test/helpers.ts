import type { Question, Questionnaire } from "../src/types.js";

export function makeQuestion(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    prompt: `Question ${id}?`,
    topic: "Topic",
    minLevel: "essential",
    complexity: 1,
    dependsOn: [],
    stage: "goals",
    impact: "medium",
    questionType: "single-choice",
    options: [
      { id: "yes", label: "Yes", description: "Choose yes" },
      { id: "no", label: "No", description: "Choose no" }
    ],
    recommendedOptionId: "yes",
    recommendationRationale: "This is the safe default.",
    confidence: "high",
    defer: {
      allowed: true,
      temporaryDefaultOptionId: "yes",
      confidence: "medium",
      validationTrigger: "Validate before release."
    },
    allowCustom: true,
    affectedDecisions: ["test"],
    ...overrides
  };
}

export function makeQuestionnaire(questions: Question[]): Questionnaire {
  return {
    schemaVersion: "1.0",
    metadata: {
      id: "test-questionnaire",
      title: "Test questionnaire",
      description: "Questionnaire used by automated tests.",
      version: "1.0.0",
      recommendedLevel: "standard"
    },
    questions
  };
}
