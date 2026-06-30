export interface Lesson {
  id: number;
  name: string;
  description: string;
}

export interface Section {
  key: string;
  title: string;
  icon: string;
  lessons: Lesson[];
}

export interface LinearSubject {
  kind: 'linear';
  title: string;
  icon: string;
  color: string;
  lessons: Lesson[];
}

export interface SectionsSubject {
  kind: 'sections';
  title: string;
  icon: string;
  color: string;
  sections: Section[];
}

export type SubjectConfig = LinearSubject | SectionsSubject;

export const learningConfig: Record<string, SubjectConfig> = {
  english: {
    kind: 'sections',
    title: 'English',
    icon: '📖',
    color: 'var(--sky)',
    sections: [
      {
        key: 'english_speaking',
        title: 'Pronunciation',
        icon: '🎤',
        lessons: [
          { id: 1, name: 'Pronunciation Practice', description: 'Phonemes, stress patterns, and spoken fluency.' },
        ],
      },
      {
        key: 'english_grammar',
        title: 'Grammar',
        icon: '✏️',
        lessons: [
          { id: 1, name: 'Grammar Foundations',  description: 'Parts of speech, sentence basics, and punctuation.' },
          { id: 2, name: 'Sentence Structure',   description: 'Simple, compound, and complex sentence building.' },
          { id: 3, name: 'Vocabulary Growth',    description: 'Context clues, synonyms, and antonyms.' },
          { id: 4, name: 'Writing Paragraphs',   description: 'Topic sentences, cohesion, and transitions.' },
        ],
      },
      {
        key: 'english_comprehension',
        title: 'Comprehension',
        icon: '📚',
        lessons: [
          { id: 1, name: 'Reading Comprehension', description: 'Main idea, supporting details, and inference.' },
          { id: 2, name: 'Narrative Writing',     description: 'Story sequence, characters, and setting.' },
          { id: 3, name: 'Informative Writing',   description: 'Explaining ideas with clear evidence.' },
          { id: 4, name: 'Final English Review',  description: 'Revision practice and readiness check.' },
        ],
      },
    ],
  },
  science: {
    kind: 'linear',
    title: 'Science',
    icon: '🔬',
    color: 'var(--mint)',
    lessons: [
      { id: 1, name: 'Scientific Method',       description: 'Questions, hypotheses, and controlled experiments.' },
      { id: 2, name: 'States of Matter',        description: 'Solids, liquids, gases, and particle motion.' },
      { id: 3, name: 'Atoms and Elements',      description: 'Atomic structure and periodic table basics.' },
      { id: 4, name: 'Compounds and Mixtures',  description: 'How materials combine and separate.' },
      { id: 5, name: 'Chemical Reactions',      description: 'Signs of reaction and equation basics.' },
      { id: 6, name: 'Acids and Bases',         description: 'pH scale, indicators, and safety.' },
      { id: 7, name: 'Energy and Heat',         description: 'Exothermic and endothermic changes.' },
      { id: 8, name: 'Lab Safety Mastery',      description: 'Safety procedures before advanced labs.' },
      { id: 9, name: 'Science Review',          description: 'Full review before practical assessment.' },
    ],
  },
  history: {
    kind: 'sections',
    title: 'Social Studies',
    icon: '🏛️',
    color: 'var(--amber)',
    sections: [
      {
        key: 'history_g6',
        title: 'History',
        icon: '🏛️',
        lessons: [
          { id: 1, name: 'Where and Who Were the Ancient Egyptians?',     description: 'Location of Egypt, the Nile, settlement, Upper and Lower Egypt, and unification.' },
          { id: 2, name: 'Religion and Gods of Ancient Egypt',            description: 'Egyptian gods, animal-headed deities, and what each god represented.' },
          { id: 3, name: 'Egyptian Society and the Pharaohs',             description: 'Social hierarchy, pharaohs, pyramids, Valley of the Kings, and Tutankhamun.' },
          { id: 4, name: 'Mummification and the Afterlife',               description: 'Why bodies were preserved, the 70-day process, and afterlife beliefs.' },
          { id: 5, name: 'Fashion and Daily Life in Ancient Egypt',       description: 'Clothing, linen, jewellery, makeup, and daily dress in Ancient Egypt.' },
          { id: 6, name: 'Hieroglyphics and Ancient Writing',             description: 'Picture writing, scribes, papyrus, and the Rosetta Stone.' },
        ],
      },
      {
        key: 'geography',
        title: 'Geography',
        icon: '🗺️',
        lessons: [
          { id: 1, name: 'Maps and Coordinates',   description: 'Map reading, scale, and coordinates.' },
          { id: 2, name: 'Physical Geography',     description: 'Landforms, water systems, and climate.' },
          { id: 3, name: 'Human Geography',        description: 'Population, culture, and settlements.' },
          { id: 4, name: 'Regions of the World',   description: 'Comparing regions, resources, and lifestyles.' },
        ],
      },
    ],
  },
  math: {
    kind: 'linear',
    title: 'Mathematics',
    icon: '🧮',
    color: 'var(--vl)',
    lessons: [
      { id: 1, name: 'Numbers & Operations',        description: 'Fractions, decimals, and integers.' },
      { id: 2, name: 'Algebra Foundations',         description: 'Equations, inequalities, and functions.' },
      { id: 3, name: 'Geometry',                    description: 'Shapes, angles, and measurement.' },
      { id: 4, name: 'Statistics & Probability',    description: 'Data, graphs, and chance.' },
      { id: 5, name: 'Problem Solving',             description: 'Applied maths and word problems.' },
    ],
  },
};

