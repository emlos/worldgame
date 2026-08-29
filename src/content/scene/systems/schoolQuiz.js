import { createChoice } from "../../../classes/game/scene/choiceContract.js";
import { SCENE_ACTION_TYPE } from "../../../data/scene/actions.js";
import { QUIZ_BANKS } from "../../../data/scene/quizzes/index.js";
import { deriveSeed, makeRNG } from "../../../shared/util/random.js";

const STATE_VERSION = 1;

function fail(message) {
  throw new Error(`School quiz: ${message}`);
}

function shuffle(values, rnd) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rnd() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function getBank(bankId) {
  const bank = QUIZ_BANKS[String(bankId)];
  if (!bank) fail(`unknown question bank '${String(bankId)}'`);
  return bank;
}

function generateQuestions(bank, count, rnd) {
  if (!Number.isInteger(count) || count < 1 || count > bank.questionFormats.length) {
    fail(`question count must be between 1 and ${bank.questionFormats.length}`);
  }
  return shuffle(bank.questionFormats, rnd)
    .slice(0, count)
    .map((format, questionIndex) => {
      const generated = format.generate(rnd);
      const labels = shuffle([generated.correct, ...generated.distractors], rnd);
      const choices = labels.map((label, answerIndex) => ({
        id: `a${answerIndex + 1}`,
        label,
      }));
      return {
        id: `q${questionIndex + 1}:${generated.id}`,
        prompt: generated.prompt,
        choices,
        correctChoiceId: choices.find((choice) => choice.label === generated.correct).id,
      };
    });
}

function validateState(state) {
  if (!state || state.version !== STATE_VERSION) fail("state has an invalid version");
  const bank = getBank(state.bankId);
  if (!Array.isArray(state.questions) || !state.questions.length) {
    fail("state requires generated questions");
  }
  if (!Array.isArray(state.answers)) fail("state answers must be an array");
  const questionIds = new Set();
  for (const question of state.questions) {
    if (typeof question?.id !== "string" || !question.id) fail("question id is invalid");
    if (questionIds.has(question.id)) fail(`question id '${question.id}' is duplicated`);
    questionIds.add(question.id);
    if (typeof question.prompt !== "string" || !question.prompt) {
      fail(`question '${question.id}' prompt is invalid`);
    }
    if (!Array.isArray(question.choices) || question.choices.length < 2) {
      fail(`question '${question.id}' choices are invalid`);
    }
    const choiceIds = new Set();
    for (const choice of question.choices) {
      if (typeof choice?.id !== "string" || !choice.id) {
        fail(`question '${question.id}' has an invalid choice id`);
      }
      if (choiceIds.has(choice.id)) {
        fail(`question '${question.id}' duplicates choice '${choice.id}'`);
      }
      choiceIds.add(choice.id);
      if (typeof choice.label !== "string" || !choice.label) {
        fail(`question '${question.id}' choice '${choice.id}' has an invalid label`);
      }
    }
    if (!choiceIds.has(question.correctChoiceId)) {
      fail(`question '${question.id}' has an invalid correct answer`);
    }
  }
  if (state.answers.length > state.questions.length) fail("state has too many answers");
  state.answers.forEach((answer, index) => {
    const question = state.questions[index];
    if (answer?.questionId !== question.id) fail("answers are not in question order");
    if (!question.choices.some((choice) => choice.id === answer.answerId)) {
      fail(`answer for question '${question.id}' is invalid`);
    }
    const correct = answer.answerId === question.correctChoiceId;
    if (answer.correct !== correct) fail(`answer result for question '${question.id}' is invalid`);
  });
  if (!Number.isInteger(state.questionIndex) || state.questionIndex < 0) {
    fail("state question index is invalid");
  }
  const calculatedScore = state.answers.filter((answer) => answer.correct).length;
  if (!Number.isInteger(state.score) || state.score !== calculatedScore) {
    fail("state score is invalid");
  }
  if (typeof state.complete !== "boolean") fail("state completion flag is invalid");
  if (state.complete && state.answers.length !== state.questions.length) {
    fail("completed state must answer every question");
  }
  if (state.complete && state.questionIndex !== state.questions.length - 1) {
    fail("completed state has an invalid question index");
  }
  if (!state.complete && state.questionIndex >= state.questions.length) {
    fail("active question index is out of range");
  }
  if (!state.complete && state.questionIndex !== state.answers.length) {
    fail("active question index does not match answered questions");
  }
  if (bank.subjectId !== state.subjectId) fail("state subject does not match its bank");
}

