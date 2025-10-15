const toneTemplates = {
  coaching: {
    summary: 'Great job staying cautious!',
    tips: ['Keep asking questions if something feels unclear.'],
  },
  caution: {
    summary: 'This message includes some risk signals.',
    tips: [
      'Watch for sudden requests for privacy or secrecy.',
      'Share concerns with a trusted adult before continuing.',
    ],
  },
  critical: {
    summary: 'This response could increase risk.',
    tips: [
      'Never move the conversation to another platform.',
      'Stop responding and seek help from a parent, educator, or helpline.',
    ],
  },
};

const scenarioTemplates = [
  {
    id: 'friendly-invite',
    persona: 'FriendFun21',
    difficulty: 'medium',
    intro: 'FriendFun21: Hey! I loved your art post. Want to chat somewhere private about a special opportunity?',
    closing: 'Coach: Remember, real friends respect boundaries. Always pause when someone pushes for privacy quickly.',
    steps: [
      {
        prompt: 'FriendFun21: It will be easier if we switch to video. Can you share your username on another app?',
        evaluate: (input) => classifyResponse(input, {
          good: ['no', 'not comfortable', 'prefer here'],
          risky: ['maybe', 'okay', 'sure'],
        }),
      },
      {
        prompt: 'FriendFun21: I get it, but it is a really fun project. Maybe send me one photo so I can show the team?',
        evaluate: (input) => classifyResponse(input, {
          good: ['no photo', 'no', 'not sharing'],
          risky: ['i can send', 'maybe later', 'ok'],
        }),
      },
    ],
  },
  {
    id: 'secret-favor',
    persona: 'SupportiveSam',
    difficulty: 'easy',
    intro: 'SupportiveSam: We are such good friends now. Can you keep a little secret for me?',
    closing: 'Coach: Secrets that make you uncomfortable are warning signs. Trusted adults are there to help.',
    steps: [
      {
        prompt: 'SupportiveSam: I trust you. Let us move to another account where it is private, okay?',
        evaluate: (input) => classifyResponse(input, {
          good: ['no', 'stay here', 'not moving'],
          risky: ['sure', 'okay'],
        }),
      },
      {
        prompt: 'SupportiveSam: Promise not to tell anyone, even your parents?',
        evaluate: (input) => classifyResponse(input, {
          good: ['i will tell', 'i talk to parents', 'no secrets'],
          risky: ['i promise', 'i will not', 'okay'],
        }),
      },
    ],
  },
];

export const sampleScenarios = scenarioTemplates.map((scenario) => ({
  ...scenario,
  steps: scenario.steps.map((step) => ({
    ...step,
    evaluate: (input) => step.evaluate(input.toLowerCase()),
  })),
}));

function classifyResponse(input, categories) {
  const cleaned = input.toLowerCase();
  const matchCategory = (phrases) => phrases.some((phrase) => cleaned.includes(phrase));

  if (matchCategory(categories.good)) {
    return {
      feedback: toneTemplates.coaching,
      progressReward: { points: 50, badges: ['Boundary Defender'] },
    };
  }

  if (matchCategory(categories.risky)) {
    return {
      feedback: {
        summary: toneTemplates.caution.summary,
        tips: toneTemplates.caution.tips,
        tone: 'caution',
      },
      progressReward: { points: 10 },
    };
  }

  return {
    feedback: {
      summary: toneTemplates.critical.summary,
      tips: toneTemplates.critical.tips,
      tone: 'critical',
    },
    progressReward: { points: 0 },
  };
}

