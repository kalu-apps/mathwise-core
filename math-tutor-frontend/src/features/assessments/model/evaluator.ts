import type {
  AssessmentQuestion,
  AssessmentQuestionCheckResult,
  RecommendationLink,
  TestTemplate,
} from "@/features/assessments/model/types";

const normalizeByRules = (
  raw: string,
  question: AssessmentQuestion
): string => {
  const source = raw ?? "";
  const trimSpaces = question.answerSpec.formatRules?.trimSpaces ?? true;
  const allowCommaDecimal =
    question.answerSpec.formatRules?.allowCommaDecimal ?? true;

  let value = trimSpaces ? source.trim() : source;
  if (question.answerSpec.type === "number" && allowCommaDecimal) {
    value = value.replace(/,/g, ".");
  }
  if (question.answerSpec.type !== "number") {
    value = value.replace(/\s+/g, " ").trim();
  }
  return value;
};

const normalizeExpected = (question: AssessmentQuestion): string[] => {
  const expected = Array.isArray(question.answerSpec.expected)
    ? question.answerSpec.expected
    : [question.answerSpec.expected];

  return expected.map((item) => normalizeByRules(item, question));
};

const checkNumberAnswer = (
  normalizedInput: string,
  question: AssessmentQuestion
): { isCorrect: boolean; reason: "correct" | "incorrect" | "invalid_format" } => {
  if (!normalizedInput.length) {
    return { isCorrect: false, reason: "invalid_format" };
  }

  const parsedInput = Number.parseFloat(normalizedInput);
  if (!Number.isFinite(parsedInput)) {
    return { isCorrect: false, reason: "invalid_format" };
  }

  const expectedVariants = normalizeExpected(question)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item));

  if (expectedVariants.length === 0) {
    return { isCorrect: false, reason: "invalid_format" };
  }

  const tolerance = question.answerSpec.tolerance;
  const EPSILON = 1e-9;

  const hit = expectedVariants.some((expected) => {
    if (!tolerance) {
      return Math.abs(parsedInput - expected) <= EPSILON;
    }
    if (tolerance.kind === "abs") {
      return Math.abs(parsedInput - expected) <= tolerance.value;
    }
    const base = Math.abs(expected) <= EPSILON ? 1 : Math.abs(expected);
    return Math.abs(parsedInput - expected) / base <= tolerance.value;
  });

  return hit
    ? { isCorrect: true, reason: "correct" }
    : { isCorrect: false, reason: "incorrect" };
};

const checkTextLikeAnswer = (
  normalizedInput: string,
  question: AssessmentQuestion
): { isCorrect: boolean; reason: "correct" | "incorrect" | "invalid_format" } => {
  if (!normalizedInput.length) {
    return { isCorrect: false, reason: "invalid_format" };
  }

  const normalizedVariants = normalizeExpected(question).map((item) =>
    item.toLowerCase()
  );
  const normalizedValue = normalizedInput.toLowerCase();
  const isCorrect = normalizedVariants.includes(normalizedValue);

  return isCorrect
    ? { isCorrect: true, reason: "correct" }
    : { isCorrect: false, reason: "incorrect" };
};

const getQuestionRecommendations = (
  _template: TestTemplate,
  question: AssessmentQuestion,
  isCorrect: boolean
): RecommendationLink[] => {
  if (isCorrect) return [];

  const links: RecommendationLink[] = [];
  const directRecommendations = question.feedback.recommendations ?? [];
  links.push(...directRecommendations);

  const unique = new Map<string, RecommendationLink>();
  links.forEach((item) => {
    const key = `${item.text}::${item.link?.courseId ?? ""}::${
      item.link?.lessonId ?? ""
    }::${item.link?.itemId ?? ""}`;
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  });
  return Array.from(unique.values());
};

export const checkAssessmentQuestion = (
  template: TestTemplate,
  question: AssessmentQuestion,
  rawAnswer: string
): AssessmentQuestionCheckResult => {
  const normalized = normalizeByRules(rawAnswer, question);

  const verdict =
    question.answerSpec.type === "number"
      ? checkNumberAnswer(normalized, question)
      : checkTextLikeAnswer(normalized, question);

  return {
    normalized,
    isCorrect: verdict.isCorrect,
    reason: verdict.reason,
    explanation: question.feedback.explanation,
    recommendations: getQuestionRecommendations(template, question, verdict.isCorrect),
  };
};

const looksLikeNumber = (value: string) =>
  /^[-+]?\d+([.,]\d+)?$/.test(value.trim());

const looksLikeExpression = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return false;
  if (looksLikeNumber(normalized)) return false;
  // Accept typical school expression patterns.
  return /[+\-*/^=()xXyYzZ]/.test(normalized);
};

export const detectAssessmentAnswerType = (
  expected: string | string[]
): AssessmentQuestion["answerSpec"]["type"] => {
  const variants = (Array.isArray(expected) ? expected : [expected])
    .map((item) => item.trim())
    .filter(Boolean);
  if (variants.length === 0) return "text";
  if (variants.every((variant) => looksLikeNumber(variant))) return "number";
  if (variants.some((variant) => looksLikeExpression(variant))) return "expression";
  return "text";
};

export const evaluateAssessmentAnswers = (
  template: TestTemplate,
  answers: Record<string, string>
) => {
  const checked = template.questions.map((question) => {
    const raw = answers[question.id] ?? "";
    const result = checkAssessmentQuestion(template, question, raw);
    return {
      question,
      raw,
      ...result,
    };
  });

  const correct = checked.filter((item) => item.isCorrect).length;
  const total = checked.length;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  const recommendations = checked
    .flatMap((item) => item.recommendations)
    .reduce<RecommendationLink[]>((acc, recommendation) => {
      const exists = acc.some(
        (item) =>
          item.text === recommendation.text &&
          item.link?.courseId === recommendation.link?.courseId &&
          item.link?.lessonId === recommendation.link?.lessonId &&
          item.link?.itemId === recommendation.link?.itemId
      );
      if (!exists) {
        acc.push(recommendation);
      }
      return acc;
    }, []);

  return {
    checked,
    score: { correct, total, percent },
    topicBreakdown: [],
    recommendations,
  };
};
