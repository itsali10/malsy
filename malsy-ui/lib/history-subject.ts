/** True when lesson video generation applies (History workflow only). */
export function isHistorySubject(input: {
  type?: string | null;
  name?: string | null;
  subjectKey?: string | null;
  chapterId?: string | null;
}): boolean {
  const type = (input.type ?? '').trim().toLowerCase();
  if (type === 'history') return true;

  const name = (input.name ?? '').trim();
  if (/history/i.test(name)) return true;

  const key = (input.subjectKey ?? input.chapterId ?? '').trim().toLowerCase();
  return key.includes('history');
}
