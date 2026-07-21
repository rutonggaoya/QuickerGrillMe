const app = document.querySelector("#app");

const state = {
  questionnaire: null,
  level: "standard",
  answers: Object.create(null),
  pages: [],
  pageIndex: 0,
  reviewing: false,
  submitting: false
};

async function requestJson(url, options = {}) {
  const requestToken = state.questionnaire?.submissionToken;
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(requestToken ? { "x-quickergrillme-token": requestToken } : {}),
      ...(options.headers ?? {})
    }
  });
  const result = await response.json();
  if (!response.ok) {
    const details = Array.isArray(result.issues)
      ? result.issues.join("\n")
      : result.message ?? result.error ?? "Request failed";
    throw new Error(details);
  }
  return result;
}

function recommendedValue(question) {
  return question.questionType === "single-choice"
    ? question.recommendedOptionId
    : question.recommendedOptionIds;
}

function isRecommendedOption(question, optionId) {
  const recommendation = recommendedValue(question);
  return Array.isArray(recommendation)
    ? recommendation.includes(optionId)
    : recommendation === optionId;
}

function temporaryDefault(question) {
  return question.questionType === "single-choice"
    ? question.defer.temporaryDefaultOptionId
    : question.defer.temporaryDefaultOptionIds;
}

function valuesEqual(left, right) {
  const leftValues = Array.isArray(left) ? [...left].sort() : [left];
  const rightValues = Array.isArray(right) ? [...right].sort() : [right];
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

function makeRecommendedAnswer(question) {
  return {
    questionId: question.id,
    status: "answered",
    value: recommendedValue(question),
    source: "recommended",
    confidence: question.confidence
  };
}

function initializeAnswers(questionnaire) {
  for (const question of questionnaire.questions) {
    state.answers[question.id] = makeRecommendedAnswer(question);
  }
}

function answerValueMap() {
  return Object.fromEntries(
    Object.entries(state.answers).map(([questionId, answer]) => [
      questionId,
      answer.value
    ])
  );
}

async function refreshPreview() {
  const preview = await requestJson("/api/preview", {
    method: "POST",
    body: JSON.stringify({
      level: state.level,
      answers: answerValueMap()
    })
  });
  state.pages = preview.pages;
  state.pageIndex = Math.min(state.pageIndex, Math.max(state.pages.length - 1, 0));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function optionLabel(question, value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => question.options.find((option) => option.id === item)?.label ?? item)
    .join(", ");
}

function setChoice(question, value) {
  state.answers[question.id] = {
    questionId: question.id,
    status: "answered",
    value,
    source: valuesEqual(value, recommendedValue(question)) ? "recommended" : "changed",
    confidence: question.confidence
  };
  void refreshPreview().then(render).catch(renderError);
}

function setDeferred(question) {
  const defaultValue = temporaryDefault(question);
  state.answers[question.id] = {
    questionId: question.id,
    status: "deferred",
    value: defaultValue,
    source: "deferred",
    confidence: question.defer.confidence,
    temporaryDefault: defaultValue,
    validationTrigger: question.defer.validationTrigger
  };
  void refreshPreview().then(render).catch(renderError);
}

function renderQuestion(question) {
  const card = element("section", "question-card");
  const meta = element("div", "question-meta");
  meta.append(
    element("span", "badge", question.topic),
    element("span", `badge ${question.impact}`, `${question.impact} impact`),
    element("span", "badge", `weight ${question.complexity}`)
  );
  if (state.answers[question.id].source === "recommended") {
    meta.append(element("span", "badge recommended", "Agent recommended"));
  }
  card.append(meta);

  const fieldset = document.createElement("fieldset");
  fieldset.append(element("legend", "", question.prompt));
  const current = state.answers[question.id];

  for (const option of question.options) {
    const label = element("label", "option");
    const input = document.createElement("input");
    input.type = question.questionType === "single-choice" ? "radio" : "checkbox";
    input.name = question.id;
    input.value = option.id;
    const currentValues = Array.isArray(current.value) ? current.value : [current.value];
    input.checked = current.source !== "custom" && currentValues.includes(option.id);
    input.addEventListener("change", () => {
      if (question.questionType === "single-choice") {
        setChoice(question, option.id);
        return;
      }
      const selected = [...fieldset.querySelectorAll('input[type="checkbox"]:checked')]
        .map((item) => item.value)
        .filter((item) => item !== "__custom");
      if (selected.length > 0) {
        setChoice(question, selected);
      } else {
        state.answers[question.id] = makeRecommendedAnswer(question);
        void refreshPreview().then(render).catch(renderError);
      }
    });
    label.append(
      input,
      element(
        "span",
        "option-title",
        `${option.label}${isRecommendedOption(question, option.id) ? " (recommended)" : ""}`
      ),
      element("span", "option-description", option.description)
    );
    fieldset.append(label);
  }

  if (question.allowCustom) {
    const customWrap = element("div", "custom-wrap");
    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.placeholder = "Custom answer";
    customInput.setAttribute("aria-label", `Custom answer for ${question.prompt}`);
    customInput.value = current.source === "custom"
      ? Array.isArray(current.value)
        ? current.value.join(", ")
        : current.value
      : "";
    customInput.addEventListener("change", () => {
      const value = customInput.value.trim();
      if (value === "") {
        state.answers[question.id] = makeRecommendedAnswer(question);
      } else {
        state.answers[question.id] = {
          questionId: question.id,
          status: "answered",
          value: question.questionType === "multiple-choice"
            ? value.split(",").map((item) => item.trim()).filter(Boolean)
            : value,
          source: "custom",
          confidence: "low"
        };
      }
      void refreshPreview().then(render).catch(renderError);
    });
    customWrap.append(customInput);
    fieldset.append(customWrap);
  }

  const rationale = element(
    "p",
    "recommendation",
    `Why this is recommended: ${question.recommendationRationale} Confidence: ${question.confidence}.`
  );
  fieldset.append(rationale);

  if (question.defer.allowed) {
    const actions = element("div", "answer-actions");
    const deferButton = element("button", "defer-button", "Defer / unsure");
    deferButton.type = "button";
    deferButton.addEventListener("click", () => setDeferred(question));
    const resetButton = element("button", "secondary", "Use recommendation");
    resetButton.type = "button";
    resetButton.addEventListener("click", () => {
      state.answers[question.id] = makeRecommendedAnswer(question);
      void refreshPreview().then(render).catch(renderError);
    });
    actions.append(deferButton, resetButton);
    fieldset.append(actions);
  }

  if (current.status === "deferred") {
    fieldset.append(
      element(
        "p",
        "defer-note",
        `Temporary default: ${optionLabel(question, current.temporaryDefault)}. Validate when: ${current.validationTrigger}`
      )
    );
  }
  card.append(fieldset);
  return card;
}

function renderHeader() {
  const header = document.createElement("header");
  header.append(
    element("p", "eyebrow", "Decision-focused design review"),
    element("h1", "", state.questionnaire.metadata.title),
    element("p", "lede", state.questionnaire.metadata.description)
  );

  const toolbar = element("div", "toolbar");
  const control = element("div", "level-control");
  const label = document.createElement("label");
  label.htmlFor = "depth";
  label.textContent = "Questionnaire depth";
  const select = document.createElement("select");
  select.id = "depth";
  for (const level of ["essential", "standard", "deep"]) {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = `${level[0].toUpperCase()}${level.slice(1)}${
      level === state.questionnaire.metadata.recommendedLevel ? " — recommended" : ""
    }`;
    option.selected = level === state.level;
    select.append(option);
  }
  select.addEventListener("change", () => {
    state.level = select.value;
    state.pageIndex = 0;
    state.reviewing = false;
    void refreshPreview().then(render).catch(renderError);
  });
  control.append(label, select);

  const questionCount = state.pages.reduce(
    (total, page) => total + page.questions.length,
    0
  );
  const progress = element("div", "progress");
  progress.append(
    element(
      "strong",
      "",
      state.reviewing
        ? "Review"
        : `Page ${state.pageIndex + 1} of ${Math.max(state.pages.length, 1)}`
    ),
    document.createTextNode(`${questionCount} visible questions`)
  );
  toolbar.append(control, progress);
  header.append(toolbar);
  return header;
}

function changedVisibleAnswers() {
  const visibleIds = new Set(
    state.pages.flatMap((page) => page.questions.map((question) => question.id))
  );
  return state.questionnaire.questions.filter(
    (question) =>
      visibleIds.has(question.id) &&
      state.answers[question.id].source !== "recommended"
  );
}

function renderReview() {
  const section = document.createElement("section");
  section.append(
    element("p", "eyebrow", "Submission review"),
    element("h2", "", "Review changes from Agent recommendations"),
    element(
      "p",
      "lede",
      "Only differences are shown. Recommended answers not listed here will still be submitted."
    )
  );
  const changed = changedVisibleAnswers();
  const list = element("div", "review-list");
  if (changed.length === 0) {
    list.append(
      element(
        "div",
        "empty-review",
        "No recommendations were changed. You can submit the preselected design defaults."
      )
    );
  } else {
    for (const question of changed) {
      const item = element("article", "review-item");
      item.append(element("h3", "", question.prompt));
      const comparison = element("div", "review-comparison");
      const recommendation = element("div");
      recommendation.append(
        element("strong", "", "Recommended"),
        document.createTextNode(optionLabel(question, recommendedValue(question)))
      );
      const answer = element("div");
      answer.append(
        element("strong", "", state.answers[question.id].status === "deferred" ? "Deferred" : "Your answer"),
        document.createTextNode(optionLabel(question, state.answers[question.id].value))
      );
      comparison.append(recommendation, answer);
      item.append(comparison);
      list.append(item);
    }
  }
  section.append(list);

  const navigation = element("div", "navigation");
  const back = element("button", "secondary", "Back to questions");
  back.type = "button";
  back.addEventListener("click", () => {
    state.reviewing = false;
    render();
  });
  const submit = element(
    "button",
    "primary",
    state.submitting ? "Saving..." : "Submit answers"
  );
  submit.type = "button";
  submit.disabled = state.submitting;
  submit.addEventListener("click", () => void submitAnswers());
  navigation.append(back, submit);
  section.append(navigation);
  return section;
}

function visibleAnswers() {
  const visibleIds = new Set(
    state.pages.flatMap((page) => page.questions.map((question) => question.id))
  );
  return Object.fromEntries(
    Object.entries(state.answers).filter(([questionId]) => visibleIds.has(questionId))
  );
}

async function submitAnswers() {
  state.submitting = true;
  render();
  try {
    const result = await requestJson("/api/submit", {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: "1.0",
        questionnaireId: state.questionnaire.metadata.id,
        questionnaireVersion: state.questionnaire.metadata.version,
        level: state.level,
        round: 1,
        submittedAt: new Date().toISOString(),
        answers: visibleAnswers(),
        changedFromRecommendations: changedVisibleAnswers().map(
          (question) => question.id
        )
      })
    });
    app.replaceChildren(
      element("section", "success")
    );
    const success = app.firstElementChild;
    success.append(
      element("p", "eyebrow", "Complete"),
      element("h2", "", "Answers saved"),
      element("p", "", result.message),
      element("p", "", `Local file: ${result.outputPath}`)
    );
  } catch (error) {
    state.submitting = false;
    renderError(error);
  }
}

