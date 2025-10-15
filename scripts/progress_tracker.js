const baseProgress = {
  learner: {
    points: 0,
    badges: [
      {
        id: 'welcome',
        name: 'Safety Starter',
        description: 'Begin your first simulation and learn the basics.',
      },
    ],
  },
  tutor: {
    points: 0,
    badges: [
      {
        id: 'mentor',
        name: 'Trusted Mentor',
        description: 'Review the educational resources for supporting youth.',
      },
    ],
  },
};

export class ProgressTracker {
  #container;
  #mode = 'learner';
  #state = structuredClone(baseProgress);

  constructor({ container }) {
    this.#container = container;
  }

  setMode(mode) {
    this.#mode = mode;
    this.render();
  }

  update(progress) {
    const modeState = this.#state[this.#mode];
    modeState.points += progress.reward?.points || 0;
    if (progress.reward?.badges) {
      for (const badge of progress.reward.badges) {
        if (!modeState.badges.some((existing) => existing.id === badge)) {
          modeState.badges.push({
            id: badge,
            name: badge,
            description: 'Earned for showing safe decision-making.',
          });
        }
      }
    }
    this.render();
  }

  render() {
    const { points, badges } = this.#state[this.#mode];
    const badgeCards = badges
      .map(
        (badge) => `
          <article class="badge-card">
            <div class="badge-icon">★</div>
            <div>
              <strong>${badge.name}</strong><br />
              <span>${badge.description}</span>
            </div>
          </article>
        `
      )
      .join('');

    this.#container.innerHTML = `
      <div class="score">
        <strong>Total Points:</strong> ${points}
      </div>
      <div class="badge-list">
        ${badgeCards || '<p>No badges yet. Complete a simulation to get started!</p>'}
      </div>
    `;
  }
}

