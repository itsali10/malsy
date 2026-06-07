'use client';

import { getProgressPercent } from './progress';
import type { Student } from './database';

const STORAGE_KEY = 'malsy_achievements';

export interface BadgeDef {
  id: string;
  icon: string;
  title: string;
  description: string;
  condition: (student: Student, studentId?: string) => boolean;
}

function getVisitDays(studentId: string): string[] {
  return getRaw()[studentId]?.visitDays || [];
}

export const BADGE_DEFINITIONS: BadgeDef[] = [
  { id: 'first_login', icon: '🌟', title: 'Welcome Star', description: 'Logged in for the first time.', condition: () => true },
  {
    id: 'first_lesson', icon: '📖', title: 'First Step', description: 'Completed your very first lesson.',
    condition: (s) => s.progress.english.lessonsCompleted > 0 || s.progress.science.lessonsCompleted > 0 || s.progress.socialStudies.lessonsCompleted > 0,
  },
  { id: 'english_25', icon: '📚', title: 'Word Explorer', description: 'Reached 25% in English.', condition: (s) => getProgressPercent(s, 'english') >= 25 },
  { id: 'english_complete', icon: '🏆', title: 'English Champion', description: 'Completed all English lessons!', condition: (s) => getProgressPercent(s, 'english') >= 100 },
  { id: 'science_25', icon: '🔬', title: 'Junior Scientist', description: 'Reached 25% in Science.', condition: (s) => getProgressPercent(s, 'science') >= 25 },
  { id: 'science_complete', icon: '⚗️', title: 'Science Master', description: 'Completed all Science lessons!', condition: (s) => getProgressPercent(s, 'science') >= 100 },
  { id: 'chemistry_lab', icon: '🧪', title: 'Lab Explorer', description: 'Visited the Chemistry Lab.', condition: (s) => s.progress.science.chemistryLabVisited === true },
  { id: 'social_25', icon: '🌍', title: 'World Traveler', description: 'Reached 25% in Social Studies.', condition: (s) => getProgressPercent(s, 'socialStudies') >= 25 },
  { id: 'social_complete', icon: '🗺️', title: 'Social Scholar', description: 'Completed all Social Studies lessons!', condition: (s) => getProgressPercent(s, 'socialStudies') >= 100 },
  {
    id: 'all_subjects_started', icon: '🎯', title: 'All Rounder', description: 'Started lessons in all 3 subjects.',
    condition: (s) => s.progress.english.lessonsCompleted > 0 && s.progress.science.lessonsCompleted > 0 && s.progress.socialStudies.lessonsCompleted > 0,
  },
  { id: 'game_player', icon: '🎮', title: 'Game On!', description: 'Played an educational game.', condition: (s) => s.games.hangman.gamesPlayed > 0 || s.games.spellingBee.gamesPlayed > 0 },
  { id: 'five_streak', icon: '🔥', title: '5-Day Streak', description: 'Visited 5 different days.', condition: (_s, id) => getVisitDays(id || '').length >= 5 },
];

interface AchievementData {
  earned: string[];
  visitDays: string[];
}

function getRaw(): Record<string, AchievementData> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveRaw(data: Record<string, AchievementData>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recordVisit(studentId: string): void {
  const all = getRaw();
  if (!all[studentId]) all[studentId] = { earned: [], visitDays: [] };
  const today = todayString();
  if (!all[studentId].visitDays.includes(today)) all[studentId].visitDays.push(today);
  saveRaw(all);
}

export function getWeeklyActivity(studentId: string): { date: string; active: boolean }[] {
  const visitDays = getVisitDays(studentId);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const str = d.toISOString().slice(0, 10);
    return { date: str, active: visitDays.includes(str) };
  });
}

export function checkAndUnlock(student: Student): BadgeDef[] {
  const all = getRaw();
  if (!all[student.id]) all[student.id] = { earned: [], visitDays: [] };

  const earned = all[student.id].earned;
  const newlyUnlocked: BadgeDef[] = [];

  BADGE_DEFINITIONS.forEach((def) => {
    if (earned.includes(def.id)) return;
    try {
      if (def.condition(student, student.id)) {
        earned.push(def.id);
        newlyUnlocked.push(def);
      }
    } catch { /* skip */ }
  });

  all[student.id].earned = earned;
  saveRaw(all);
  return newlyUnlocked;
}

export function getEarned(studentId: string): BadgeDef[] {
  const earnedIds = getRaw()[studentId]?.earned || [];
  return BADGE_DEFINITIONS.filter((d) => earnedIds.includes(d.id));
}

export function getAll(): BadgeDef[] {
  return BADGE_DEFINITIONS;
}
