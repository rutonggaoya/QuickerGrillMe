import { DECISION_STAGES, type Question } from "./types.js";

const stageRanks = new Map(DECISION_STAGES.map((stage, index) => [stage, index]));

function dependencyIds(question: Question): string[] {
  const visibilityDependencies = [
    ...(question.visibleWhen?.all ?? []),
    ...(question.visibleWhen?.any ?? [])
  ].map((condition) => condition.questionId);

  return [...new Set([...question.dependsOn, ...visibilityDependencies])];
}

export function orderQuestions(questions: Question[]): Question[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const originalIndex = new Map(questions.map((question, index) => [question.id, index]));
  const topicIndex = new Map<string, number>();
  questions.forEach((question) => {
    if (!topicIndex.has(question.topic)) {
      topicIndex.set(question.topic, topicIndex.size);
    }
  });

  const indegree = new Map(questions.map((question) => [question.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const question of questions) {
    for (const dependencyId of dependencyIds(question)) {
      if (!byId.has(dependencyId)) {
        continue;
      }
      indegree.set(question.id, (indegree.get(question.id) ?? 0) + 1);
      const current = dependents.get(dependencyId) ?? [];
      current.push(question.id);
      dependents.set(dependencyId, current);
    }
  }

  const compare = (left: Question, right: Question): number => {
    const stageDifference =
      (stageRanks.get(left.stage) ?? 0) - (stageRanks.get(right.stage) ?? 0);
    if (stageDifference !== 0) {
      return stageDifference;
    }

    const topicDifference =
      (topicIndex.get(left.topic) ?? 0) - (topicIndex.get(right.topic) ?? 0);
    if (topicDifference !== 0) {
      return topicDifference;
    }

    return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
  };

  const ready = questions.filter((question) => indegree.get(question.id) === 0).sort(compare);
  const ordered: Question[] = [];

  while (ready.length > 0) {
    const question = ready.shift();
    if (question === undefined) {
      break;
    }
    ordered.push(question);

    for (const dependentId of dependents.get(question.id) ?? []) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, nextIndegree);
      if (nextIndegree === 0) {
        const dependent = byId.get(dependentId);
        if (dependent !== undefined) {
          ready.push(dependent);
          ready.sort(compare);
        }
      }
    }
  }

  if (ordered.length !== questions.length) {
    const cycleIds = questions
      .filter((question) => !ordered.some((item) => item.id === question.id))
      .map((question) => question.id);
    throw new Error(`Question dependency cycle detected: ${cycleIds.join(", ")}`);
  }

  return ordered;
}
