import {
  DEPTH_LEVELS,
  type AnswerValue,
  type DepthLevel,
  type Question,
  type Questionnaire,
  type VisibilityCondition
} from "./types.js";
import { orderQuestions } from "./order.js";

export const LEVEL_CAPS: Readonly<Record<DepthLevel, number>> = {
  essential: 7,
  standard: 15,
  deep: 25
};

const levelRanks = new Map(DEPTH_LEVELS.map((level, index) => [level, index]));

function conditionMatches(
  condition: VisibilityCondition,
  answers: Readonly<Record<string, AnswerValue | undefined>>
): boolean {
  const answer = answers[condition.questionId];
  if (answer === undefined) {
    return false;
  }

  const values = Array.isArray(answer) ? answer : [answer];
  if (condition.operator === "equals") {
    return values.length === 1 && values[0] === condition.value;
  }
  if (condition.operator === "not-equals") {
    return !values.includes(condition.value);
  }
  return values.includes(condition.value);
}

export function isQuestionVisible(
  question: Question,
  answers: Readonly<Record<string, AnswerValue | undefined>>
): boolean {
  if (question.visibleWhen === undefined) {
    return true;
  }

  const allMatch = (question.visibleWhen.all ?? []).every((condition) =>
    conditionMatches(condition, answers)
  );
  const anyConditions = question.visibleWhen.any ?? [];
  const anyMatch =
    anyConditions.length === 0 ||
    anyConditions.some((condition) => conditionMatches(condition, answers));
  return allMatch && anyMatch;
}

export function selectQuestions(
  questionnaire: Questionnaire,
  level: DepthLevel,
  answers: Readonly<Record<string, AnswerValue | undefined>> = {}
): Question[] {
  const maximumRank = levelRanks.get(level);
  if (maximumRank === undefined) {
    throw new Error(`Unknown depth level: ${level}`);
  }

  let eligible = orderQuestions(questionnaire.questions)
    .filter((question) => (levelRanks.get(question.minLevel) ?? 0) <= maximumRank)
    .filter((question) => isQuestionVisible(question, answers));

  let changed = true;
  while (changed) {
    const eligibleIds = new Set(eligible.map((question) => question.id));
    const next = eligible.filter((question) => {
      const visibilityDependencies = [
        ...(question.visibleWhen?.all ?? []),
        ...(question.visibleWhen?.any ?? [])
      ].map((condition) => condition.questionId);
      return [...question.dependsOn, ...visibilityDependencies].every((dependencyId) =>
        eligibleIds.has(dependencyId)
      );
    });
    changed = next.length !== eligible.length;
    eligible = next;
  }

  const cap = LEVEL_CAPS[level];
  if (eligible.length > cap) {
    throw new Error(
      `Questionnaire exposes ${eligible.length} questions at ${level} depth, exceeding the hard cap of ${cap}. Remove lower-value questions, raise their minLevel, or tighten visibility rules.`
    );
  }
  return eligible;
}
