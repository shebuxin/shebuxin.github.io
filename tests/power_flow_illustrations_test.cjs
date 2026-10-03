const { test } = require('node:test');
const assert = require('node:assert/strict');
const { admittanceTerms } = require('../assets/js/power-flow-illustrations.js');

const branches = [
  { key: 'ij', a: 0, b: 1, y: [2, -3] },
  { key: 'jk', a: 1, b: 2, y: [4, -7] },
  { key: 'ik', a: 0, b: 2, y: [1, -2] },
];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const multiply = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
function numeric(connected) {
  return admittanceTerms(connected).map(row => row.map(terms => terms.reduce((value, term) => {
    const y = branches.find(branch => branch.key === term.key).y;
    return add(value, y.map(part => part * term.sign));
  }, [0, 0])));
}

test('every switch configuration obeys branch KCL for complex voltages', () => {
  const voltages = [[1, 0], [.97, -.02], [.95, -.03]];
  for (let mask = 0; mask < 8; mask++) {
    const connected = Object.fromEntries(branches.map((branch, index) => [branch.key, Boolean(mask & (1 << index))]));
    const matrix = numeric(connected);
    const byBranches = [[0, 0], [0, 0], [0, 0]];
    for (const { key, a, b, y } of branches) {
      if (!connected[key]) continue;
      const current = multiply(y, subtract(voltages[a], voltages[b]));
      byBranches[a] = add(byBranches[a], current);
      byBranches[b] = subtract(byBranches[b], current);
    }
    for (let row = 0; row < 3; row++) {
      const byMatrix = matrix[row].reduce((current, y, column) => add(current, multiply(y, voltages[column])), [0, 0]);
      for (let part = 0; part < 2; part++) assert.ok(Math.abs(byMatrix[part] - byBranches[row][part]) < 1e-12);
      assert.deepEqual(matrix[row].reduce(add, [0, 0]), [0, 0], 'unshunted Y has zero row sums');
      for (let column = 0; column < 3; column++) assert.deepEqual(matrix[row][column], matrix[column][row]);
    }
  }
});

test('opening a branch removes exactly its four stamp entries', () => {
  const closed = { ij: true, jk: true, ik: true };
  const all = numeric(closed);
  for (const { key, a, b, y } of branches) {
    const opened = numeric({ ...closed, [key]: false });
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const sign = row === column && (row === a || row === b) ? 1
          : (row === a && column === b) || (row === b && column === a) ? -1 : 0;
        assert.deepEqual(subtract(all[row][column], opened[row][column]), y.map(part => sign * part || 0));
      }
    }
  }
});
