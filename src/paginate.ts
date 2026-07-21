import type { Page, Question } from "./types.js";

export interface PageBudget {
  minimum: number;
  maximum: number;
}

export const DEFAULT_PAGE_BUDGET: Readonly<PageBudget> = {
  minimum: 4,
  maximum: 6
};

function pageWeight(questions: Question[]): number {
  return questions.reduce((total, question) => total + question.complexity, 0);
}

export function groupQuestionsIntoPages(
  questions: Question[],
  budget: PageBudget = DEFAULT_PAGE_BUDGET
): Page[] {
  if (budget.minimum < 1 || budget.maximum < budget.minimum) {
    throw new Error("Page budget must have a positive minimum no greater than its maximum");
  }

  const groups: Question[][] = [];
  let current: Question[] = [];
  let currentWeight = 0;

  for (const question of questions) {
    if (question.complexity > budget.maximum) {
      throw new Error(
        `Question "${question.id}" complexity ${question.complexity} exceeds page maximum ${budget.maximum}`
      );
    }

    if (current.length > 0 && currentWeight + question.complexity > budget.maximum) {
      groups.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(question);
    currentWeight += question.complexity;
  }

  if (current.length > 0) {
    groups.push(current);
  }

  const last = groups.at(-1);
  const previous = groups.at(-2);
  if (
    last !== undefined &&
    previous !== undefined &&
    pageWeight(last) < budget.minimum
  ) {
    while (pageWeight(last) < budget.minimum && previous.length > 1) {
      const candidate = previous.at(-1);
      if (
        candidate === undefined ||
        pageWeight(previous) - candidate.complexity < budget.minimum ||
        pageWeight(last) + candidate.complexity > budget.maximum
      ) {
        break;
      }
      previous.pop();
      last.unshift(candidate);
    }
  }

  return groups.map((group) => ({
    weight: pageWeight(group),
    questions: group
  }));
}
