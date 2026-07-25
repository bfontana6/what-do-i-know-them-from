export function extractTitles(rawTitle: string): string[] {
  const titles: string[] = [rawTitle];
  const match = rawTitle.match(/^(.+?):\s*Season\s+\d/i);
  if (match) titles.push(match[1].trim());
  return titles;
}
