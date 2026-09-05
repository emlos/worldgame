import { pick } from "../../../../shared/util/random.js";

function multipleChoiceQuestion(id, prompt, correct, distractors) {
  if (typeof correct !== "string" || !correct) {
    throw new Error(`English quiz format '${id}' requires a correct answer`);
  }
  const wrong = [...new Set(distractors)].filter((answer) => answer !== correct);
  if (wrong.length !== 3 || wrong.some((answer) => typeof answer !== "string" || !answer)) {
    throw new Error(`English quiz format '${id}' requires three unique distractors`);
  }
  return { id, prompt, correct, distractors: wrong };
}

const METAPHOR_EXAMPLES = Object.freeze([
  {
    correct: "The moon was a silver coin above the rooftops.",
    distractors: [
      "The moon shone like a silver coin above the rooftops.",
      "The moon appeared above the rooftops after sunset.",
      "The moon looked unusually bright that evening.",
    ],
  },
  {
    correct: "The classroom was a pressure cooker before the exam.",
    distractors: [
      "The classroom felt as tense as a pressure cooker before the exam.",
      "The classroom became noisy before the exam.",
      "Thirty students waited in the classroom before the exam.",
    ],
  },
  {
    correct: "Before dawn, the city was a sleeping giant.",
    distractors: [
      "Before dawn, the city was as quiet as a sleeping giant.",
      "Before dawn, most of the city's windows were dark.",
      "Before dawn, only a few buses moved through the city.",
    ],
  },
  {
    correct: "The library was an ocean of silence.",
    distractors: [
      "The library was as silent as an empty room.",
      "The library remained silent throughout the afternoon.",
      "Only the turning of pages could be heard in the library.",
    ],
  },
]);

const APOSTROPHE_EXAMPLES = Object.freeze([
  {
    prompt: "Which sentence correctly describes books belonging to several students?",
    correct: "The students' books covered the table.",
    distractors: [
      "The student's books covered the table.",
      "The students books' covered the table.",
      "The students books covered the table.",
    ],
  },
  {
    prompt: "Which sentence correctly describes a desk belonging to one teacher?",
    correct: "The teacher's desk stood beside the window.",
    distractors: [
      "The teachers' desk stood beside the window.",
      "The teachers desk' stood beside the window.",
      "The teacher desk stood beside the window.",
    ],
  },
  {
    prompt: "Which sentence correctly describes coats belonging to several children?",
    correct: "The children's coats hung by the door.",
    distractors: [
      "The childrens' coats hung by the door.",
      "The childrens coats' hung by the door.",
      "The childrens coats hung by the door.",
    ],
  },
  {
    prompt: "Which sentence uses its and it's correctly?",
    correct: "It's clear that the dog hurt its paw.",
    distractors: [
      "Its clear that the dog hurt it's paw.",
      "It's clear that the dog hurt it's paw.",
      "Its clear that the dog hurt its paw.",
    ],
  },
]);

const HOMOPHONE_EXAMPLES = Object.freeze([
  {
    prompt: "Which sentence uses their, there, and they're correctly?",
    correct: "They're leaving their bags over there.",
    distractors: [
      "Their leaving they're bags over there.",
      "They're leaving there bags over their.",
      "There leaving their bags over they're.",
    ],
  },
  {
    prompt: "Which sentence uses your and you're correctly?",
    correct: "You're responsible for bringing your notes.",
    distractors: [
      "Your responsible for bringing you're notes.",
      "You're responsible for bringing you're notes.",
      "Your responsible for bringing your notes.",
    ],
  },
  {
    prompt: "Which sentence uses to, too, and two correctly?",
    correct: "The two students were too tired to continue.",
    distractors: [
      "The to students were two tired to continue.",
      "The two students were to tired too continue.",
      "The too students were two tired to continue.",
    ],
  },
]);

