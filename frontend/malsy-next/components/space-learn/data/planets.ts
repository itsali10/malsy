export const PASS_THRESHOLD = 0.7;

export interface PlanetQuestion {
  q: string;
  options: string[];
  correctIndex: number;
}

export interface Planet {
  id: string;
  name: string;
  emoji: string;
  order: number;
  guideLine: string;
  questions: PlanetQuestion[];
}

export const PLANETS: Planet[] = [
  {
    id: 'mercury', name: 'Mercury', emoji: '☿️', order: 0,
    guideLine: 'Closest to the Sun — small and rocky!',
    questions: [
      { q: 'Mercury is the ______ planet to the Sun.', options: ['Farthest', 'Closest', 'Second', 'Hottest always'], correctIndex: 1 },
      { q: 'Mercury is mostly made of…', options: ['Ice', 'Rock and metal', 'Gas', 'Liquid water'], correctIndex: 1 },
      { q: 'Mercury has very hot days and very cold nights because…', options: ['It is far away', 'It has almost no atmosphere to hold heat', 'It is always dark', 'It has oceans'], correctIndex: 1 },
    ],
  },
  {
    id: 'venus', name: 'Venus', emoji: '♀️', order: 1,
    guideLine: 'Thick clouds and the hottest surface!',
    questions: [
      { q: "Venus is often called Earth's ______ because of similar size.", options: ['Twin', 'Moon', 'Star', 'Comet'], correctIndex: 0 },
      { q: 'What covers Venus and traps heat?', options: ['Oceans', 'Thick clouds', 'Snow', 'Desert only'], correctIndex: 1 },
    ],
  },
  {
    id: 'earth', name: 'Earth', emoji: '🌍', order: 2,
    guideLine: 'Our home — water, air, and life!',
    questions: [
      { q: 'Earth is special because it has liquid ______ and supports life.', options: ['Iron', 'Water', 'Lava only', 'Gold'], correctIndex: 1 },
      { q: "Earth's atmosphere has oxygen mainly because of…", options: ['Rocks', 'Plants and life', 'The Moon', 'Saturn rings'], correctIndex: 1 },
      { q: "Most of Earth's surface is covered by…", options: ['Ice', 'Oceans', 'Deserts only', 'Forest only'], correctIndex: 1 },
    ],
  },
  {
    id: 'mars', name: 'Mars', emoji: '♂️', order: 3,
    guideLine: 'The Red Planet — dust and rusty rocks!',
    questions: [
      { q: 'Mars looks red mainly because of ______ on its surface.', options: ['Ice', 'Iron rust / dust', 'Trees', 'Gold dust'], correctIndex: 1 },
      { q: 'Mars has the largest ______ in the solar system.', options: ['Ocean', 'Volcano (Olympus Mons)', 'Ring system', 'Moon'], correctIndex: 1 },
    ],
  },
  {
    id: 'jupiter', name: 'Jupiter', emoji: '♃', order: 4,
    guideLine: 'The biggest planet — a gas giant!',
    questions: [
      { q: 'Jupiter is mostly made of…', options: ['Rock and metal', 'Hydrogen and helium (gas)', 'Ice only', 'Water only'], correctIndex: 1 },
      { q: 'The Great Red Spot on Jupiter is a huge…', options: ['Lake', 'Storm', 'Mountain', 'Moon'], correctIndex: 1 },
      { q: 'Jupiter is the ______ planet from the Sun in our list so far.', options: ['Smallest', 'Largest', 'Coldest', 'Slowest'], correctIndex: 1 },
    ],
  },
  {
    id: 'saturn', name: 'Saturn', emoji: '♄', order: 5,
    guideLine: 'Famous for icy, rocky rings!',
    questions: [
      { q: 'Saturn is best known for its bright…', options: ['Oceans', 'Rings', 'Craters only', 'Green color'], correctIndex: 1 },
      { q: "Saturn's rings are mostly made of…", options: ['Fire', 'Ice and rock chunks', 'Gas only', 'Plants'], correctIndex: 1 },
    ],
  },
  {
    id: 'uranus', name: 'Uranus', emoji: '⛢', order: 6,
    guideLine: 'An ice giant that rolls on its side!',
    questions: [
      { q: 'Uranus is unusual because its rotation axis is very…', options: ['Fast', 'Tilted / on its side', 'Hot', 'Tiny'], correctIndex: 1 },
      { q: 'Uranus looks pale blue-green because of ______ in its atmosphere.', options: ['Gold', 'Methane', 'Oxygen', 'Sand'], correctIndex: 1 },
    ],
  },
  {
    id: 'neptune', name: 'Neptune', emoji: '♆', order: 7,
    guideLine: 'Windy, cold, and far from the Sun!',
    questions: [
      { q: 'Neptune is known for very strong…', options: ['Forests', 'Winds and storms', 'Oceans of lava', 'Rings only'], correctIndex: 1 },
      { q: 'Neptune is an ______ giant like Uranus.', options: ['Ice', 'Lava', 'Metal', 'Desert'], correctIndex: 0 },
    ],
  },
];
