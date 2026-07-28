import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  webLightTheme
} from "@fluentui/react-components";
import type { OptionOnSelectData, SelectionEvents } from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  loadQuestionnaireDraft,
  removeQuestionnaireDraft,
  saveQuestionnaireDraft
} from "../src/draft.js";
import type {
  AnswerRecord,
  AnswerValue,
  DepthLevel,
  Page,
  Question,
  Questionnaire
} from "../src/types.js";
import "./styles.css";

interface TransportQuestionnaire extends Questionnaire {
  round: 1 | 2;
  submissionToken: string;
}

interface PreviewResponse {
  pages: Page[];
}

interface SubmitResponse {
  message: string;
  outputPath: string;
}

type Answers = Record<string, AnswerRecord>;
type OperationKind = "draft" | "preview" | "submit";

interface OperationError {
  kind: OperationKind;
  message: string;
}

interface DraftNotice {
  intent: "info" | "warning";
  message: string;
}

async function requestJson<T>(
  url: string,
  submissionToken?: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (submissionToken !== undefined) {
    headers.set("x-quickergrillme-token", submissionToken);
  }

  const response = await fetch(url, { ...options, headers });
  const result = (await response.json()) as {
    issues?: string[];
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    const details = Array.isArray(result.issues)
      ? result.issues.join("\n")
      : result.message ?? result.error ?? "Request failed";
    throw new Error(details);
  }
  return result as T;
}

function recommendedValue(question: Question): AnswerValue {
  if (question.questionType === "single-choice") {
    return question.recommendedOptionId ?? "";
  }
  return question.recommendedOptionIds ?? [];
}

function temporaryDefault(question: Question): AnswerValue {
  if (question.questionType === "single-choice") {
    return question.defer.temporaryDefaultOptionId ?? "";
  }
  return question.defer.temporaryDefaultOptionIds ?? [];
}

function valuesEqual(left: AnswerValue, right: AnswerValue): boolean {
  const leftValues = Array.isArray(left) ? [...left].sort() : [left];
  const rightValues = Array.isArray(right) ? [...right].sort() : [right];
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

function makeRecommendedAnswer(question: Question): AnswerRecord {
  return {
    questionId: question.id,
    status: "answered",
    value: recommendedValue(question),
    source: "recommended"
  };
}

function initializeAnswers(questionnaire: Questionnaire): Answers {
  return Object.fromEntries(
    questionnaire.questions.map((question) => [
      question.id,
      makeRecommendedAnswer(question)
    ])
  );
}

function answerValueMap(answers: Answers): Record<string, AnswerValue> {
  return Object.fromEntries(
    Object.entries(answers).map(([questionId, answer]) => [questionId, answer.value])
  );
}

function optionLabel(question: Question, value: AnswerValue): string {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => question.options.find((option) => option.id === item)?.label ?? item)
    .join(", ");
}

function optionContext(question: Question, value: AnswerValue): string {
  const values = Array.isArray(value) ? value : [value];
  const descriptions = values.flatMap((item) => {
    const description = question.options.find((option) => option.id === item)?.description;
    return description === undefined ? [] : [description];
  });
  return descriptions.length === 0 ? "Custom response" : descriptions.join(" ");
}

function topicAnchor(topic: string, index: number): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `topic-${slug || "section"}-${index + 1}`;
}

