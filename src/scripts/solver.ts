export type SolveStatus = 'invalid' | 'none' | 'unique' | 'multiple' | 'limit';
export type Grid = boolean[][];

export interface PuzzleInput {
  width: number;
  height: number;
  rows: string[];
  columns: string[];
}

export interface SolveOptions {
  timeLimitMs?: number;
  nodeLimit?: number;
  candidateLimit?: number;
}

export interface SolveResult {
  status: SolveStatus;
  errors: string[];
  solution?: Grid;
  elapsedMs: number;
  nodes: number;
  reason?: string;
}

interface ParsedPuzzle {
  width: number;
  height: number;
  rows: number[][];
  columns: number[][];
}

function readClue(raw: string, label: string, lineLength: number, errors: string[]): number[] | null {
  const value = raw.trim();
  if (!value) {
    errors.push(`${label}: Enter clues, or 0 for an empty line.`);
    return null;
  }
  if (!/^\d+(?:(?:\s+|\s*,\s*)\d+)*$/.test(value)) {
    errors.push(`${label}: Please enter non-negative integers separated by spaces or commas.`);
    return null;
  }
  const numbers = value.split(/[\s,]+/).map(Number);
  if (numbers.some((n) => !Number.isSafeInteger(n))) {
    errors.push(`${label}: Please enter valid whole numbers.`);
    return null;
  }
  if (numbers.length === 1 && numbers[0] === 0) return [];
  if (numbers.some((n) => n <= 0)) {
    errors.push(`${label}: Use positive integers for filled groups, or 0 by itself for an empty line.`);
    return null;
  }
  const minimum = numbers.reduce((sum, n) => sum + n, 0) + numbers.length - 1;
  if (minimum > lineLength) {
    errors.push(`${label}: These clues require at least ${minimum} cells, but this line has only ${lineLength}.`);
    return null;
  }
  return numbers;
}

export function validatePuzzle(input: PuzzleInput): { puzzle?: ParsedPuzzle; errors: string[] } {
  const errors: string[] = [];
  const { width, height } = input;
  if (!Number.isInteger(width) || width < 5 || width > 25) errors.push('Width: Choose a whole number from 5 to 25.');
  if (!Number.isInteger(height) || height < 5 || height > 25) errors.push('Height: Choose a whole number from 5 to 25.');
  if (errors.length) return { errors };
  if (!Array.isArray(input.rows) || input.rows.length !== height) errors.push(`Row clues: Enter exactly ${height} lines.`);
  if (!Array.isArray(input.columns) || input.columns.length !== width) errors.push(`Column clues: Enter exactly ${width} lines.`);
  if (errors.length) return { errors };
  const rows = input.rows.map((raw, index) => readClue(raw, `Row ${index + 1}`, width, errors));
  const columns = input.columns.map((raw, index) => readClue(raw, `Column ${index + 1}`, height, errors));
  if (errors.length) return { errors };
  const parsedRows = rows as number[][];
  const parsedColumns = columns as number[][];
  const rowTotal = parsedRows.flat().reduce((sum, n) => sum + n, 0);
  const columnTotal = parsedColumns.flat().reduce((sum, n) => sum + n, 0);
  if (rowTotal !== columnTotal) {
    errors.push(`Filled-cell totals disagree: rows require ${rowTotal}, while columns require ${columnTotal}.`);
    return { errors };
  }
  return { puzzle: { width, height, rows: parsedRows, columns: parsedColumns }, errors };
}

function lineClues(cells: boolean[]): number[] {
  const groups: number[] = [];
  let count = 0;
  for (const filled of cells) {
    if (filled) count++;
    else if (count) { groups.push(count); count = 0; }
  }
  if (count) groups.push(count);
  return groups;
}

