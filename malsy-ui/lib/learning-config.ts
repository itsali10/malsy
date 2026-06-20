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
    kind: 'linear',
    title: 'English',
    icon: '📖',
    color: 'var(--sky)',
    lessons: [
      { id: 1, name: 'Grammar Foundations',    description: 'Parts of speech, sentence basics, and punctuation.' },
      { id: 2, name: 'Sentence Structure',      description: 'Simple, compound, and complex sentence building.' },
      { id: 3, name: 'Vocabulary Growth',       description: 'Context clues, synonyms, and antonyms.' },
      { id: 4, name: 'Reading Comprehension',   description: 'Main idea, supporting details, and inference.' },
      { id: 5, name: 'Writing Paragraphs',      description: 'Topic sentences, cohesion, and transitions.' },
      { id: 6, name: 'Narrative Writing',       description: 'Story sequence, characters, and setting.' },
      { id: 7, name: 'Informative Writing',     description: 'Explaining ideas with clear evidence.' },
      { id: 8, name: 'Public Speaking',         description: 'Presenting ideas clearly and confidently.' },
      { id: 9, name: 'Final English Review',    description: 'Revision practice and readiness check.' },
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
        key: 'history',
        title: 'History',
        icon: '🏛️',
        lessons: [
          { id: 1, name: 'Ancient Civilizations',       description: 'Early societies and how they developed.' },
          { id: 2, name: 'Important Historical Events',  description: 'Events that changed the world.' },
          { id: 3, name: 'Leaders and Reformers',        description: 'People who shaped modern society.' },
          { id: 4, name: 'Local and National History',   description: 'Connecting history to present-day life.' },
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
