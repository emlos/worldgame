export class WorldTime {
  constructor({ startDate = new Date(), rnd }) {
    this.date = new Date(startDate.getTime()); // includes time
    this.rnd = rnd;
  }
  /** advance minutes, return number of day rollovers */
  advanceMinutes(mins) {
    const beforeDay = this.date.getDate();
    this.date = new Date(this.date.getTime() + mins * 60 * 1000);
    const afterDay = this.date.getDate();
    // naive: counts cross‑month properly by diffing dates via time delta
    const diffDays = Math.floor((this.date - new Date(this.date.getFullYear(), this.date.getMonth(), this.date.getDate())) / (24 * 60 * 60 * 1000));
    // simpler: recompute by midnight crossings
    return this.date.toDateString() !== new Date(this.date.getTime() - mins * 60 * 1000).toDateString() ? 1 : 0;
  }
}


export const MS_PER_DAY = 24 * 60 * 60 * 1000;