function equalNumbers(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function gridMatchesClues(grid: Grid, rows: number[][], columns: number[][]): boolean {
  const height = rows.length;
  const width = columns.length;
  if (grid.length !== height || grid.some((row) => row.length !== width)) return false;
  for (let r = 0; r < height; r++) if (!equalNumbers(lineClues(grid[r]), rows[r])) return false;
  for (let c = 0; c < width; c++) if (!equalNumbers(lineClues(grid.map((row) => row[c])), columns[c])) return false;
  return true;
}

class SearchLimit extends Error {}

function makePatterns(clues: number[], length: number, limit: number, check: () => void): number[] {
  if (!clues.length) return [0];
  const patterns: number[] = [];
  function place(index: number, start: number, mask: number): void {
    check();
    const remaining = clues.slice(index + 1).reduce((sum, n) => sum + n, 0) + (clues.length - index - 1);
    const lastStart = length - clues[index] - remaining;
    for (let at = start; at <= lastStart; at++) {
      const groupMask = ((1 << clues[index]) - 1) << at;
      const next = mask | groupMask;
      if (index === clues.length - 1) {
        patterns.push(next);
        if (patterns.length > limit) throw new SearchLimit('A line has too many possible arrangements for this search limit.');
      } else place(index + 1, at + clues[index] + 1, next);
    }
  }
  place(0, 0, 0);
  return patterns;
}

interface Domains { rows: number[][]; columns: number[][] }

function forced(domain: number[], length: number): { filled: number; empty: number } {
  let all = (1 << length) - 1;
  let any = 0;
  for (const pattern of domain) { all &= pattern; any |= pattern; }
  return { filled: all, empty: ((1 << length) - 1) & ~any };
}

function compatiblePatterns(domain: number[], filled: number, empty: number, check: () => void): number[] {
  const compatible: number[] = [];
  for (let i = 0; i < domain.length; i++) {
    if ((i & 1023) === 0) check();
    const pattern = domain[i];
    if ((pattern & filled) === filled && (pattern & empty) === 0) compatible.push(pattern);
  }
  return compatible;
}

function propagate(domains: Domains, width: number, height: number, check: () => void): boolean {
  let changed = true;
  while (changed) {
    check();
    changed = false;
    const colForced = domains.columns.map((domain) => forced(domain, height));
    for (let r = 0; r < height; r++) {
      let filled = 0, empty = 0;
      for (let c = 0; c < width; c++) {
        if (colForced[c].filled & (1 << r)) filled |= 1 << c;
        if (colForced[c].empty & (1 << r)) empty |= 1 << c;
      }
      const old = domains.rows[r];
      const next = compatiblePatterns(old, filled, empty, check);
      if (!next.length) return false;
      if (next.length !== old.length) { domains.rows[r] = next; changed = true; }
    }
    const rowForced = domains.rows.map((domain) => forced(domain, width));
    for (let c = 0; c < width; c++) {
      let filled = 0, empty = 0;
      for (let r = 0; r < height; r++) {
        if (rowForced[r].filled & (1 << c)) filled |= 1 << r;
        if (rowForced[r].empty & (1 << c)) empty |= 1 << r;
      }
      const old = domains.columns[c];
      const next = compatiblePatterns(old, filled, empty, check);
      if (!next.length) return false;
      if (next.length !== old.length) { domains.columns[c] = next; changed = true; }
    }
  }
  return true;
}

function fromDomains(domains: Domains, width: number, height: number): Grid {
  return Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) => Boolean(domains.rows[r][0] & (1 << c))));
}

export function solvePuzzle(input: PuzzleInput, options: SolveOptions = {}): SolveResult {
  const started = Date.now();
  let nodes = 0;
  const finish = (status: SolveStatus, errors: string[] = [], solution?: Grid, reason?: string): SolveResult =>
    ({ status, errors, solution, reason, nodes, elapsedMs: Date.now() - started });
  const { puzzle, errors } = validatePuzzle(input);
  if (!puzzle) return finish('invalid', errors);
  const timeLimitMs = options.timeLimitMs ?? 8000;
  const nodeLimit = options.nodeLimit ?? 20000;
  const candidateLimit = options.candidateLimit ?? 200000;
  const deadline = started + timeLimitMs;
  const check = () => {
    if (Date.now() >= deadline) throw new SearchLimit('Time limit reached. Try a smaller or more constrained puzzle.');
    if (nodes >= nodeLimit) throw new SearchLimit('Search limit reached. Try a puzzle with more specific clues.');
  };
  const solutions: Grid[] = [];
  try {
    const domains: Domains = {
      rows: puzzle.rows.map((clues) => makePatterns(clues, puzzle.width, candidateLimit, check)),
      columns: puzzle.columns.map((clues) => makePatterns(clues, puzzle.height, candidateLimit, check))
    };
    function search(current: Domains): void {
      nodes++;
      check();
      if (!propagate(current, puzzle!.width, puzzle!.height, check)) return;
      let bestKind: 'rows' | 'columns' | null = null;
      let bestIndex = -1;
      let bestSize = Infinity;
      for (const kind of ['rows', 'columns'] as const) {
        for (let index = 0; index < current[kind].length; index++) {
          const domain = current[kind][index];
          if (domain.length > 1 && domain.length < bestSize) { bestKind = kind; bestIndex = index; bestSize = domain.length; }
        }
      }
      if (bestKind === null) {
        const grid = fromDomains(current, puzzle!.width, puzzle!.height);
        if (gridMatchesClues(grid, puzzle!.rows, puzzle!.columns)) solutions.push(grid);
        return;
      }
      const kind: 'rows' | 'columns' = bestKind;
      for (const pattern of current[kind][bestIndex]) {
        check();
        const child: Domains = { rows: current.rows.slice(), columns: current.columns.slice() };
        child[kind][bestIndex] = [pattern];
        search(child);
        if (solutions.length >= 2) return;
      }
    }
    search(domains);
    if (solutions.length >= 2) return finish('multiple', [], solutions[0]);
    if (solutions.length === 1) return finish('unique', [], solutions[0]);
    return finish('none');
  } catch (error) {
    if (error instanceof SearchLimit) return finish('limit', [], solutions[0], error.message);
    throw error;
  }
}
