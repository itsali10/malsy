/**
 * Space-themed Hangman entries: word (A–Z only) + short hint (category or clue).
 * Each tier is harder (longer / rarer letters).
 */

/** @typedef {{ word: string, hint: string }} HangmanEntry */

/** @type {HangmanEntry[][]} */
export const HANGMAN_TIERS = [
  [
    { word: "SUN", hint: "Star — center of our solar system" },
    { word: "MARS", hint: "Planet — often called the red planet" },
    { word: "MOON", hint: "Natural satellite of Earth" },
    { word: "STAR", hint: "Huge ball of gas that shines in space" },
    { word: "COMET", hint: "Icy visitor with a glowing tail" },
    { word: "ORBIT", hint: "Path something takes around a planet or star" },
    { word: "SPACE", hint: "Everything beyond Earth’s sky" },
    { word: "SOLAR", hint: "Word meaning “of the Sun”" },
  ],
  [
    { word: "VENUS", hint: "Planet — second from the Sun, very hot" },
    { word: "PLUTO", hint: "Dwarf planet — once called the ninth planet" },
    { word: "LUNAR", hint: "Word meaning “of the Moon”" },
    { word: "METEOR", hint: "“Shooting star” — space rock burning in the sky" },
    { word: "ROCKET", hint: "Vehicle that blasts off into space" },
    { word: "GALAXY", hint: "Huge family of billions of stars" },
    { word: "COSMIC", hint: "Word meaning “of the universe”" },
    { word: "NEBULA", hint: "Cloud of gas and dust where stars can form" },
  ],
  [
    { word: "JUPITER", hint: "Planet — largest in our solar system" },
    { word: "NEPTUNE", hint: "Planet — deep blue ice giant" },
    { word: "SATURN", hint: "Planet — famous for icy rings" },
    { word: "URANUS", hint: "Planet — ice giant that rolls on its side" },
    { word: "MERCURY", hint: "Planet — smallest and closest to the Sun" },
    { word: "PULSAR", hint: "Spinning dead star that beams radio pulses" },
    { word: "QUASAR", hint: "Distant object — super-bright galaxy core" },
    { word: "GRAVITY", hint: "Force that pulls masses together" },
  ],
  [
    { word: "ASTRONAUT", hint: "Person trained to travel in space" },
    { word: "TELESCOPE", hint: "Instrument that collects light from distant objects" },
    { word: "SATELLITE", hint: "Natural or human-made object in orbit" },
    { word: "ASTEROID", hint: "Rocky body orbiting the Sun — many live in a belt" },
    { word: "ECLIPSE", hint: "When one body passes in front of another and blocks light" },
    { word: "COSMONAUT", hint: "Russian term for a space traveler" },
    { word: "STELLAR", hint: "Word meaning “of the stars”" },
  ],
  [
    { word: "EXOPLANET", hint: "Planet that orbits a star outside our solar system" },
    { word: "SUPERNOVA", hint: "Massive explosion at the end of a huge star’s life" },
    { word: "LIGHTYEAR", hint: "Distance light travels in one year" },
    { word: "CLUSTER", hint: "Group of galaxies held together by gravity" },
    { word: "ORBITAL", hint: "Related to moving around another body" },
    { word: "INTERSTELLAR", hint: "Between the stars — not just one star system" },
  ],
  [
    { word: "EXTRAGALACTIC", hint: "Outside the Milky Way galaxy" },
    { word: "CONSTELLATION", hint: "Named pattern of stars in the sky" },
    { word: "INTERPLANETARY", hint: "Between planets — e.g. dust and probes" },
    { word: "MICROGRAVITY", hint: "Very weak gravity — what astronauts “float” in" },
    { word: "HELIOCENTRIC", hint: "Model with the Sun at the center" },
  ],
];

/** Fewer wrong guesses allowed as tiers get harder. */
export const MAX_WRONG_BY_TIER = [8, 7, 7, 6, 6, 5];

export const HANGMAN_TIER_COUNT = HANGMAN_TIERS.length;

export function getTierIndexForLevel(level) {
  const lv = Math.max(1, Number(level) || 1);
  return Math.min(lv - 1, HANGMAN_TIERS.length - 1);
}

/**
 * Random entry from tier. Avoids repeating `avoidWord` when the pool allows.
 * @returns {HangmanEntry}
 */
export function pickRandomWord(tierIndex, avoidWord = null) {
  const t = Math.max(0, Math.min(tierIndex, HANGMAN_TIERS.length - 1));
  const pool = HANGMAN_TIERS[t];
  const candidates = pool.filter((e) => e.word !== avoidWord || pool.length === 1);
  return candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
}

export function maxWrongForTier(tierIndex) {
  const ti = Math.max(0, Math.min(tierIndex, MAX_WRONG_BY_TIER.length - 1));
  return MAX_WRONG_BY_TIER[ti];
}
