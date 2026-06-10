export function toLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfLocalDayIso(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toISOString();
}

export function endOfLocalDayIso(dateKey: string): string {
  return new Date(`${dateKey}T23:59:59.999`).toISOString();
}

export function formatChineseDate(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function recentDateKeys(days: number): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return toLocalDateKey(date);
  });
}
