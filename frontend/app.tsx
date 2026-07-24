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
    source: "recommended",
    confidence: question.confidence
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

function topicAnchor(topic: string, index: number): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `topic-${slug || "section"}-${index + 1}`;
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
    onAnswer({
      questionId: question.id,
      status: "answered",
      value,
      source: valuesEqual(value, recommended) ? "recommended" : "changed",
      confidence: question.confidence
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
      source: "custom",
      confidence: "low"
    });
  };

  return (
    <Card className="question-card" appearance="outline">
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
                                : "changed",
                              confidence: question.confidence
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
            {question.recommendationRationale} Confidence: {question.confidence}.
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
                  confidence: question.defer.confidence,
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
            when: {current.validationTrigger}
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
  const [error, setError] = useState<string>();
  const answersRef = useRef<Answers>({});
  const previewRequestId = useRef(0);

  const refreshPreview = useCallback(
    async (
      activeQuestionnaire: TransportQuestionnaire,
      activeLevel: DepthLevel,
      activeAnswers: Answers
    ): Promise<void> => {
      const requestId = ++previewRequestId.current;
      const preview = await requestJson<PreviewResponse>(
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
      if (requestId !== previewRequestId.current) {
        return;
      }
      setPages(preview.pages);
    },
    []
  );

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await requestJson<TransportQuestionnaire>("/api/questionnaire");
        const initialAnswers = initializeAnswers(loaded);
        answersRef.current = initialAnswers;
        setQuestionnaire(loaded);
        setLevel(loaded.metadata.recommendedLevel);
        setAnswers(initialAnswers);
        await refreshPreview(loaded, loaded.metadata.recommendedLevel, initialAnswers);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
  }, [refreshPreview]);

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
      anchor: topicAnchor(topic, index)
    }));
  }, [pages]);
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

  const commitAnswer = (question: Question, answer: AnswerRecord): void => {
    if (questionnaire === undefined) {
      return;
    }
    const nextAnswers = { ...answersRef.current, [question.id]: answer };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    void refreshPreview(questionnaire, level, nextAnswers).catch((caught) =>
      setError(caught instanceof Error ? caught.message : String(caught))
    );
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
    void refreshPreview(questionnaire, nextLevel, answersRef.current).catch((caught) =>
      setError(caught instanceof Error ? caught.message : String(caught))
    );
  };

  const submitAnswers = async (): Promise<void> => {
    if (questionnaire === undefined) {
      return;
    }
    setSubmitting(true);
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
            schemaVersion: "1.0",
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
      setSuccess(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSubmitting(false);
    }
  };

  if (error !== undefined) {
    return (
      <main className="centered-state">
        <MessageBar intent="error">
          <MessageBarBody>
            <strong>Questionnaire error:</strong> {error}
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
                  <h3>{question.prompt}</h3>
                  <div className="review-comparison">
                    <div>
                      <strong>Recommended</strong>
                      {optionLabel(question, recommendedValue(question))}
                    </div>
                    <div>
                      <strong>
                        {answers[question.id]?.status === "deferred"
                          ? "Deferred"
                          : "Your answer"}
                      </strong>
                      {optionLabel(question, answers[question.id]?.value ?? "")}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
          <div className="navigation">
            <Button appearance="secondary" onClick={() => setReviewing(false)}>
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
              <p className="topic-sidebar-title">Topics</p>
              <ol>
                {topicGroups.map(({ topic, questions, anchor }) => (
                  <li key={anchor}>
                    <a href={`#${anchor}`}>
                      <span>{topic}</span>
                      <span aria-label={`${questions.length} questions`}>
                        {questions.length}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <section className="all-questions">
            {topicGroups.map(({ topic, questions, anchor }) => (
              <section className="topic-section" id={anchor} key={anchor}>
                <div className="topic-heading">
                  <h2>{topic}</h2>
                  <span>
                    {questions.length} {questions.length === 1 ? "question" : "questions"}
                  </span>
                </div>
                <div className="question-list">
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
            ))}
            <div className="navigation question-actions">
              <span>Review your changes before submitting.</span>
              <Button
                appearance="primary"
                onClick={() => {
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
