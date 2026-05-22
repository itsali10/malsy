/**
 * Space School lesson structure:
 * 1) Intro — all of space + all 8 planets (overview video)
 * 2–5) Two planets per video + quiz (4 pairs × 2 questions)
 * 6) Finale
 *
 * videoUrl: set to /space-media/intro.mp4 etc. after Sora export, or null = demo clip for testing.
 */
/** Browser-only test clip when no Sora file is set — NOT your lesson (obvious placeholder). */
export const DEMO_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";

export function resolveVideoUrl(url) {
  if (url && String(url).trim()) return url;
  return DEMO_VIDEO_URL;
}

/** True when we’re playing the generic web demo, not `/api/video/space_*.mp4` Sora exports. */
export function isDemoFallbackUrl(url) {
  const u = String(url || "");
  return u === DEMO_VIDEO_URL || u.includes("w3schools.com/html/mov_bbb");
}

export const SCENES = [
  {
    id: 1,
    key: "intro",
    title: "Our solar system",
    guideText: "Watch the intro, then go to each planet pair and quiz.",
    videoUrl: null,
    interaction: null,
  },
  {
    id: 2,
    key: "pair_mercury_venus",
    title: "Mercury & Venus",
    guideText: "The inner rocky worlds — then answer 2 questions.",
    videoUrl: null,
    interaction: {
      type: "quiz",
      questions: [
        {
          q: "Which planet is closest to the Sun?",
          options: ["Mercury", "Venus", "Earth", "Mars"],
          correctIndex: 0,
          hint: "Think smallest orbit!",
        },
        {
          q: "Venus is known for thick clouds and extreme ______.",
          options: ["Cold", "Heat", "Ice", "Calm weather"],
          correctIndex: 1,
          hint: "It is hotter than Earth!",
        },
      ],
    },
  },
  {
    id: 3,
    key: "pair_earth_mars",
    title: "Earth & Mars",
    guideText: "Home and the red neighbor — quiz time.",
    videoUrl: null,
    interaction: {
      type: "quiz",
      questions: [
        {
          q: "Which planet has liquid water oceans and life as we know it?",
          options: ["Mars", "Earth", "Venus", "Jupiter"],
          correctIndex: 1,
          hint: "You live here!",
        },
        {
          q: "Mars looks red because of ______ on its surface.",
          options: ["Ice", "Iron rust / dust", "Trees", "Gold"],
          correctIndex: 1,
          hint: "Rusty color!",
        },
      ],
    },
  },
  {
    id: 4,
    key: "pair_jupiter_saturn",
    title: "Jupiter & Saturn",
    guideText: "Gas giants and rings — 2 questions.",
    videoUrl: null,
    interaction: {
      type: "quiz",
      questions: [
        {
          q: "Which planet is the largest in our solar system?",
          options: ["Saturn", "Jupiter", "Neptune", "Earth"],
          correctIndex: 1,
          hint: "Great Red Spot!",
        },
        {
          q: "Saturn is famous for its bright ______.",
          options: ["Oceans", "Rings", "Craters", "Polar ice caps"],
          correctIndex: 1,
          hint: "Beautiful bands around the planet!",
        },
      ],
    },
  },
  {
    id: 5,
    key: "pair_uranus_neptune",
    title: "Uranus & Neptune",
    guideText: "The ice giants at the edge — last quiz!",
    videoUrl: null,
    interaction: {
      type: "quiz",
      questions: [
        {
          q: "Uranus is unusual because its rotation axis is very ______.",
          options: ["Fast", "Tilted", "Hot", "Small"],
          correctIndex: 1,
          hint: "It rolls along its orbit!",
        },
        {
          q: "Neptune is known for strong ______ and deep blue color.",
          options: ["Forests", "Winds and storms", "Deserts", "Rings only"],
          correctIndex: 1,
          hint: "Very windy planet!",
        },
      ],
    },
  },
  {
    id: 6,
    key: "finale",
    title: "Mission complete",
    guideText: "Great work, explorer!",
    videoUrl: null,
    interaction: { type: "finale" },
  },
];

export const QUIZ_MAX_POINTS = 8;