const AGREEMENT_EXAMPLES = Object.freeze([
  {
    correct: "Each student has a copy of the worksheet.",
    distractors: [
      "Each student have a copy of the worksheet.",
      "Each students has a copy of the worksheet.",
      "Each students have a copy of the worksheet.",
    ],
  },
  {
    correct: "The players on the field are waiting for the whistle.",
    distractors: [
      "The players on the field is waiting for the whistle.",
      "The player on the field are waiting for the whistle.",
      "The players on the field am waiting for the whistle.",
    ],
  },
  {
    correct: "Neither of the answers is correct.",
    distractors: [
      "Neither of the answers are correct.",
      "Neither of the answer are correct.",
      "Neither of the answers be correct.",
    ],
  },
  {
    correct: "The stack of books belongs on the shelf.",
    distractors: [
      "The stack of books belong on the shelf.",
      "The stack of book belong on the shelf.",
      "The stacks of books belongs on the shelf.",
    ],
  },
]);

const PUNCTUATION_EXAMPLES = Object.freeze([
  {
    correct: "After the bell rang, the students packed their bags.",
    distractors: [
      "After the bell rang the students packed their bags.",
      "After, the bell rang the students packed their bags.",
      "After the bell, rang the students packed their bags.",
    ],
  },
  {
    correct: "Maya asked, \"Are we leaving now?\"",
    distractors: [
      "Maya asked \"Are we leaving now?\"",
      "Maya asked, \"Are we leaving now\"?",
      "Maya asked \"Are we leaving now\".",
    ],
  },
  {
    correct: "The rain stopped; the match continued.",
    distractors: [
      "The rain stopped, the match continued.",
      "The rain stopped the match; continued.",
      "The rain; stopped the match continued.",
    ],
  },
]);

const VOCABULARY_EXAMPLES = Object.freeze([
  {
    word: "reluctant",
    sentence: "Taylor was reluctant to volunteer first.",
    correct: "hesitant",
    distractors: ["eager", "careless", "furious"],
  },
  {
    word: "vivid",
    sentence: "The author gives a vivid description of the storm.",
    correct: "detailed",
    distractors: ["ordinary", "confusing", "brief"],
  },
  {
    word: "scarce",
    sentence: "Clean water became scarce after the pipes broke.",
    correct: "limited",
    distractors: ["plentiful", "dirty", "expensive"],
  },
  {
    word: "verify",
    sentence: "The reporter tried to verify the witness's claim.",
    correct: "confirm",
    distractors: ["repeat", "invent", "dismiss"],
  },
]);

export const ENGLISH_QUIZ_QUESTION_FORMATS = Object.freeze([
  {
    id: "identify-metaphor",
    generate(rnd) {
      const example = pick(METAPHOR_EXAMPLES, rnd);
      return multipleChoiceQuestion(
        this.id,
        "Which sentence contains a metaphor?",
        example.correct,
        example.distractors,
      );
    },
  },
  {
    id: "apostrophe-usage",
    generate(rnd) {
      const example = pick(APOSTROPHE_EXAMPLES, rnd);
      return multipleChoiceQuestion(
        this.id,
        example.prompt,
        example.correct,
        example.distractors,
      );
    },
  },
  {
    id: "homophones",
    generate(rnd) {
      const example = pick(HOMOPHONE_EXAMPLES, rnd);
      return multipleChoiceQuestion(
        this.id,
        example.prompt,
        example.correct,
        example.distractors,
      );
    },
  },
  {
    id: "subject-verb-agreement",
    generate(rnd) {
      const example = pick(AGREEMENT_EXAMPLES, rnd);
      return multipleChoiceQuestion(
        this.id,
        "Which sentence has correct subject-verb agreement?",
        example.correct,
        example.distractors,
      );
    },
  },
  {
    id: "punctuation",
    generate(rnd) {
      const example = pick(PUNCTUATION_EXAMPLES, rnd);
      return multipleChoiceQuestion(
        this.id,
        "Which sentence is punctuated correctly?",
        example.correct,
        example.distractors,
      );
    },
  },
  {
    id: "vocabulary-in-context",
    generate(rnd) {
      const example = pick(VOCABULARY_EXAMPLES, rnd);
      return multipleChoiceQuestion(
        this.id,
        `In the sentence \"${example.sentence}\", which word is closest in meaning to \"${example.word}\"?`,
        example.correct,
        example.distractors,
      );
    },
  },
]);

export const ENGLISH_QUIZ_BANK = Object.freeze({
  id: "english.core",
  subjectId: "english",
  gradeChange: 1,
  questionFormats: ENGLISH_QUIZ_QUESTION_FORMATS,
});
