export class ScoreSystem {
  constructor() {
    this.points = 0;
  }
  addQuizCorrect() {
    this.points++;
  }
  addGameComplete() {
    this.points++;
  }
  get total() {
    return this.points;
  }
  reset() {
    this.points = 0;
  }
}
