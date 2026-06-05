'use client';

import { getProgressPercent } from './progress';
import type { Student } from './database';

export function getWelcomeMessage(studentName: string): string {
  return `Hi ${studentName}! I am your study chatbot. Ask me about subjects, progress, or what to do next.`;
}

export function respond(userMessage: string, student: Student): string {
  const msg = userMessage.toLowerCase();

  if (containsAny(msg, ['hello', 'hi', 'hey'])) {
    return `Hello ${student.name}! What would you like to learn today?`;
  }
  if (containsAny(msg, ['progress', 'how am i doing', 'status'])) {
    const english = getProgressPercent(student, 'english');
    const science = getProgressPercent(student, 'science');
    const social = getProgressPercent(student, 'socialStudies');
    return `Your current progress is English ${english}%, Science ${science}%, and Social Studies ${social}%.`;
  }
  if (containsAny(msg, ['english'])) {
    return 'English has 9 lessons unlocked sequentially. Complete each lesson to open the next one.';
  }
  if (containsAny(msg, ['science', 'chemistry'])) {
    return 'Science has 9 lessons and a chemistry lab section. You can open the lab from the Science subject page.';
  }
  if (containsAny(msg, ['social', 'history', 'geography'])) {
    return 'Social Studies is split into History and Geography. Each section has lessons and reserved video slots.';
  }
  if (containsAny(msg, ['game', 'hangman', 'spelling'])) {
    return 'Use the Educational Games card to play Hangman and Spelling Bee.';
  }
  if (containsAny(msg, ['next', 'what should i do'])) {
    return getNextStep(student);
  }
  if (containsAny(msg, ['avatar', 'unity'])) {
    return 'The left panel is reserved for your Unity avatar build. You can embed your Unity output there.';
  }
  return 'I can help with progress, subject guidance, games, and Unity sections. Try asking: "What should I do next?"';
}

export function getNextStep(student: Student): string {
  const englishNext = nextLessonNumber(student.progress.english.completedLessons, student.progress.english.totalLessons);
  if (englishNext) return `A good next step is English Lesson ${englishNext}.`;

  const scienceNext = nextLessonNumber(student.progress.science.completedLessons, student.progress.science.totalLessons);
  if (scienceNext) return `Great progress! Continue with Science Lesson ${scienceNext}.`;

  return 'You are doing great. Continue with Social Studies lessons or review the chemistry lab.';
}

function nextLessonNumber(completedLessons: number[], totalLessons: number): number | null {
  for (let i = 1; i <= totalLessons; i++) {
    if (!completedLessons.includes(i)) return i;
  }
  return null;
}

function containsAny(message: string, terms: string[]): boolean {
  return terms.some((t) => message.includes(t));
}
