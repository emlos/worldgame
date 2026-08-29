import { randInt } from "../../../shared/util/random.js";

function numericQuestion(id, prompt, correct, distractors) {
  const answer = Number(correct);
  const wrong = [...new Set(distractors.map(Number))].filter(
    (candidate) => Number.isFinite(candidate) && candidate !== answer,
  );
  for (let offset = 1; wrong.length < 3; offset += 1) {
    const candidate = answer + offset;
    if (!wrong.includes(candidate)) wrong.push(candidate);
  }
  return {
    id,
    prompt,
    correct: String(answer),
    distractors: wrong.slice(0, 3).map(String),
  };
}

export const MATH_QUIZ_QUESTION_FORMATS = Object.freeze([
  {
    id: "linear-addition",
    generate(rnd) {
      const answer = randInt(2, 20, rnd);
      const addend = randInt(2, 15, rnd);
      const total = answer + addend;
      return numericQuestion(
        this.id,
        `Solve x + ${addend} = ${total}.`,
        answer,
        [answer - 1, answer + 1, total],
      );
    },
  },
  {
    id: "linear-multiplication",
    generate(rnd) {
      const answer = randInt(2, 12, rnd);
      const factor = randInt(2, 9, rnd);
      const total = answer * factor;
      return numericQuestion(
        this.id,
        `Solve ${factor}x = ${total}.`,
        answer,
        [answer + factor, total - factor, factor],
      );
    },
  },
  {
    id: "triangle-area",
    generate(rnd) {
      const base = randInt(2, 8, rnd) * 2;
      const height = randInt(2, 12, rnd);
      const answer = (base * height) / 2;
      return numericQuestion(
        this.id,
        `What is the area of a triangle with a base of ${base} and a height of ${height}?`,
        answer,
        [base * height, base + height, (base + height) * 2],
      );
    },
  },
  {
    id: "rectangle-perimeter",
    generate(rnd) {
      const width = randInt(2, 14, rnd);
      const height = randInt(2, 14, rnd);
      const answer = (width + height) * 2;
      return numericQuestion(
        this.id,
        `What is the perimeter of a rectangle ${width} units wide and ${height} units high?`,
        answer,
        [width * height, width + height, width * 2 + height],
      );
    },
  },
  {
    id: "arithmetic-mean",
    generate(rnd) {
      const start = randInt(1, 10, rnd);
      const step = randInt(1, 5, rnd);
      const values = Array.from({ length: 5 }, (_, index) => start + step * index);
      const answer = values[2];
      return numericQuestion(
        this.id,
        `Calculate the mean of ${values.join(", ")}.`,
        answer,
        [values.reduce((sum, value) => sum + value, 0), answer - step, answer + step],
      );
    },
  },
  {
    id: "percentage",
    generate(rnd) {
      const percent = [10, 20, 25, 50][randInt(0, 3, rnd)];
      const whole = randInt(2, 12, rnd) * 20;
      const answer = (whole * percent) / 100;
      return numericQuestion(
        this.id,
        `What is ${percent}% of ${whole}?`,
        answer,
        [whole - answer, answer * 2, whole / percent],
      );
    },
  },
]);

export const MATH_QUIZ_BANK = Object.freeze({
  id: "math.core",
  subjectId: "math",
  gradeChange: 1,
  questionFormats: MATH_QUIZ_QUESTION_FORMATS,
});
