/** Time-of-day greeting for the student shell. */
export function getTimeGreeting(firstName?: string | null): string {
  const hour = new Date().getHours();
  const period =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = firstName?.trim();
  return name ? `${period}, ${name}` : period;
}
