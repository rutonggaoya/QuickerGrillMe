import {
  DEPTH_LEVELS,
  type AnswerRecord,
  type AnswerValue,
  type DepthLevel,
  type Questionnaire
} from "./types.js";

export interface DraftStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface QuestionnaireDraft {
  schemaVersion: "2.0";
  questionnaireId: string;
  questionnaireVersion: string;
  level: DepthLevel;
  savedAt: string;
  answers: Record<string, AnswerRecord>;
  collapsedTopics: string[];
  scrollY: number;
}

export interface DraftLoadResult {
  draft?: QuestionnaireDraft;
  warning?: string;
}

export interface QuestionnaireDraftViewState {
  collapsedTopics?: readonly string[];
  scrollY?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAnswerValue(value: unknown): value is AnswerValue {
  return (
    (typeof value === "string" && value.trim() !== "") ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === "string" && item.trim() !== ""))
  );
}

function isDepthLevel(value: unknown): value is DepthLevel {
  return (
    typeof value === "string" &&
    DEPTH_LEVELS.some((depthLevel) => depthLevel === value)
  );
}

function parseAnswerRecord(value: unknown, questionId: string): AnswerRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const status = value["status"];
  const source = value["source"];
  const temporaryDefault = value["temporaryDefault"];
  const validationTrigger = value["validationTrigger"];
  if (
    value["questionId"] === questionId &&
    (status === "answered" || status === "deferred") &&
    (source === "recommended" ||
      source === "changed" ||
      source === "custom" ||
      source === "deferred") &&
    isAnswerValue(value["value"]) &&
    (temporaryDefault === undefined || isAnswerValue(temporaryDefault)) &&
    (validationTrigger === undefined ||
      (typeof validationTrigger === "string" && validationTrigger.trim() !== ""))
  ) {
    return {
      questionId,
      status,
      source,
      value: value["value"],
      ...(temporaryDefault === undefined ? {} : { temporaryDefault }),
      ...(validationTrigger === undefined ? {} : { validationTrigger })
    };
  }
  return undefined;
}

export function questionnaireDraftKey(questionnaire: Questionnaire): string {
  return `quickergrillme:draft:${encodeURIComponent(
    questionnaire.metadata.id
  )}:${encodeURIComponent(questionnaire.metadata.version)}`;
}

export function loadQuestionnaireDraft(
  storage: DraftStorage,
  questionnaire: Questionnaire
): DraftLoadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(questionnaireDraftKey(questionnaire));
  } catch {
    return { warning: "Saved draft storage is unavailable in this browser." };
  }
  if (serialized === null) {
    return {};
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { warning: "A saved draft was unreadable and has been ignored." };
  }
  if (!isRecord(value)) {
    return { warning: "A saved draft had an invalid shape and has been ignored." };
  }
  const level = value["level"];
  const answersValue = value["answers"];
  const collapsedTopicsValue = value["collapsedTopics"];
  const scrollYValue = value["scrollY"];
  if (
    value["schemaVersion"] !== "2.0" ||
    value["questionnaireId"] !== questionnaire.metadata.id ||
    value["questionnaireVersion"] !== questionnaire.metadata.version ||
    !isDepthLevel(level) ||
    typeof value["savedAt"] !== "string" ||
    Number.isNaN(Date.parse(value["savedAt"])) ||
    !isRecord(answersValue) ||
    (collapsedTopicsValue !== undefined &&
      (!Array.isArray(collapsedTopicsValue) ||
        collapsedTopicsValue.some(
          (item) => typeof item !== "string" || item.trim() === ""
        ))) ||
    (scrollYValue !== undefined &&
      (typeof scrollYValue !== "number" ||
        !Number.isFinite(scrollYValue) ||
        scrollYValue < 0))
  ) {
    return { warning: "A saved draft was incompatible and has been ignored." };
  }

  const questionsById = new Set(questionnaire.questions.map((question) => question.id));
  const answers: Record<string, AnswerRecord> = {};
  for (const [questionId, answer] of Object.entries(answersValue)) {
    const parsedAnswer = parseAnswerRecord(answer, questionId);
    if (!questionsById.has(questionId) || parsedAnswer === undefined) {
      return { warning: "A saved draft contained invalid answers and has been ignored." };
    }
    answers[questionId] = parsedAnswer;
  }

  return {
    draft: {
      schemaVersion: "2.0",
      questionnaireId: questionnaire.metadata.id,
      questionnaireVersion: questionnaire.metadata.version,
      level,
      savedAt: value["savedAt"],
      answers,
      collapsedTopics:
        collapsedTopicsValue === undefined ? [] : collapsedTopicsValue,
      scrollY: scrollYValue === undefined ? 0 : scrollYValue
    }
  };
}

export function saveQuestionnaireDraft(
  storage: DraftStorage,
  questionnaire: Questionnaire,
  level: DepthLevel,
  answers: Record<string, AnswerRecord>,
  viewState: QuestionnaireDraftViewState = {}
): QuestionnaireDraft {
  const draft: QuestionnaireDraft = {
    schemaVersion: "2.0",
    questionnaireId: questionnaire.metadata.id,
    questionnaireVersion: questionnaire.metadata.version,
    level,
    savedAt: new Date().toISOString(),
    answers,
    collapsedTopics: [...(viewState.collapsedTopics ?? [])],
    scrollY: viewState.scrollY ?? 0
  };
  storage.setItem(questionnaireDraftKey(questionnaire), JSON.stringify(draft));
  return draft;
}

export function removeQuestionnaireDraft(
  storage: DraftStorage,
  questionnaire: Questionnaire
): void {
  storage.removeItem(questionnaireDraftKey(questionnaire));
}
