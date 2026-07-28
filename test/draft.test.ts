import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  loadQuestionnaireDraft,
  questionnaireDraftKey,
  removeQuestionnaireDraft,
  saveQuestionnaireDraft,
  type DraftStorage
} from "../src/draft.js";
import type { AnswerRecord } from "../src/types.js";
import { makeQuestion, makeQuestionnaire } from "./helpers.js";

class MemoryStorage implements DraftStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("questionnaire drafts", () => {
  test("round-trips answers and level for the matching questionnaire version", () => {
    const storage = new MemoryStorage();
    const questionnaire = makeQuestionnaire([makeQuestion("delivery")]);
    const answers: Record<string, AnswerRecord> = {
      delivery: {
        questionId: "delivery",
        status: "answered",
        value: "no",
        source: "changed"
      }
    };

    const saved = saveQuestionnaireDraft(
      storage,
      questionnaire,
      "deep",
      answers,
      {
        collapsedTopics: ["Delivery"],
        scrollY: 420
      }
    );
    const key = questionnaireDraftKey(questionnaire);
    const legacyDraft = JSON.parse(storage.getItem(key) ?? "") as {
      answers: Record<string, Record<string, unknown>>;
    };
    const legacyAnswer = legacyDraft.answers["delivery"];
    assert.ok(legacyAnswer);
    legacyAnswer["answerConfidence"] = "low";
    storage.setItem(key, JSON.stringify(legacyDraft));
    const loaded = loadQuestionnaireDraft(storage, questionnaire);

    assert.equal(loaded.warning, undefined);
    assert.equal(loaded.draft?.level, "deep");
    assert.deepEqual(loaded.draft?.answers, answers);
    assert.deepEqual(loaded.draft?.collapsedTopics, ["Delivery"]);
    assert.equal(loaded.draft?.scrollY, 420);
    assert.equal(loaded.draft?.savedAt, saved.savedAt);
  });

  test("ignores corrupt drafts and removes completed drafts", () => {
    const storage = new MemoryStorage();
    const questionnaire = makeQuestionnaire([makeQuestion("delivery")]);
    const key = questionnaireDraftKey(questionnaire);
    storage.setItem(key, "{not-json");

    assert.match(
      loadQuestionnaireDraft(storage, questionnaire).warning ?? "",
      /unreadable/
    );

    removeQuestionnaireDraft(storage, questionnaire);
    assert.equal(storage.getItem(key), null);
  });
});
