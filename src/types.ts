export const DEPTH_LEVELS = ["essential", "standard", "deep"] as const;
export type DepthLevel = (typeof DEPTH_LEVELS)[number];

export const DECISION_STAGES = [
  "goals",
  "architecture",
  "behavior",
  "risk",
  "implementation"
] as const;
export type DecisionStage = (typeof DECISION_STAGES)[number];

export const IMPACT_LEVELS = ["low", "medium", "high"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const QUESTION_TYPES = ["single-choice", "multiple-choice"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type AnswerValue = string | string[];

export interface QuestionnaireMetadata {
  id: string;
  title: string;
  description: string;
  version: string;
  recommendedLevel: DepthLevel;
  generatedAt?: string;
}

export interface QuestionOption {
  id: string;
  label: string;
  description: string;
}

export type VisibilityOperator = "equals" | "not-equals" | "includes";

export interface VisibilityCondition {
  questionId: string;
  operator: VisibilityOperator;
  value: string;
}

export interface VisibilityRules {
  all?: VisibilityCondition[];
  any?: VisibilityCondition[];
}

export interface DeferConfiguration {
  allowed: boolean;
  temporaryDefaultOptionId?: string;
  temporaryDefaultOptionIds?: string[];
  confidence: ConfidenceLevel;
  validationTrigger: string;
}

export interface Question {
  id: string;
  prompt: string;
  topic: string;
  minLevel: DepthLevel;
  complexity: number;
  dependsOn: string[];
  visibleWhen?: VisibilityRules;
  stage: DecisionStage;
  impact: ImpactLevel;
  questionType: QuestionType;
  options: QuestionOption[];
  recommendedOptionId?: string;
  recommendedOptionIds?: string[];
  recommendationRationale: string;
  confidence: ConfidenceLevel;
  defer: DeferConfiguration;
  allowCustom: boolean;
  affectedDecisions: string[];
}

export interface Questionnaire {
  schemaVersion: "1.0";
  metadata: QuestionnaireMetadata;
  questions: Question[];
}

export type AnswerSource = "recommended" | "changed" | "custom" | "deferred";

export interface AnswerRecord {
  questionId: string;
  status: "answered" | "deferred";
  value: AnswerValue;
  source: AnswerSource;
  confidence: ConfidenceLevel;
  temporaryDefault?: AnswerValue;
  validationTrigger?: string;
}

export interface AnswerSubmission {
  schemaVersion: "1.0";
  questionnaireId: string;
  questionnaireVersion: string;
  level: DepthLevel;
  round: 1 | 2;
  submittedAt: string;
  answers: Record<string, AnswerRecord>;
  changedFromRecommendations: string[];
}

export interface Page {
  weight: number;
  questions: Question[];
}
