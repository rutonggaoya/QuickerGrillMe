import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { orderQuestions } from "../src/order.js";
import { groupQuestionsIntoPages } from "../src/paginate.js";
import { LEVEL_CAPS, selectQuestions } from "../src/select.js";
import { makeQuestion, makeQuestionnaire } from "./helpers.js";

describe("question ordering", () => {
  test("places prerequisites before dependents and respects stage order among ready nodes", () => {
    const questions = [
      makeQuestion("implementation", {
        stage: "implementation",
        dependsOn: ["architecture"]
      }),
      makeQuestion("risk", { stage: "risk" }),
      makeQuestion("architecture", { stage: "architecture", dependsOn: ["goal"] }),
      makeQuestion("goal", { stage: "goals" }),
      makeQuestion("behavior", { stage: "behavior", dependsOn: ["architecture"] })
    ];

    assert.deepEqual(
      orderQuestions(questions).map((question) => question.id),
      ["goal", "architecture", "behavior", "risk", "implementation"]
    );
  });

  test("rejects dependency cycles", () => {
    const questions = [
      makeQuestion("first", { dependsOn: ["second"] }),
      makeQuestion("second", { dependsOn: ["first"] })
    ];
    assert.throws(() => orderQuestions(questions), /cycle detected/);
  });
});

describe("depth and visibility selection", () => {
  test("enforces each depth cap", () => {
    const questions = Array.from({ length: 30 }, (_, index) =>
      makeQuestion(`q-${index}`, {
        minLevel: index < 8 ? "essential" : index < 18 ? "standard" : "deep"
      })
    );
    const questionnaire = makeQuestionnaire(questions);

    assert.equal(selectQuestions(questionnaire, "essential").length, LEVEL_CAPS.essential);
    assert.equal(selectQuestions(questionnaire, "standard").length, LEVEL_CAPS.standard);
    assert.equal(selectQuestions(questionnaire, "deep").length, LEVEL_CAPS.deep);
  });

  test("recomputes conditional visibility from upstream answers", () => {
    const questionnaire = makeQuestionnaire([
      makeQuestion("delivery"),
      makeQuestion("collaboration", {
        dependsOn: ["delivery"],
        visibleWhen: {
          all: [{ questionId: "delivery", operator: "equals", value: "yes" }]
        }
      })
    ]);

    assert.deepEqual(
      selectQuestions(questionnaire, "essential", { delivery: "no" }).map(
        (question) => question.id
      ),
      ["delivery"]
    );
    assert.deepEqual(
      selectQuestions(questionnaire, "essential", { delivery: "yes" }).map(
        (question) => question.id
      ),
      ["delivery", "collaboration"]
    );
  });

  test("removes dependents when a prerequisite is unavailable at the selected depth", () => {
    const questionnaire = makeQuestionnaire([
      makeQuestion("deep-prerequisite", { minLevel: "deep" }),
      makeQuestion("essential-dependent", {
        minLevel: "essential",
        dependsOn: ["deep-prerequisite"]
      })
    ]);

    assert.deepEqual(selectQuestions(questionnaire, "essential"), []);
    assert.deepEqual(
      selectQuestions(questionnaire, "deep").map((question) => question.id),
      ["deep-prerequisite", "essential-dependent"]
    );
  });
});

describe("page complexity grouping", () => {
  test("uses complexity budget rather than a fixed question count", () => {
    const questions = [
      makeQuestion("one", { complexity: 1 }),
      makeQuestion("two", { complexity: 1 }),
      makeQuestion("three", { complexity: 1 }),
      makeQuestion("four", { complexity: 1 }),
      makeQuestion("complex", { complexity: 5 }),
      makeQuestion("last", { complexity: 1 })
    ];

    const pages = groupQuestionsIntoPages(questions);
    assert.deepEqual(
      pages.map((page) => ({
        count: page.questions.length,
        weight: page.weight
      })),
      [
        { count: 4, weight: 4 },
        { count: 2, weight: 6 }
      ]
    );
    assert.ok(pages.every((page) => page.weight <= 6));
  });

  test("rejects a question heavier than the adapter budget", () => {
    const question = makeQuestion("heavy", { complexity: 5 });
    assert.throws(
      () => groupQuestionsIntoPages([question], { minimum: 2, maximum: 4 }),
      /exceeds page maximum/
    );
  });
});
