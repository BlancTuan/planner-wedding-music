export function versionsConflict(current: number, submitted: number): boolean {
  return current !== submitted;
}