function answerChoice(definition, systemId, question, choice) {
  return createChoice({
    id: `quiz-answer:${choice.id}`,
    icon: "✍️",
    label: choice.label,
    action: {
      type: SCENE_ACTION_TYPE.wgSystem,
      sequenceId: definition.id,
      systemId,
      command: {
        type: "answer",
        questionId: question.id,
        answerId: choice.id,
      },
    },
  });
}

function resultText(state) {
  if (state.score === state.questions.length) {
    return "You feel confident that every answer landed where it should.";
  }
  if (state.score >= Math.ceil(state.questions.length * (2 / 3))) {
    return "Most of the questions felt manageable, though one or two answers still nag at you.";
  }
  return "You are left replaying several questions in your head as the papers are collected.";
}

export const SCHOOL_QUIZ_STORY_SYSTEM = Object.freeze({
  create({ game, config, instanceKey }) {
    const bank = getBank(config.bank);
    const count = config.questions ?? 3;
    const rnd = makeRNG(deriveSeed(game.seed, `wg-system:${instanceKey}:school-quiz`));
    return {
      version: STATE_VERSION,
      bankId: bank.id,
      subjectId: bank.subjectId,
      questionIndex: 0,
      score: 0,
      complete: false,
      answers: [],
      questions: generateQuestions(bank, count, rnd),
    };
  },

  validateState,

  render({ definition, systemId, state }) {
    if (state.complete) {
      return {
        content: [
          {
            type: "paragraph",
            text: "The teacher collects the papers and announces that the quiz is over.",
          },
          {
            type: "paragraph",
            text: `You answered ${state.score} out of ${state.questions.length} questions correctly.`,
          },
          { type: "paragraph", text: resultText(state) },
        ],
        sections: [
          {
            id: "choices",
            heading: "Continue",
            choices: [
              createChoice({
                id: "quiz-finish",
                label: "Return to class",
                action: {
                  type: SCENE_ACTION_TYPE.wgSystem,
                  sequenceId: definition.id,
                  systemId,
                  command: { type: "finish" },
                },
              }),
            ],
          },
        ],
      };
    }

    const question = state.questions[state.questionIndex];
    const introduction = state.questionIndex === 0
      ? [
          {
            type: "paragraph",
            text: "Without warning, the teacher hands out a short quiz and asks everyone to begin.",
          },
        ]
      : [];
    return {
      content: [
        ...introduction,
        {
          type: "paragraph",
          text: `Question ${state.questionIndex + 1} of ${state.questions.length}: ${question.prompt}`,
        },
      ],
      sections: [
        {
          id: "choices",
          heading: definition.choiceHeading,
          choices: question.choices.map((choice) =>
            answerChoice(definition, systemId, question, choice),
          ),
        },
      ],
    };
  },

  act({ definition, state, command }) {
    const bank = getBank(state.bankId);
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      fail("command must be an object");
    }

    if (command.type === "finish") {
      if (!state.complete) fail("cannot finish before every question is answered");
      return { target: definition.finalTarget, notice: "The quiz is over." };
    }
    if (command.type !== "answer") fail(`unknown command '${String(command.type)}'`);
    if (state.complete) fail("cannot answer a completed quiz");

    const question = state.questions[state.questionIndex];
    if (command.questionId !== question.id) fail("answer does not match the current question");
    if (!question.choices.some((choice) => choice.id === command.answerId)) {
      fail("answer is not available for the current question");
    }

    const correct = command.answerId === question.correctChoiceId;
    state.answers.push({
      questionId: question.id,
      answerId: command.answerId,
      correct,
    });
    if (correct) state.score += 1;
    if (state.answers.length === state.questions.length) state.complete = true;
    else state.questionIndex += 1;

    return {
      state,
      effects: [
        {
          op: "grade",
          id: bank.subjectId,
          amount: correct ? bank.gradeChange : -bank.gradeChange,
        },
      ],
      notice: "Answer recorded.",
    };
  },
});
