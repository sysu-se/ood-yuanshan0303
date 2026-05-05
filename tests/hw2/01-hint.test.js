import { describe, expect, it } from 'vitest';
import { loadDomainApi, makePuzzle, makeSolvedPuzzle } from './helpers/domain-api.js';

describe('HW2 hint — candidate analysis', () => {
  it('getCandidates returns valid candidates for an empty cell', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makePuzzle());

    // (0,2) in the puzzle is empty; row 0 has 5,3,7; col 2 has 8; box has 5,3,6,1,9,8
    const candidates = sudoku.getCandidates(0, 2);
    expect(candidates).toBeInstanceOf(Array);
    expect(candidates.length).toBeGreaterThan(0);
    // 4 should be the only candidate at (0,2) for the naked single
    expect(candidates).toContain(4);
  });

  it('getCandidates returns empty array for filled cell', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makePuzzle());
    expect(sudoku.getCandidates(0, 0)).toEqual([]); // has 5
  });

  it('getCandidates returns empty array for initial cell', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makePuzzle());
    expect(sudoku.getCandidates(0, 0)).toEqual([]);
  });

  it('getCandidatesWithExplanation returns explanation data', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makePuzzle());

    const info = sudoku.getCandidatesWithExplanation(0, 2);
    expect(info.candidates).toBeInstanceOf(Array);
    expect(info.eliminated).toBeInstanceOf(Array);
    expect(info.eliminated.length).toBeGreaterThan(0);
    info.eliminated.forEach(e => {
      expect(e).toHaveProperty('value');
      expect(e).toHaveProperty('reason');
      expect(typeof e.reason).toBe('string');
    });
  });

  it('findNakedSingle finds a cell with exactly one candidate', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makePuzzle());

    const hint = sudoku.findNakedSingle();
    expect(hint).not.toBeNull();
    expect(hint).toHaveProperty('row');
    expect(hint).toHaveProperty('col');
    expect(hint).toHaveProperty('value');
    expect(hint).toHaveProperty('explanation');
    expect(hint.value).toBeGreaterThanOrEqual(1);
    expect(hint.value).toBeLessThanOrEqual(9);

    // Verify: filling the hint should be valid
    const result = sudoku.guess({ row: hint.row, col: hint.col, value: hint.value });
    expect(result.success).toBe(true);
  });

  it('findAllNakedSingles returns all single-candidate cells', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makePuzzle());
    const all = sudoku.findAllNakedSingles();
    expect(all.length).toBeGreaterThan(0);
    all.forEach(h => {
      const candidates = sudoku.getCandidates(h.row, h.col);
      expect(candidates).toEqual([h.value]);
    });
  });

  it('hasNakedSingle returns true when hint exists', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makePuzzle());
    expect(sudoku.hasNakedSingle()).toBe(true);
  });

  it('hasNakedSingle returns false on solved board', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makeSolvedPuzzle());
    expect(sudoku.hasNakedSingle()).toBe(false);
  });

  it('getCandidates includes all valid numbers, excludes used ones', async () => {
    const { createSudoku } = await loadDomainApi();
    const sudoku = createSudoku(makePuzzle());

    const candidates = sudoku.getCandidates(0, 2);
    // row 0 has: 5,3,7; col 2 has: 8; box (rows 0-2, cols 0-2) has: 5,3,6,9,8
    const used = [5, 3, 7, 8, 6, 9];
    used.forEach(u => expect(candidates).not.toContain(u));
    // 1, 2, 4 are all valid — 1 in row 1 is at col 3 (different box)
    expect(candidates).toContain(1);
    expect(candidates).toContain(2);
    expect(candidates).toContain(4);
  });
});
