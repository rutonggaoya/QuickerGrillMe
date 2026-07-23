// Generated from dist/src/validate.js by tools/sync-skill.mjs. Do not edit.
import { orderQuestions } from "./order.js";
import { selectQuestions } from "./select.js";
import { CONFIDENCE_LEVELS, DECISION_STAGES, DEPTH_LEVELS, IMPACT_LEVELS, QUESTION_TYPES } from "./types.js";
import { ValidationError } from "./errors.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function recordAt(value, path, issues) {
    if (!isRecord(value)) {
        issues.push(`${path} must be an object`);
        return {};
    }
    return value;
}
function rejectUnknownKeys(record, allowedKeys, path, issues) {
    const allowed = new Set(allowedKeys);
    for (const key of Object.keys(record)) {
        if (!allowed.has(key)) {
            issues.push(`${path}.${key} is not allowed`);
        }
    }
}
function stringAt(record, key, path, issues, allowEmpty = false) {
    const value = record[key];
    if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
        issues.push(`${path}.${key} must be a${allowEmpty ? "" : " non-empty"} string`);
        return "";
    }
    return value;
}
function booleanAt(record, key, path, issues) {
    const value = record[key];
    if (typeof value !== "boolean") {
        issues.push(`${path}.${key} must be a boolean`);
        return false;
    }
    return value;
}
function isAllowed(value, allowed) {
    return typeof value === "string" && allowed.some((item) => item === value);
}
function enumAt(record, key, allowed, path, issues) {
    const value = record[key];
    if (!isAllowed(value, allowed)) {
        issues.push(`${path}.${key} must be one of: ${allowed.join(", ")}`);
        return allowed[0];
    }
    return value;
}
function stringArrayAt(record, key, path, issues) {
    const value = record[key];
    if (!Array.isArray(value) ||
        value.some((item) => typeof item !== "string" || item.trim() === "")) {
        issues.push(`${path}.${key} must be an array of non-empty strings`);
        return [];
    }
    return value;
}
function optionalString(record, key, path, issues) {
    const value = record[key];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || value.trim() === "") {
        issues.push(`${path}.${key} must be a non-empty string when provided`);
        return undefined;
    }
    return value;
}
function isRfc3339DateTime(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (match === null) {
        return false;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
    const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
    if (month < 1 ||
        month > 12 ||
        hour > 23 ||
        minute > 59 ||
        second > 59 ||
        offsetHour > 23 ||
        offsetMinute > 59) {
        return false;
    }
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysByMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31
    ];
    const maximumDay = daysByMonth[month - 1];
    return maximumDay !== undefined && day >= 1 && day <= maximumDay;
}
function optionalStringArray(record, key, path, issues) {
    const value = record[key];
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) ||
        value.length === 0 ||
        value.some((item) => typeof item !== "string" || item.trim() === "")) {
        issues.push(`${path}.${key} must be a non-empty array of non-empty strings`);
        return undefined;
    }
    return value;
}
function parseOption(value, path, issues) {
    const record = recordAt(value, path, issues);
    rejectUnknownKeys(record, ["id", "label", "description"], path, issues);
    return {
        id: stringAt(record, "id", path, issues),
        label: stringAt(record, "label", path, issues),
        description: stringAt(record, "description", path, issues)
    };
}
function parseCondition(value, path, issues) {
    const record = recordAt(value, path, issues);
    rejectUnknownKeys(record, ["questionId", "operator", "value"], path, issues);
    const operator = enumAt(record, "operator", ["equals", "not-equals", "includes"], path, issues);
    return {
        questionId: stringAt(record, "questionId", path, issues),
        operator,
        value: stringAt(record, "value", path, issues)
    };
}
function parseVisibility(value, path, issues) {
    if (value === undefined) {
        return undefined;
    }
    const record = recordAt(value, path, issues);
    rejectUnknownKeys(record, ["all", "any"], path, issues);
    const parseConditions = (key) => {
        const conditions = record[key];
        if (conditions === undefined) {
            return undefined;
        }
        if (!Array.isArray(conditions) || conditions.length === 0) {
            issues.push(`${path}.${key} must be a non-empty array when provided`);
            return undefined;
        }
        return conditions.map((condition, index) => parseCondition(condition, `${path}.${key}[${index}]`, issues));
    };
    const all = parseConditions("all");
    const any = parseConditions("any");
    if (all === undefined && any === undefined) {
        issues.push(`${path} must define at least one of all or any`);
    }
    return {
        ...(all === undefined ? {} : { all }),
        ...(any === undefined ? {} : { any })
    };
}
function parseDefer(value, path, issues) {
    const record = recordAt(value, path, issues);
    rejectUnknownKeys(record, [
        "allowed",
        "temporaryDefaultOptionId",
        "temporaryDefaultOptionIds",
        "confidence",
        "validationTrigger"
    ], path, issues);
    const temporaryDefaultOptionId = optionalString(record, "temporaryDefaultOptionId", path, issues);
    const temporaryDefaultOptionIds = optionalStringArray(record, "temporaryDefaultOptionIds", path, issues);
    return {
        allowed: booleanAt(record, "allowed", path, issues),
        ...(temporaryDefaultOptionId === undefined ? {} : { temporaryDefaultOptionId }),
        ...(temporaryDefaultOptionIds === undefined ? {} : { temporaryDefaultOptionIds }),
        confidence: enumAt(record, "confidence", CONFIDENCE_LEVELS, path, issues),
        validationTrigger: stringAt(record, "validationTrigger", path, issues)
    };
}
function parseQuestion(value, path, issues) {
    const record = recordAt(value, path, issues);
    rejectUnknownKeys(record, [
        "id",
        "prompt",
        "topic",
        "minLevel",
        "complexity",
        "dependsOn",
        "visibleWhen",
        "stage",
        "impact",
        "questionType",
        "options",
        "recommendedOptionId",
        "recommendedOptionIds",
        "recommendationRationale",
        "confidence",
        "defer",
        "allowCustom",
        "affectedDecisions"
    ], path, issues);
    const complexityValue = record["complexity"];
    const complexity = typeof complexityValue === "number" &&
        Number.isInteger(complexityValue) &&
        complexityValue >= 1 &&
        complexityValue <= 5
        ? complexityValue
        : 1;
    if (complexity === 1 && complexityValue !== 1) {
        issues.push(`${path}.complexity must be an integer from 1 through 5`);
    }
    const optionsValue = record["options"];
    const options = Array.isArray(optionsValue)
        ? optionsValue.map((option, index) => parseOption(option, `${path}.options[${index}]`, issues))
        : [];
    if (!Array.isArray(optionsValue) || options.length < 2) {
        issues.push(`${path}.options must contain at least two options`);
    }
    const visibleWhen = parseVisibility(record["visibleWhen"], `${path}.visibleWhen`, issues);
    const recommendedOptionId = optionalString(record, "recommendedOptionId", path, issues);
    const recommendedOptionIds = optionalStringArray(record, "recommendedOptionIds", path, issues);
    const affectedDecisions = stringArrayAt(record, "affectedDecisions", path, issues);
    if (affectedDecisions.length === 0) {
        issues.push(`${path}.affectedDecisions must contain at least one item`);
    }
    return {
        id: stringAt(record, "id", path, issues),
        prompt: stringAt(record, "prompt", path, issues),
        topic: stringAt(record, "topic", path, issues),
        minLevel: enumAt(record, "minLevel", DEPTH_LEVELS, path, issues),
        complexity,
        dependsOn: stringArrayAt(record, "dependsOn", path, issues),
        ...(visibleWhen === undefined ? {} : { visibleWhen }),
        stage: enumAt(record, "stage", DECISION_STAGES, path, issues),
        impact: enumAt(record, "impact", IMPACT_LEVELS, path, issues),
        questionType: enumAt(record, "questionType", QUESTION_TYPES, path, issues),
        options,
        ...(recommendedOptionId === undefined ? {} : { recommendedOptionId }),
        ...(recommendedOptionIds === undefined ? {} : { recommendedOptionIds }),
        recommendationRationale: stringAt(record, "recommendationRationale", path, issues),
        confidence: enumAt(record, "confidence", CONFIDENCE_LEVELS, path, issues),
        defer: parseDefer(record["defer"], `${path}.defer`, issues),
        allowCustom: booleanAt(record, "allowCustom", path, issues),
        affectedDecisions
    };
}
function parseMetadata(value, path, issues) {
    const record = recordAt(value, path, issues);
    rejectUnknownKeys(record, ["id", "title", "description", "version", "recommendedLevel", "generatedAt"], path, issues);
    const generatedAt = optionalString(record, "generatedAt", path, issues);
    if (generatedAt !== undefined && !isRfc3339DateTime(generatedAt)) {
        issues.push(`${path}.generatedAt must be an RFC 3339 date-time`);
    }
    return {
        id: stringAt(record, "id", path, issues),
        title: stringAt(record, "title", path, issues),
        description: stringAt(record, "description", path, issues),
        version: stringAt(record, "version", path, issues),
        recommendedLevel: enumAt(record, "recommendedLevel", DEPTH_LEVELS, path, issues),
        ...(generatedAt === undefined ? {} : { generatedAt })
    };
}
function validateQuestionRelationships(questionnaire, issues) {
    const questionIds = new Set();
    for (const question of questionnaire.questions) {
        if (questionIds.has(question.id)) {
            issues.push(`questions contains duplicate id "${question.id}"`);
        }
        questionIds.add(question.id);
        const optionIds = new Set();
        for (const option of question.options) {
            if (optionIds.has(option.id)) {
                issues.push(`question "${question.id}" contains duplicate option id "${option.id}"`);
            }
            optionIds.add(option.id);
        }
        if (question.questionType === "single-choice") {
            if (question.recommendedOptionId === undefined) {
                issues.push(`question "${question.id}" must define recommendedOptionId`);
            }
            else if (!optionIds.has(question.recommendedOptionId)) {
                issues.push(`question "${question.id}" recommends unknown option "${question.recommendedOptionId}"`);
            }
            if (question.recommendedOptionIds !== undefined) {
                issues.push(`question "${question.id}" cannot use recommendedOptionIds`);
            }
        }
        else {
            if (question.recommendedOptionIds === undefined) {
                issues.push(`question "${question.id}" must define recommendedOptionIds`);
            }
            else {
                for (const optionId of question.recommendedOptionIds) {
                    if (!optionIds.has(optionId)) {
                        issues.push(`question "${question.id}" recommends unknown option "${optionId}"`);
                    }
                }
            }
            if (question.recommendedOptionId !== undefined) {
                issues.push(`question "${question.id}" cannot use recommendedOptionId`);
            }
        }
        const deferDefaults = question.questionType === "single-choice"
            ? [question.defer.temporaryDefaultOptionId]
            : question.defer.temporaryDefaultOptionIds;
        if (question.defer.allowed) {
            if (deferDefaults === undefined || deferDefaults.some((item) => item === undefined)) {
                issues.push(`question "${question.id}" must define a temporary defer default`);
            }
            else {
                for (const optionId of deferDefaults) {
                    if (optionId !== undefined && !optionIds.has(optionId)) {
                        issues.push(`question "${question.id}" defers to unknown option "${optionId}"`);
                    }
                }
            }
        }
    }
    for (const question of questionnaire.questions) {
        const references = [
            ...question.dependsOn,
            ...(question.visibleWhen?.all ?? []).map((condition) => condition.questionId),
            ...(question.visibleWhen?.any ?? []).map((condition) => condition.questionId)
        ];
        for (const reference of references) {
            if (!questionIds.has(reference)) {
                issues.push(`question "${question.id}" references unknown question "${reference}"`);
            }
            if (reference === question.id) {
                issues.push(`question "${question.id}" cannot depend on itself`);
            }
        }
    }
    if (issues.length === 0) {
        try {
            orderQuestions(questionnaire.questions);
        }
        catch (error) {
            issues.push(error instanceof Error ? error.message : "Question dependency cycle detected");
        }
    }
}
export function validateQuestionnaire(value) {
    const issues = [];
    const root = recordAt(value, "$", issues);
    rejectUnknownKeys(root, ["schemaVersion", "metadata", "questions"], "$", issues);
    const schemaVersion = stringAt(root, "schemaVersion", "$", issues);
    if (schemaVersion !== "1.0") {
        issues.push("$.schemaVersion must equal \"1.0\"");
    }
    const questionsValue = root["questions"];
    const questions = Array.isArray(questionsValue)
        ? questionsValue.map((question, index) => parseQuestion(question, `$.questions[${index}]`, issues))
        : [];
    if (!Array.isArray(questionsValue) || questions.length === 0) {
        issues.push("$.questions must be a non-empty array");
    }
    const questionnaire = {
        schemaVersion: "1.0",
        metadata: parseMetadata(root["metadata"], "$.metadata", issues),
        questions
    };
    validateQuestionRelationships(questionnaire, issues);
    if (issues.length > 0) {
        throw new ValidationError(issues);
    }
    return questionnaire;
}
const ANSWER_SOURCES = ["recommended", "changed", "custom", "deferred"];
function parseAnswerValue(value, path, issues) {
    if (typeof value === "string" && value.trim() !== "") {
        return value;
    }
    if (Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === "string" && item.trim() !== "")) {
        return value;
    }
    issues.push(`${path} must be a non-empty string or array of non-empty strings`);
    return "";
}
function parseAnswer(value, questionId, path, issues) {
    const record = recordAt(value, path, issues);
    rejectUnknownKeys(record, [
        "questionId",
        "status",
        "value",
        "source",
        "confidence",
        "temporaryDefault",
        "validationTrigger"
    ], path, issues);
    const recordedQuestionId = stringAt(record, "questionId", path, issues);
    if (recordedQuestionId !== questionId) {
        issues.push(`${path}.questionId must equal "${questionId}"`);
    }
    const status = enumAt(record, "status", ["answered", "deferred"], path, issues);
    const source = enumAt(record, "source", ANSWER_SOURCES, path, issues);
    const temporaryDefault = record["temporaryDefault"] === undefined
        ? undefined
        : parseAnswerValue(record["temporaryDefault"], `${path}.temporaryDefault`, issues);
    const validationTrigger = optionalString(record, "validationTrigger", path, issues);
    return {
        questionId,
        status,
        value: parseAnswerValue(record["value"], `${path}.value`, issues),
        source,
        confidence: enumAt(record, "confidence", CONFIDENCE_LEVELS, path, issues),
        ...(temporaryDefault === undefined ? {} : { temporaryDefault }),
        ...(validationTrigger === undefined ? {} : { validationTrigger })
    };
}
function validateAnswerAgainstQuestion(answer, question, issues) {
    const values = Array.isArray(answer.value) ? answer.value : [answer.value];
    const optionIds = new Set(question.options.map((option) => option.id));
    const recommendation = question.questionType === "single-choice"
        ? question.recommendedOptionId
        : question.recommendedOptionIds;
    const recommendedValues = Array.isArray(recommendation)
        ? [...recommendation].sort()
        : [recommendation];
    const sortedValues = [...values].sort();
    const matchesRecommendation = recommendedValues.length === sortedValues.length &&
        recommendedValues.every((value, index) => value === sortedValues[index]);
    if (question.questionType === "single-choice" && values.length !== 1) {
        issues.push(`answer "${question.id}" must select one value`);
    }
    if (answer.source !== "custom") {
        for (const value of values) {
            if (!optionIds.has(value)) {
                issues.push(`answer "${question.id}" uses unknown option "${value}"`);
            }
        }
    }
    else if (!question.allowCustom) {
        issues.push(`answer "${question.id}" does not allow a custom value`);
    }
    if (answer.source === "recommended" && !matchesRecommendation) {
        issues.push(`answer "${question.id}" is marked recommended but changes its value`);
    }
    if (answer.source === "changed" && matchesRecommendation) {
        issues.push(`answer "${question.id}" is marked changed but matches the recommendation`);
    }
    if ((answer.status === "deferred") !== (answer.source === "deferred")) {
        issues.push(`answer "${question.id}" must pair deferred status with deferred source`);
    }
    if (answer.status === "deferred") {
        if (!question.defer.allowed) {
            issues.push(`answer "${question.id}" cannot be deferred`);
        }
        if (answer.source !== "deferred" ||
            answer.temporaryDefault === undefined ||
            answer.validationTrigger === undefined) {
            issues.push(`deferred answer "${question.id}" must include source, temporaryDefault, and validationTrigger`);
        }
        else {
            const configuredDefault = question.questionType === "single-choice"
                ? question.defer.temporaryDefaultOptionId
                : question.defer.temporaryDefaultOptionIds;
            const configuredValues = Array.isArray(configuredDefault)
                ? [...configuredDefault].sort()
                : [configuredDefault];
            const temporaryValues = Array.isArray(answer.temporaryDefault)
                ? [...answer.temporaryDefault].sort()
                : [answer.temporaryDefault];
            const matchesConfiguredDefault = configuredValues.length === temporaryValues.length &&
                configuredValues.every((value, index) => value === temporaryValues[index]);
            if (!matchesConfiguredDefault || !valuesEqual(answer.value, answer.temporaryDefault)) {
                issues.push(`deferred answer "${question.id}" must use its configured temporary default`);
            }
            if (answer.confidence !== question.defer.confidence ||
                answer.validationTrigger !== question.defer.validationTrigger) {
                issues.push(`deferred answer "${question.id}" must preserve configured confidence and validation trigger`);
            }
        }
    }
}
function valuesEqual(left, right) {
    const leftValues = Array.isArray(left) ? [...left].sort() : [left];
    const rightValues = Array.isArray(right) ? [...right].sort() : [right];
    return (leftValues.length === rightValues.length &&
        leftValues.every((value, index) => value === rightValues[index]));
}
export function validateAnswerSubmission(value, questionnaire) {
    const issues = [];
    const root = recordAt(value, "$", issues);
    rejectUnknownKeys(root, [
        "schemaVersion",
        "questionnaireId",
        "questionnaireVersion",
        "level",
        "round",
        "submittedAt",
        "answers",
        "changedFromRecommendations"
    ], "$", issues);
    const schemaVersion = stringAt(root, "schemaVersion", "$", issues);
    if (schemaVersion !== "1.0") {
        issues.push("$.schemaVersion must equal \"1.0\"");
    }
    const level = enumAt(root, "level", DEPTH_LEVELS, "$", issues);
    const roundValue = root["round"];
    const round = roundValue === 2 ? 2 : 1;
    if (roundValue !== 1 && roundValue !== 2) {
        issues.push("$.round must be 1 or 2");
    }
    const answersRecord = recordAt(root["answers"], "$.answers", issues);
    const questionsById = new Map(questionnaire.questions.map((question) => [question.id, question]));
    const answerEntries = [];
    for (const [questionId, answerValue] of Object.entries(answersRecord)) {
        const question = questionsById.get(questionId);
        if (question === undefined) {
            issues.push(`$.answers contains unknown question "${questionId}"`);
            continue;
        }
        const answer = parseAnswer(answerValue, questionId, `$.answers.${questionId}`, issues);
        validateAnswerAgainstQuestion(answer, question, issues);
        answerEntries.push([questionId, answer]);
    }
    const answers = Object.fromEntries(answerEntries);
    const answerValues = Object.fromEntries(Object.entries(answers).map(([questionId, answer]) => [questionId, answer.value]));
    const selected = selectQuestions(questionnaire, level, answerValues);
    const selectedIds = new Set(selected.map((question) => question.id));
    for (const questionId of Object.keys(answers)) {
        if (!selectedIds.has(questionId)) {
            issues.push(`$.answers must not include hidden or unselected question "${questionId}"`);
        }
    }
    for (const question of selected) {
        if (!Object.hasOwn(answers, question.id)) {
            issues.push(`$.answers must include visible ${question.impact}-impact question "${question.id}"`);
        }
    }
    const questionnaireId = stringAt(root, "questionnaireId", "$", issues);
    if (questionnaireId !== questionnaire.metadata.id) {
        issues.push(`$.questionnaireId must equal "${questionnaire.metadata.id}"`);
    }
    const questionnaireVersion = stringAt(root, "questionnaireVersion", "$", issues);
    if (questionnaireVersion !== questionnaire.metadata.version) {
        issues.push(`$.questionnaireVersion must equal "${questionnaire.metadata.version}"`);
    }
    const submittedAt = stringAt(root, "submittedAt", "$", issues);
    if (!isRfc3339DateTime(submittedAt)) {
        issues.push("$.submittedAt must be an RFC 3339 date-time");
    }
    const changedFromRecommendations = Object.values(answers)
        .filter((answer) => answer.source !== "recommended")
        .map((answer) => answer.questionId)
        .sort();
    const reportedChanges = stringArrayAt(root, "changedFromRecommendations", "$", issues).sort();
    if (reportedChanges.length !== changedFromRecommendations.length ||
        reportedChanges.some((questionId, index) => questionId !== changedFromRecommendations[index])) {
        issues.push("$.changedFromRecommendations must exactly match non-recommended answers");
    }
    if (issues.length > 0) {
        throw new ValidationError(issues);
    }
    return {
        schemaVersion: "1.0",
        questionnaireId,
        questionnaireVersion,
        level,
        round,
        submittedAt,
        answers,
        changedFromRecommendations
    };
}
export function answerValues(answers) {
    return Object.fromEntries(Object.entries(answers).map(([questionId, answer]) => [questionId, answer.value]));
}
export function isConfidenceLevel(value) {
    return CONFIDENCE_LEVELS.some((confidence) => confidence === value);
}
