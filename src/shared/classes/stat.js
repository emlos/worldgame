/**
 * A numeric stat with additive and multiplicative modifiers.
 *
 * final = (base + sum(add)) * product(mult)
 */
export class Stat {
  constructor(base = 0) {
    this._base = base;
    this._add = [];   // array<number>
    this._mult = [];  // array<number> (e.g., 1.1 for +10%)
  }
  get base() { return this._base; }
  set base(v) { this._base = Number(v) || 0; }
  addFlat(v) { this._add.push(Number(v) || 0); return this; }
  addMult(factor) { this._mult.push(Number(factor) || 1); return this; }
  clearModifiers() { this._add = []; this._mult = []; }
  /** Computed value with current modifiers. */
  get value() {
    const sumAdd = this._add.reduce((a, b) => a + b, 0);
    const prodMul = this._mult.reduce((a, b) => a * b, 1);
    return (this._base + sumAdd) * prodMul;
  }
}