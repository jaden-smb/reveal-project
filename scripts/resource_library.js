const learnerResources = [
  {
    title: 'Spot the Signs',
    description: 'Learn how to recognize uncomfortable requests and how to respond safely.',
    links: [
      {
        url: 'https://www.stopitnow.org/ohc-content/what-is-grooming',
        label: 'Stop It Now: What is Grooming?',
      },
    ],
  },
  {
    title: 'Talk to Trusted Adults',
    description: 'Find adults you can talk to whenever you feel unsure about an online conversation.',
    links: [
      {
        url: 'https://kidshelpphone.ca',
        label: 'Kids Help Phone',
      },
      {
        url: 'https://www.childhelplineinternational.org/helplines',
        label: 'Child Helpline International',
      },
    ],
  },
];

const tutorResources = [
  {
    title: 'Guidance for Guardians',
    description: 'Tips for discussing online safety with young people.',
    links: [
      {
        url: 'https://www.missingkids.org/netsmartz/parents',
        label: 'NetSmartz for Parents & Guardians',
      },
    ],
  },
  {
    title: 'Professional Support',
    description: 'Access support lines and best practices from verified organizations.',
    links: [
      {
        url: 'https://www.icmec.org/child-protection-resources',
        label: 'International Centre for Missing & Exploited Children',
      },
      {
        url: 'https://www.end-violence.org',
        label: 'End Violence Against Children',
      },
    ],
  },
];

export class ResourceLibrary {
  #container;

  constructor({ container }) {
    this.#container = container;
  }

  render(mode = 'learner') {
    const resources = mode === 'tutor' ? tutorResources : learnerResources;
    this.#container.innerHTML = resources
      .map((resource) => {
        const links = resource.links
          .map((link) => `<a href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>`)
          .join('<br />');
        return `
          <article class="resource-card">
            <h3>${resource.title}</h3>
            <p>${resource.description}</p>
            <div class="resource-links">${links}</div>
          </article>
        `;
      })
      .join('');
  }
}

