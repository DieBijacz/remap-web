const HIGHSCORE_KEY = 'remap:highscores';
const MAX_ENTRIES = 10;
const DEFAULT_NAME = 'PLAYER';

export type HighscoreEntry = {
  name: string;
  score: number;
};

const sanitizeName = (name: string): string => {
  const normalized = (name ?? '').toString().toUpperCase();
  const filtered = normalized.replace(/[^A-Z0-9 ]+/g, '');
  const trimmed = filtered.trim();
  const truncated = trimmed.slice(0, 10);
  return truncated.length > 0 ? truncated : DEFAULT_NAME;
};

const isEntry = (value: unknown): value is HighscoreEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as HighscoreEntry).name === 'string' &&
  typeof (value as HighscoreEntry).score === 'number' &&
  Number.isFinite((value as HighscoreEntry).score);

export default class HighscoreStore {
  private findInsertIndex(list: HighscoreEntry[], score: number) {
    for (let i = 0; i < list.length; i += 1) {
      if (score >= list[i].score) {
        return i;
      }
    }
    return list.length;
  }

  private persist(list: HighscoreEntry[]) {
    localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  }

  list(): HighscoreEntry[] {
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      let needsPersist = false;
      const entries: HighscoreEntry[] = parsed
        .map((value) => {
          if (isEntry(value)) {
            const sanitized = sanitizeName(value.name);
            if (sanitized !== value.name) {
              needsPersist = true;
            }
            return { name: sanitized, score: Number(value.score) };
          }
          if (typeof value === 'number' && Number.isFinite(value)) {
            needsPersist = true;
            return { name: DEFAULT_NAME, score: value };
          }
          needsPersist = true;
          return null;
        })
        .filter((entry): entry is HighscoreEntry => !!entry);
      const sorted = entries.sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
      if (needsPersist || sorted.length !== entries.length) {
        this.persist(sorted);
      }
      return sorted;
    } catch (e) {
      return [];
    }
  }

  placementForScore(score: number): number {
    if (!Number.isFinite(score) || score <= 0) return Number.POSITIVE_INFINITY;
    const list = this.list();
    const index = this.findInsertIndex(list, score);
    if (index < MAX_ENTRIES) return index;
    if (list.length < MAX_ENTRIES) return list.length;
    return Number.POSITIVE_INFINITY;
  }

  save(entry: HighscoreEntry): number {
    const score = Number(entry.score);
    if (!Number.isFinite(score) || score <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    const list = this.list();
    const insertIndex = this.findInsertIndex(list, score);
    const sanitizedEntry: HighscoreEntry = {
      name: sanitizeName(entry.name),
      score
    };
    list.splice(insertIndex, 0, sanitizedEntry);
    const trimmed = list.slice(0, MAX_ENTRIES);
    this.persist(trimmed);
    const placement = trimmed.indexOf(sanitizedEntry);
    if (placement !== -1) {
      return placement;
    }
    return trimmed.findIndex(
      (item) => item.score === sanitizedEntry.score && item.name === sanitizedEntry.name
    );
  }

  clear() {
    localStorage.removeItem(HIGHSCORE_KEY);
  }
}