function renderPage() {
  const page = state.pages[state.pageIndex];
  const section = document.createElement("section");
  const heading = element("div", "page-heading");
  heading.append(
    element("h2", "", page?.questions[0]?.topic ?? "Questions"),
    element("p", "", `Page complexity ${page?.weight ?? 0}`)
  );
  section.append(heading);
  for (const question of page?.questions ?? []) {
    section.append(renderQuestion(question));
  }

  const navigation = element("div", "navigation");
  const previous = element("button", "secondary", "Previous");
  previous.type = "button";
  previous.disabled = state.pageIndex === 0;
  previous.addEventListener("click", () => {
    state.pageIndex -= 1;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  const finalPage =
    state.pages.length === 0 || state.pageIndex === state.pages.length - 1;
  const next = element("button", "primary", finalPage ? "Review answers" : "Next");
  next.type = "button";
  next.addEventListener("click", () => {
    if (finalPage) {
      state.reviewing = true;
    } else {
      state.pageIndex += 1;
    }
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  navigation.append(previous, next);
  section.append(navigation);
  return section;
}

function render() {
  app.replaceChildren(renderHeader(), state.reviewing ? renderReview() : renderPage());
}

function renderError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const section = element("section", "error");
  section.append(
    element("p", "eyebrow", "Unable to continue"),
    element("h2", "", "Questionnaire error"),
    element("pre", "", message)
  );
  app.replaceChildren(section);
}

async function initialize() {
  state.questionnaire = await requestJson("/api/questionnaire");
  state.level = state.questionnaire.metadata.recommendedLevel;
  initializeAnswers(state.questionnaire);
  await refreshPreview();
  render();
}

void initialize().catch(renderError);
