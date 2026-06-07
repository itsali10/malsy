export interface Lesson {
  id: number;
  name: string;
  description: string;
  readingExercises?: string[];
}

export interface Section {
  key: string;
  title: string;
  lessons: Lesson[];
}

export const learningConfig = {
  english: {
    title: 'English',
    lessons: [
      {
        id: 1, name: 'Grammar Foundations', description: 'Parts of speech, sentence basics, and punctuation.',
        readingExercises: [
          'The cat sits on the mat.',
          'I like pencils and erasers.',
          'She has a big red ball.',
          'The dog runs fast in the park.',
          'My name is and I love school.',
        ],
      },
      {
        id: 2, name: 'Sentence Structure', description: 'Simple, compound, and complex sentence building.',
        readingExercises: [
          'The sun is bright and the sky is blue.',
          'I went to the store and I bought some milk.',
          'She likes to read books because they are fun.',
          'The bird sang a song while sitting on the tree.',
          'We played soccer after school yesterday.',
        ],
      },
      {
        id: 3, name: 'Vocabulary Growth', description: 'Context clues, synonyms, and antonyms.',
        readingExercises: [
          'The enormous elephant walked slowly through the jungle.',
          'She felt very happy and cheerful all day long.',
          'The brave knight defeated the fierce dragon.',
          'The tiny ant carried a huge piece of bread.',
          'It was a beautiful and peaceful morning outside.',
        ],
      },
      {
        id: 4, name: 'Reading Comprehension', description: 'Main idea, supporting details, and inference.',
        readingExercises: [
          'The farmer woke up early to water his plants.',
          'Rain falls from clouds when the weather is cold.',
          'Children learn best when they feel safe and happy.',
          'Books are a great way to explore new ideas.',
          'The library is a quiet place full of knowledge.',
        ],
      },
      {
        id: 5, name: 'Writing Paragraphs', description: 'Topic sentences, cohesion, and transitions.',
        readingExercises: [
          'First I brush my teeth then I wash my face.',
          'In addition the team practiced every single day.',
          'Finally the students completed their science project.',
          'However the weather changed suddenly in the afternoon.',
          'As a result everyone learned something new and important.',
        ],
      },
      {
        id: 6, name: 'Narrative Writing', description: 'Story sequence, characters, and setting.',
        readingExercises: [
          'Once upon a time a young girl found a magic lamp.',
          'The hero journeyed across the mountains to find the treasure.',
          'At the beginning of the story the children were lost.',
          'She opened the door and found a hidden secret garden.',
          'In the end everyone lived happily ever after together.',
        ],
      },
      {
        id: 7, name: 'Informative Writing', description: 'Explaining ideas with clear evidence.',
        readingExercises: [
          'Bees are very important because they help plants grow.',
          'Water covers more than seventy percent of the Earth.',
          'Exercise helps the body stay strong and healthy.',
          'The sun is a star located at the center of our solar system.',
          'Recycling helps protect the environment for future generations.',
        ],
      },
      {
        id: 8, name: 'Public Speaking', description: 'Presenting ideas clearly and confidently.',
        readingExercises: [
          'Good morning everyone today I will talk about teamwork.',
          'My topic is the importance of reading every single day.',
          'In conclusion we should always be kind to each other.',
          'I believe that every student can achieve great things.',
          'Thank you for listening to my presentation today.',
        ],
      },
      {
        id: 9, name: 'Final English Review', description: 'Revision practice and readiness check.',
        readingExercises: [
          'Learning English helps us communicate with people around the world.',
          'Practice makes perfect when it comes to reading and writing.',
          'Every lesson taught us something valuable and interesting.',
          'Good grammar helps us express our ideas clearly and correctly.',
          'We are proud of how much we have learned this year.',
        ],
      },
    ] as Lesson[],
  },
  science: {
    title: 'Science',
    lessons: [
      { id: 1, name: 'Scientific Method', description: 'Questions, hypotheses, and controlled experiments.' },
      { id: 2, name: 'States of Matter', description: 'Solids, liquids, gases, and particle motion.' },
      { id: 3, name: 'Atoms and Elements', description: 'Atomic structure and periodic table basics.' },
      { id: 4, name: 'Compounds and Mixtures', description: 'How materials combine and separate.' },
      { id: 5, name: 'Chemical Reactions', description: 'Signs of reaction and equation basics.' },
      { id: 6, name: 'Acids and Bases', description: 'pH scale, indicators, and safety.' },
      { id: 7, name: 'Energy and Heat', description: 'Exothermic and endothermic changes.' },
      { id: 8, name: 'Lab Safety Mastery', description: 'Safety procedures before advanced labs.' },
      { id: 9, name: 'Science Review', description: 'Full review before practical assessment.' },
    ] as Lesson[],
    chemistryLab: {
      title: 'Chemistry Lab',
      description: 'This reserved block is ready for your Unity chemistry lab upload.',
    },
  },
  socialStudies: {
    title: 'Social Studies',
    sections: [
      {
        key: 'history',
        title: 'History',
        lessons: [
          { id: 1, name: 'Ancient Civilizations', description: 'Early societies and how they developed.' },
          { id: 2, name: 'Important Historical Events', description: 'Events that changed the world.' },
          { id: 3, name: 'Leaders and Reformers', description: 'People who shaped modern society.' },
          { id: 4, name: 'Local and National History', description: 'Connecting history to present-day life.' },
        ],
      },
      {
        key: 'geography',
        title: 'Geography',
        lessons: [
          { id: 1, name: 'Maps and Coordinates', description: 'Map reading, scale, and coordinates.' },
          { id: 2, name: 'Physical Geography', description: 'Landforms, water systems, and climate.' },
          { id: 3, name: 'Human Geography', description: 'Population, culture, and settlements.' },
          { id: 4, name: 'Regions of the World', description: 'Comparing regions, resources, and lifestyles.' },
        ],
      },
    ] as Section[],
    videoSlotsPerSection: 3,
  },
} as const;