/** Find the lessons array that a chapter's book key belongs to. */
function lessonsForBookKey(bookKey: string): Lesson[] | null {
  for (const cfg of Object.values(learningConfig)) {
    if (cfg.kind === 'sections') {
      const sec = cfg.sections.find(s => s.key === bookKey);
      if (sec) return sec.lessons;
    }
  }
  const direct = learningConfig[bookKey];
  if (direct && direct.kind === 'linear') return direct.lessons;
  return null;
}

/**
 * Given a chapter id like `history_g6:unit_01`, return the next lesson in the
 * same section (chapter id + title + description), or null if it's the last one.
 */
export function nextLessonFromChapter(
  chapter: string,
): { chapter: string; title: string; description: string } | null {
  const [bookKey, unitPart] = chapter.split(':');
  if (!bookKey || !unitPart) return null;
  const m = unitPart.match(/unit_(\d+)/i);
  if (!m) return null;
  const currentId = parseInt(m[1], 10);

  const lessons = lessonsForBookKey(bookKey);
  if (!lessons) return null;

  const next = lessons.find(l => l.id === currentId + 1);
  if (!next) return null;

  return {
    chapter: `${bookKey}:unit_${String(next.id).padStart(2, '0')}`,
    title: next.name,
    description: next.description,
  };
}

/** Resolve /lessons/subject/{key} from a chapter id like history_g6:unit_01 */
export function subjectPathFromChapter(chapter: string): string {
  const bookKey = (chapter.split(':')[0] ?? '').toLowerCase();
  if (!bookKey) return '/lessons';

  for (const [subjectKey, cfg] of Object.entries(learningConfig)) {
    if (cfg.kind === 'sections') {
      if (cfg.sections.some(s => bookKey === s.key || bookKey.startsWith(s.key))) {
        return `/lessons/subject/${subjectKey}`;
      }
    }
    if (bookKey === subjectKey || bookKey.startsWith(`${subjectKey}_`)) {
      return `/lessons/subject/${subjectKey}`;
    }
  }

  const fallback = bookKey.split('_')[0];
  if (fallback && learningConfig[fallback]) {
    return `/lessons/subject/${fallback}`;
  }
  return '/lessons';
}
