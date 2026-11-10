import { describe, expect, it } from 'vitest';
import { gridMatchesClues, solvePuzzle, validatePuzzle, type PuzzleInput } from './solver';

const diamond: PuzzleInput = {
  width: 5, height: 5,
  rows: ['1', '3', '5', '3', '1'],
  columns: ['1', '3', '5', '3', '1']
};

function cluesFromGrid(grid: boolean[][]): PuzzleInput {
  const clues = (line: boolean[]): string => {
    const groups: number[] = [];
    let count = 0;
    for (const cell of line) {
      if (cell) count++;
      else if (count) { groups.push(count); count = 0; }
    }
    if (count) groups.push(count);
    return groups.length ? groups.join(' ') : '0';
  };
  return {
    width: grid[0].length, height: grid.length,
    rows: grid.map(clues),
    columns: grid[0].map((_, c) => clues(grid.map((row) => row[c])))
  };
}

describe('nonogram solver', () => {
  it('finds the unique 5x5 diamond', () => {
    const result = solvePuzzle(diamond);
    expect(result.status).toBe('unique');
    expect(result.solution?.map((row) => row.map((v) => v ? '#' : '.').join(''))).toEqual([
      '..#..', '.###.', '#####', '.###.', '..#..'
    ]);
  });

  it('solves a 10x10 puzzle and checks its final grid', () => {
    const input = cluesFromGrid(Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => c <= r)));
    const result = solvePuzzle(input);
    expect(result.status).toBe('unique');
    const parsed = validatePuzzle(input).puzzle!;
    expect(gridMatchesClues(result.solution!, parsed.rows, parsed.columns)).toBe(true);
  });

  it('solves a rectangular grid', () => {
    const input = cluesFromGrid(Array.from({ length: 7 }, (_, r) => Array.from({ length: 5 }, (_, c) => c <= Math.min(r, 4))));
    const result = solvePuzzle(input);
    expect(result.status).toBe('unique');
    expect(result.solution).toHaveLength(7);
    expect(result.solution?.[0]).toHaveLength(5);
  });

  it('supports the maximum 25x25 grid size', () => {
    const input = { width: 25, height: 25, rows: Array(25).fill('25'), columns: Array(25).fill('25') };
    const result = solvePuzzle(input);
    expect(result.status).toBe('unique');
    expect(result.solution?.every((row) => row.every(Boolean))).toBe(true);
  });

  it('handles empty rows and columns', () => {
    const input = cluesFromGrid(Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => r === 2 && c === 2)));
    const result = solvePuzzle(input);
    expect(result.status).toBe('unique');
    expect(result.solution?.[2][2]).toBe(true);
    expect(result.solution?.[0].every((cell) => !cell)).toBe(true);
  });

  it('pinpoints malformed and overlong clues', () => {
    const malformed = solvePuzzle({ ...diamond, rows: ['1.5', ...diamond.rows.slice(1)], columns: [...diamond.columns.slice(0, 4), '-2'] });
    expect(malformed.status).toBe('invalid');
    expect(malformed.errors).toEqual(expect.arrayContaining([expect.stringContaining('Row 1:'), expect.stringContaining('Column 5:')]));
    const tooLong = solvePuzzle({ ...diamond, rows: ['3 3', ...diamond.rows.slice(1)] });
    expect(tooLong.status).toBe('invalid');
    expect(tooLong.errors[0]).toContain('at least 7 cells');
    const doubledComma = solvePuzzle({ ...diamond, rows: ['1,,1', ...diamond.rows.slice(1)] });
    expect(doubledComma.status).toBe('invalid');
  });

  it('rejects mismatched filled-cell totals', () => {
    const result = solvePuzzle({ ...diamond, columns: ['0', ...diamond.columns.slice(1)] });
    expect(result.status).toBe('invalid');
    expect(result.errors[0]).toContain('Filled-cell totals disagree');
  });

  it('reports a global contradiction as no solution', () => {
    const result = solvePuzzle({ width: 5, height: 5, rows: ['5', '0', '0', '0', '0'], columns: ['0', '1', '1', '1', '2'] });
    expect(result.status).toBe('none');
    expect(result.errors).toEqual([]);
  });

  it('detects multiple solutions and returns a valid one', () => {
    const input = { width: 5, height: 5, rows: Array(5).fill('1'), columns: Array(5).fill('1') };
    const result = solvePuzzle(input);
    expect(result.status).toBe('multiple');
    const parsed = validatePuzzle(input).puzzle!;
    expect(gridMatchesClues(result.solution!, parsed.rows, parsed.columns)).toBe(true);
  });

  it('keeps search limits distinct from no solution or uniqueness', () => {
    expect(solvePuzzle(diamond, { nodeLimit: 0 }).status).toBe('limit');
    expect(solvePuzzle(diamond, { timeLimitMs: 0 }).status).toBe('limit');
  });

  it('does not accept an incorrect final grid', () => {
    const parsed = validatePuzzle(diamond).puzzle!;
    expect(gridMatchesClues(Array.from({ length: 5 }, () => Array(5).fill(false)), parsed.rows, parsed.columns)).toBe(false);
  });
});
