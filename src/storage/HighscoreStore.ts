const HIGHSCORE_KEY = 'remap:highscores';

export default class HighscoreStore {
  save(score: number) {
    const list = this.list();
    list.push(score);
    list.sort((a, b) => b - a);
    const trimmed = list.slice(0, 10);
    localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(trimmed));
  }

  list(): number[] {
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as number[];
    } catch (e) {
      return [];
    }
  }
}