function questionAnchor(questionId: string): string {
  return `question-${questionId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function afterNextPaint(callback: () => void): void {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

function CustomAnswer({
  question,
  current,
  onCommit
}: {
  question: Question;
  current: AnswerRecord;
  onCommit: (value: string) => void;
}): React.JSX.Element {
  const initialValue =
    current.source === "custom"
      ? Array.isArray(current.value)
        ? current.value.join(", ")
        : current.value
      : "";
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <details className="custom-wrap" open={current.source === "custom" || undefined}>
      <summary>Custom answer</summary>
      <Input
        aria-label={`Custom answer for ${question.prompt}`}
        placeholder={
          question.questionType === "multiple-choice"
            ? "Separate multiple answers with commas"
            : "Custom answer"
        }
        value={value}
        onChange={(_, data) => setValue(data.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </details>
  );
}

function QuestionCard({
  question,
  current,
  onAnswer
}: {
  question: Question;
  current: AnswerRecord;
  onAnswer: (answer: AnswerRecord) => void;
}): React.JSX.Element {
  const currentValues = Array.isArray(current.value) ? current.value : [current.value];
  const recommended = recommendedValue(question);

  const choose = (value: AnswerValue): void => {
    const source = valuesEqual(value, recommended) ? "recommended" : "changed";
    onAnswer({
      questionId: question.id,
      status: "answered",
      value,
      source
    });
  };

  const commitCustom = (rawValue: string): void => {
    const value = rawValue.trim();
    if (value === "") {
      onAnswer(makeRecommendedAnswer(question));
      return;
    }
    onAnswer({
      questionId: question.id,
      status: "answered",
      value:
        question.questionType === "multiple-choice"
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : value,
      source: "custom"
    });
  };

  return (
    <Card
      className="question-card"
      appearance="outline"
      id={questionAnchor(question.id)}
      tabIndex={-1}
    >
      <fieldset>
        <legend>{question.prompt}</legend>
        {question.questionType === "single-choice" ? (
          <RadioGroup
            value={current.source === "custom" ? "" : String(current.value)}
            onChange={(_, data) => choose(data.value)}
          >
            <div className="option-list">
              {question.options.map((option) => (
                <label className="option" key={option.id}>
                  <Radio value={option.id} />
                  <span className="option-content">
                    <span className="option-title">
                      {option.label}
                      {recommended === option.id ? " (recommended)" : ""}
                    </span>
                    <span className="option-description">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </RadioGroup>
        ) : (
          <div className="option-list">
            {question.options.map((option) => {
              const checked =
                current.source !== "custom" && currentValues.includes(option.id);
              return (
                <label className="option" key={option.id}>
                  <Checkbox
                    checked={checked}
                    onChange={(_, data) => {
                      const selected = new Set(currentValues);
                      if (data.checked === true) {
                        selected.add(option.id);
                      } else {
                        selected.delete(option.id);
                      }
                      const values = [...selected];
                      onAnswer(
                        values.length > 0
                          ? {
                              questionId: question.id,
                              status: "answered",
                              value: values,
                              source: valuesEqual(values, recommended)
                                ? "recommended"
                                : "changed"
                            }
                          : makeRecommendedAnswer(question)
                      );
                    }}
                  />
                  <span className="option-content">
                    <span className="option-title">
                      {option.label}
                      {Array.isArray(recommended) && recommended.includes(option.id)
                        ? " (recommended)"
                        : ""}
                    </span>
                    <span className="option-description">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {question.allowCustom && (
          <CustomAnswer question={question} current={current} onCommit={commitCustom} />
        )}

        <details className="recommendation">
          <summary>Why this is recommended</summary>
          <p>
            {question.recommendationRationale} Recommendation confidence:{" "}
            {question.recommendationConfidence}.
          </p>
        </details>

        {question.defer.allowed && (
          <div className="answer-actions">
            <Button
              appearance="secondary"
              onClick={() => {
                const value = temporaryDefault(question);
                onAnswer({
                  questionId: question.id,
                  status: "deferred",
                  value,
                  source: "deferred",
                  temporaryDefault: value,
                  validationTrigger: question.defer.validationTrigger
                });
              }}
            >
              Defer / unsure
            </Button>
            <Button appearance="subtle" onClick={() => onAnswer(makeRecommendedAnswer(question))}>
              Use recommendation
            </Button>
          </div>
        )}

        {current.status === "deferred" && current.temporaryDefault !== undefined && (
          <p className="defer-note">
            Temporary default: {optionLabel(question, current.temporaryDefault)}. Validate
            when: {current.validationTrigger}.
          </p>
        )}
      </fieldset>
    </Card>
  );
}

function QuestionnaireApp(): React.JSX.Element {
  const [questionnaire, setQuestionnaire] = useState<TransportQuestionnaire>();
  const [level, setLevel] = useState<DepthLevel>("standard");
  const [answers, setAnswers] = useState<Answers>({});
  const [pages, setPages] = useState<Page[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SubmitResponse>();
  const [successWarning, setSuccessWarning] = useState<string>();
  const [fatalError, setFatalError] = useState<string>();
  const [operationError, setOperationError] = useState<OperationError>();
  const [draftNotice, setDraftNotice] = useState<DraftNotice>();
  const [collapsedTopics, setCollapsedTopics] = useState<Set<string>>(
    () => new Set()
  );
  const answersRef = useRef<Answers>({});
  const previewRequestId = useRef(0);
  const submittedRef = useRef(false);
  const reviewSourceScroll = useRef(0);

  const refreshPreview = useCallback(
    async (
      activeQuestionnaire: TransportQuestionnaire,
      activeLevel: DepthLevel,
      activeAnswers: Answers
    ): Promise<void> => {
      const requestId = ++previewRequestId.current;
      let preview: PreviewResponse;
      try {
        preview = await requestJson<PreviewResponse>(
          "/api/preview",
          activeQuestionnaire.submissionToken,
          {
            method: "POST",
            body: JSON.stringify({
              level: activeLevel,
              answers: answerValueMap(activeAnswers)
            })
          }
        );
      } catch (caught) {
        if (requestId !== previewRequestId.current) {
          return;
        }
        throw caught;
      }
      if (requestId !== previewRequestId.current) {
        return;
      }
      setPages(preview.pages);
      setOperationError((current) =>
        current?.kind === "preview" ? undefined : current
      );
    },
    []
  );

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await requestJson<TransportQuestionnaire>("/api/questionnaire");
        const draftResult = loadQuestionnaireDraft(window.localStorage, loaded);
        const initialAnswers = {
          ...initializeAnswers(loaded),
          ...(draftResult.draft?.answers ?? {})
        };
        const initialLevel =
          draftResult.draft?.level ?? loaded.metadata.recommendedLevel;
        answersRef.current = initialAnswers;
        setQuestionnaire(loaded);
        setLevel(initialLevel);
        setAnswers(initialAnswers);
        setCollapsedTopics(
          new Set(draftResult.draft?.collapsedTopics ?? [])
        );
        if (draftResult.warning !== undefined) {
          setDraftNotice({ intent: "warning", message: draftResult.warning });
        } else if (draftResult.draft !== undefined) {
          setDraftNotice({
            intent: "info",
            message: `Restored your draft from ${new Date(
              draftResult.draft.savedAt
            ).toLocaleString()}.`
          });
        }
        try {
          await refreshPreview(loaded, initialLevel, initialAnswers);
          if (draftResult.draft !== undefined) {
            afterNextPaint(() =>
              window.scrollTo({ top: draftResult.draft?.scrollY ?? 0 })
            );
          }
        } catch (caught) {
          setOperationError({
            kind: "preview",
            message: `Could not refresh the visible questions: ${
              caught instanceof Error ? caught.message : String(caught)
            }`
          });
        }
      } catch (caught) {
        setFatalError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
  }, [refreshPreview]);

  useEffect(() => {
    if (questionnaire === undefined || success !== undefined) {
      return;
    }
    try {
      saveQuestionnaireDraft(window.localStorage, questionnaire, level, answers, {
        collapsedTopics: [...collapsedTopics],
        scrollY: window.scrollY
      });
      setOperationError((current) =>
        current?.kind === "draft" ? undefined : current
      );
    } catch (caught) {
      setOperationError({
        kind: "draft",
        message: `Could not save the browser draft: ${
          caught instanceof Error ? caught.message : String(caught)
        }`
      });
    }
  }, [answers, collapsedTopics, level, questionnaire, success]);

  useEffect(() => {
    if (questionnaire === undefined || success !== undefined) {
      return;
    }
    let timer: number | undefined;
    const persistScrollPosition = (): void => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        try {
          saveQuestionnaireDraft(
            window.localStorage,
            questionnaire,
            level,
            answersRef.current,
            {
              collapsedTopics: [...collapsedTopics],
              scrollY: window.scrollY
            }
          );
          setOperationError((current) =>
            current?.kind === "draft" ? undefined : current
          );
        } catch (caught) {
          setOperationError({
            kind: "draft",
            message: `Could not save the browser draft: ${
              caught instanceof Error ? caught.message : String(caught)
            }`
          });
        }
      }, 250);
    };
    window.addEventListener("scroll", persistScrollPosition, { passive: true });
    return () => {
      window.removeEventListener("scroll", persistScrollPosition);
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [collapsedTopics, level, questionnaire, success]);

  useEffect(() => {
    if (questionnaire === undefined) {
      return;
    }
    const notifyPageClosed = (event: PageTransitionEvent): void => {
      if (event.persisted || submittedRef.current) {
        return;
      }
      void fetch("/api/session/close", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quickergrillme-token": questionnaire.submissionToken
        },
        body: "{}",
        keepalive: true
      });
    };
    window.addEventListener("pagehide", notifyPageClosed);
    return () => window.removeEventListener("pagehide", notifyPageClosed);
  }, [questionnaire]);

  const visibleIds = useMemo(
    () => new Set(pages.flatMap((page) => page.questions.map((question) => question.id))),
    [pages]
  );
  const topicGroups = useMemo(() => {
    const groups = new Map<string, Question[]>();
    for (const question of pages.flatMap((page) => page.questions)) {
      const questions = groups.get(question.topic);
      if (questions === undefined) {
        groups.set(question.topic, [question]);
      } else if (!questions.some((item) => item.id === question.id)) {
        questions.push(question);
      }
    }
    return [...groups.entries()].map(([topic, questions], index) => ({
      topic,
      questions,
      anchor: topicAnchor(topic, index),
      changedCount: questions.filter(
        (question) => answers[question.id]?.source !== "recommended"
      ).length,
      deferredCount: questions.filter(
        (question) => answers[question.id]?.status === "deferred"
      ).length
    }));
  }, [answers, pages]);
  const changedQuestions = useMemo(
    () =>
      questionnaire?.questions.filter(
        (question) =>
          visibleIds.has(question.id) &&
          answers[question.id]?.source !== "recommended"
      ) ?? [],
    [answers, questionnaire, visibleIds]
  );
  const visibleQuestionCount = visibleIds.size;

  const setTopicCollapsed = (topic: string, collapsed: boolean): void => {
    setCollapsedTopics((current) => {
      const next = new Set(current);
      if (collapsed) {
        next.add(topic);
      } else {
        next.delete(topic);
      }
      return next;
    });
  };

  const navigateToTopic = (topic: string, anchor: string): void => {
    setTopicCollapsed(topic, false);
    afterNextPaint(() =>
      document.getElementById(anchor)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      })
    );
  };

  const navigateToQuestion = (question: Question): void => {
    setReviewing(false);
    setTopicCollapsed(question.topic, false);
    afterNextPaint(() => {
      const element = document.getElementById(questionAnchor(question.id));
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus({ preventScroll: true });
    });
  };

  const returnToQuestions = (): void => {
    setReviewing(false);
    afterNextPaint(() =>
      window.scrollTo({ top: reviewSourceScroll.current, behavior: "smooth" })
    );
  };

  const commitAnswer = (question: Question, answer: AnswerRecord): void => {
    if (questionnaire === undefined) {
      return;
    }
    const nextAnswers = { ...answersRef.current, [question.id]: answer };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    void refreshPreview(questionnaire, level, nextAnswers).catch((caught) => {
      setOperationError({
        kind: "preview",
        message: `Could not refresh the visible questions: ${
          caught instanceof Error ? caught.message : String(caught)
        }`
      });
    });
  };

  const changeLevel = (_: SelectionEvents, data: OptionOnSelectData): void => {
    if (questionnaire === undefined) {
      return;
    }
    const nextLevel = data.optionValue as DepthLevel | undefined;
    if (nextLevel === undefined) {
      return;
    }
    setLevel(nextLevel);
    setReviewing(false);
    void refreshPreview(questionnaire, nextLevel, answersRef.current).catch(
      (caught) => {
        setOperationError({
          kind: "preview",
          message: `Could not refresh the visible questions: ${
            caught instanceof Error ? caught.message : String(caught)
          }`
        });
      }
    );
  };

  const submitAnswers = async (): Promise<void> => {
    if (questionnaire === undefined) {
      return;
    }
    setSubmitting(true);
    setOperationError((current) =>
      current?.kind === "submit" ? undefined : current
    );
    try {
      const visibleAnswers = Object.fromEntries(
        Object.entries(answersRef.current).filter(([questionId]) =>
          visibleIds.has(questionId)
        )
      );
      const result = await requestJson<SubmitResponse>(
        "/api/submit",
        questionnaire.submissionToken,
        {
          method: "POST",
          body: JSON.stringify({
            schemaVersion: "1.1",
            questionnaireId: questionnaire.metadata.id,
            questionnaireVersion: questionnaire.metadata.version,
            level,
            round: questionnaire.round,
            submittedAt: new Date().toISOString(),
            answers: visibleAnswers,
            changedFromRecommendations: changedQuestions.map((question) => question.id)
          })
        }
      );
      submittedRef.current = true;
      try {
        removeQuestionnaireDraft(window.localStorage, questionnaire);
      } catch (caught) {
        setSuccessWarning(
          `Answers were saved, but the browser draft could not be removed: ${
            caught instanceof Error ? caught.message : String(caught)
          }`
        );
      }
      setSuccess(result);
    } catch (caught) {
      setOperationError({
        kind: "submit",
        message: `Could not submit the answers: ${
          caught instanceof Error ? caught.message : String(caught)
        }`
      });
    } finally {
      setSubmitting(false);
    }
  };

  const retryOperation = (): void => {
    if (questionnaire === undefined || operationError === undefined) {
      return;
    }
    if (operationError.kind === "submit") {
      void submitAnswers();
      return;
    }
    if (operationError.kind === "preview") {
      void refreshPreview(questionnaire, level, answersRef.current).catch(
        (caught) => {
          setOperationError({
            kind: "preview",
            message: `Could not refresh the visible questions: ${
              caught instanceof Error ? caught.message : String(caught)
            }`
          });
        }
      );
      return;
    }
    try {
      saveQuestionnaireDraft(
        window.localStorage,
        questionnaire,
        level,
        answersRef.current,
        {
          collapsedTopics: [...collapsedTopics],
          scrollY: window.scrollY
        }
      );
      setOperationError(undefined);
    } catch (caught) {
      setOperationError({
        kind: "draft",
        message: `Could not save the browser draft: ${
          caught instanceof Error ? caught.message : String(caught)
        }`
      });
    }
  };

  if (fatalError !== undefined) {
    return (
      <main className="centered-state">
        <MessageBar intent="error">
          <MessageBarBody>
            <strong>Questionnaire could not start:</strong> {fatalError}
            <span className="message-actions">
              <Button size="small" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </span>
          </MessageBarBody>
        </MessageBar>
      </main>
    );
  }

  if (success !== undefined) {
    return (
      <main className="centered-state">
        <MessageBar intent="success">
          <MessageBarBody>
            <strong>Answers saved.</strong> {success.message}
            <span className="output-path">Local file: {success.outputPath}</span>
            {successWarning !== undefined && (
              <span className="output-path">{successWarning}</span>
            )}
          </MessageBarBody>
        </MessageBar>
      </main>
    );
  }

  if (questionnaire === undefined) {
    return (
      <main className="centered-state loading">
        <Spinner label="Loading key decisions..." />
      </main>
    );
  }

  const levelLabel = (value: DepthLevel): string =>
    `${value.charAt(0).toUpperCase()}${value.slice(1)}${
      value === questionnaire.metadata.recommendedLevel ? " — recommended" : ""
    }`;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Key decision review</p>
          <h1>{questionnaire.metadata.title}</h1>
          <p className="lede">{questionnaire.metadata.description}</p>
        </div>
        <div className="toolbar">
          <label className="level-control">
            <span>Depth</span>
            <Dropdown
              aria-label="Questionnaire depth"
              value={levelLabel(level)}
              selectedOptions={[level]}
              onOptionSelect={changeLevel}
            >
              {(["essential", "standard", "deep"] as const).map((value) => (
                <Option key={value} value={value}>
                  {levelLabel(value)}
                </Option>
              ))}
            </Dropdown>
          </label>
          <div className="progress-copy">
            <strong>
              {reviewing ? "Review" : `${topicGroups.length} topics`}
            </strong>
            <span>{visibleQuestionCount} key decisions</span>
          </div>
        </div>
      </header>

      {draftNotice !== undefined && (
        <MessageBar className="app-message" intent={draftNotice.intent}>
          <MessageBarBody>
            {draftNotice.message}
            <span className="message-actions">
              <Button
                appearance="subtle"
                size="small"
                onClick={() => setDraftNotice(undefined)}
              >
                Dismiss
              </Button>
            </span>
          </MessageBarBody>
        </MessageBar>
      )}

      {operationError !== undefined && (
        <MessageBar className="app-message" intent="error">
          <MessageBarBody>
            {operationError.message}
            <span className="message-actions">
              <Button size="small" onClick={retryOperation}>
                Retry
              </Button>
              <Button
                appearance="subtle"
                size="small"
                onClick={() => setOperationError(undefined)}
              >
                Dismiss
              </Button>
            </span>
          </MessageBarBody>
        </MessageBar>
      )}

      {reviewing ? (
        <section className="review">
          <p className="eyebrow">Submission review</p>
          <h2>Review changes from Agent recommendations</h2>
          <p className="lede">
            Only differences are shown. Unchanged recommendations will still be submitted.
          </p>
          <div className="review-list">
            {changedQuestions.length === 0 ? (
              <Card className="empty-review" appearance="outline">
                No recommendations were changed. Submit the preselected key decisions to
                continue.
              </Card>
            ) : (
              changedQuestions.map((question) => (
                <Card className="review-item" appearance="outline" key={question.id}>
                  <div className="review-item-header">
                    <h3>{question.prompt}</h3>
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={() => navigateToQuestion(question)}
                    >
                      Edit answer
                    </Button>
                  </div>
                  <div className="review-comparison">
                    <div>
                      <strong>Recommended</strong>
                      {optionLabel(question, recommendedValue(question))}
                      <span className="review-meta">
                        Recommendation confidence: {question.recommendationConfidence}
                      </span>
                      <p className="review-context">
                        {optionContext(question, recommendedValue(question))}
                      </p>
                    </div>
                    <div>
                      <strong>
                        {answers[question.id]?.status === "deferred"
                          ? "Deferred"
                          : "Your answer"}
                      </strong>
                      {optionLabel(question, answers[question.id]?.value ?? "")}
                      <p className="review-context">
                        {optionContext(question, answers[question.id]?.value ?? "")}
                      </p>
                    </div>
                  </div>
                  <p className="review-rationale">
                    <strong>Why the Agent recommended differently:</strong>{" "}
                    {question.recommendationRationale}
                  </p>
                  <p className="review-affected">
                    <strong>Affected decisions:</strong>{" "}
                    {question.affectedDecisions.join(", ")}
                  </p>
                  {answers[question.id]?.status === "deferred" && (
                    <p className="review-validation">
                      <strong>Validate when:</strong>{" "}
                      {answers[question.id]?.validationTrigger}
                    </p>
                  )}
                </Card>
              ))
            )}
          </div>
          <div className="navigation">
            <Button appearance="secondary" onClick={returnToQuestions}>
              Back to questions
            </Button>
            <Button
              appearance="primary"
              disabled={submitting}
              onClick={() => void submitAnswers()}
            >
              {submitting ? "Saving..." : "Submit answers"}
            </Button>
          </div>
        </section>
      ) : (
        <div className="questionnaire-layout">
          <aside className="topic-sidebar" aria-label="Question topics">
            <nav>
              <div className="topic-sidebar-heading">
                <p className="topic-sidebar-title">Topics</p>
                <div className="topic-sidebar-actions">
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={() => setCollapsedTopics(new Set())}
                  >
                    Expand all
                  </Button>
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={() =>
                      setCollapsedTopics(
                        new Set(topicGroups.map(({ topic }) => topic))
                      )
                    }
                  >
                    Collapse all
                  </Button>
                </div>
              </div>
              <ol>
                {topicGroups.map(
                  ({
                    topic,
                    questions,
                    anchor,
                    changedCount,
                    deferredCount
                  }) => (
                  <li key={anchor}>
                    <a
                      href={`#${anchor}`}
                      onClick={(event) => {
                        event.preventDefault();
                        navigateToTopic(topic, anchor);
                      }}
                    >
                      <span>{topic}</span>
                      <span className="topic-status">
                        <span
                          className="topic-count"
                          aria-label={`${questions.length} questions`}
                        >
                          {questions.length}
                        </span>
                        {changedCount > 0 && (
                          <span
                            className="topic-state changed"
                            aria-label={`${changedCount} changed answers`}
                          >
                            {changedCount} changed
                          </span>
                        )}
                        {deferredCount > 0 && (
                          <span
                            className="topic-state deferred"
                            aria-label={`${deferredCount} deferred answers`}
                          >
                            {deferredCount} deferred
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                  )
                )}
              </ol>
            </nav>
          </aside>

          <section className="all-questions">
            {topicGroups.map(
              ({
                topic,
                questions,
                anchor,
                changedCount,
                deferredCount
              }) => {
              const collapsed = collapsedTopics.has(topic);
              return (
              <section className="topic-section" id={anchor} key={anchor}>
                <div className="topic-heading">
                  <h2>
                    <button
                      className="topic-toggle"
                      type="button"
                      aria-expanded={!collapsed}
                      aria-controls={`${anchor}-questions`}
                      onClick={() => setTopicCollapsed(topic, !collapsed)}
                    >
                      <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
                      {topic}
                    </button>
                  </h2>
                  <span className="topic-summary">
                    {questions.length} {questions.length === 1 ? "question" : "questions"}
                    {changedCount > 0 ? ` · ${changedCount} changed` : ""}
                    {deferredCount > 0 ? ` · ${deferredCount} deferred` : ""}
                  </span>
                </div>
                  <div
                    className="question-list"
                    hidden={collapsed}
                    id={`${anchor}-questions`}
                  >
                    {questions.map((question) => {
                      const current = answers[question.id];
                      return current === undefined ? null : (
                        <QuestionCard
                          key={question.id}
                          question={question}
                          current={current}
                          onAnswer={(answer) => commitAnswer(question, answer)}
                        />
                      );
                    })}
                  </div>
              </section>
              );
            })}
            <div className="navigation question-actions">
              <span>Review your changes before submitting.</span>
              <Button
                appearance="primary"
                onClick={() => {
                  reviewSourceScroll.current = window.scrollY;
                  setReviewing(true);
                  window.scrollTo(0, 0);
                }}
              >
                Review answers
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const rootElement = document.querySelector("#app");
if (rootElement === null) {
  throw new Error("Missing questionnaire application root");
}

createRoot(rootElement).render(
  <FluentProvider theme={webLightTheme}>
    <QuestionnaireApp />
  </FluentProvider>
);
