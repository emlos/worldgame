/**
 * A numeric stat with additive and multiplicative modifiers.
 *
 * final = (base + sum(add)) * product(mult)
 */

import { finiteNumber } from "../util/util.js";

export class Stat {
  constructor(base = 0) {
    this._base = finiteNumber(base, "Stat base");
    this._add = [];   // array<number>
    this._mult = [];  // array<number> (e.g., 1.1 for +10%)
  }
  get base() { return this._base; }
  set base(v) { this._base = finiteNumber(v, "Stat base"); }
  addFlat(v) { this._add.push(finiteNumber(v, "Stat additive modifier")); return this; }
  addMult(factor) { this._mult.push(finiteNumber(factor, "Stat multiplier")); return this; }
  clearModifiers() { this._add = []; this._mult = []; }
  /** Return a detached copy, preserving base and every stored modifier. */
  clone() {
    const stat = new Stat(this._base);
    stat._add = this._add.slice();
    stat._mult = this._mult.slice();
    return stat;
  }
  /** Computed value with current modifiers. */
  get value() {
    const sumAdd = this._add.reduce((a, b) => a + b, 0);
    const prodMul = this._mult.reduce((a, b) => a * b, 1);
    return (this._base + sumAdd) * prodMul;
  }

  toJSON() {
    return {
      base: this._base,
      add: this._add.slice(),
      mult: this._mult.slice(),
    };
  }

  static fromJSON(data) {
    if (data instanceof Stat) return data;
    if (typeof data === "number") return new Stat(data);

    const stat = new Stat(data?.base ?? 0);
    const add = data?.add;
    const mult = data?.mult;
    stat._add = Array.isArray(add)
      ? add.map((v) => finiteNumber(v, "Stat additive modifier"))
      : [];
    stat._mult = Array.isArray(mult)
      ? mult.map((v) => finiteNumber(v, "Stat multiplier"))
      : [];
    return stat;
  }
}
