import { describe, expect, it } from 'vitest';
import { loadDomainApi, makePuzzle } from './helpers/domain-api.js';

describe('HW2 explore mode', () => {
  it('beginExplore enters exploring mode', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    expect(game.isExploring()).toBe(false);
    const result = game.beginExplore();
    expect(result.success).toBe(true);
    expect(game.isExploring()).toBe(true);
  });

  it('cannot beginExplore twice', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    game.beginExplore();
    const result = game.beginExplore();
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Already');
  });

  it('abandonExplore restores pre-explore state', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    const beforeGrid = game.getGrid();
    game.beginExplore();
    // Make a guess in explore mode
    game.guess({ row: 0, col: 2, value: 9 });
    const exploreGrid = game.getGrid();
    expect(exploreGrid[0][2]).toBe(9);

    game.abandonExplore();
    expect(game.isExploring()).toBe(false);
    const afterGrid = game.getGrid();
    expect(afterGrid[0][2]).toBe(0); // restored
  });

  it('commitExplore merges explore moves into main history', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    game.beginExplore();
    game.guess({ row: 0, col: 2, value: 4 });
    const result = game.commitExplore();

    expect(result.success).toBe(true);
    expect(game.isExploring()).toBe(false);
    expect(game.getGrid()[0][2]).toBe(4);
    // Should be undoable in main history
    expect(game.canUndo()).toBe(true);
  });

  it('backtrackExplore returns to explore start but keeps failed memory', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    game.beginExplore();
    // Place a value that creates a conflict
    game.guess({ row: 0, col: 2, value: 3 }); // 3 already in row 0
    const beforeBacktrack = game.getFailedBranchCount();

    // Mark the branch and backtrack
    game.markFailedBranch();
    game.backtrackExplore();

    expect(game.isExploring()).toBe(true);
    expect(game.getGrid()[0][2]).toBe(0); // restored to start
    // Failed branch memory persists
    expect(game.getFailedBranchCount()).toBeGreaterThanOrEqual(beforeBacktrack);
  });

  it('hasNewConflicts detects only newly introduced conflicts', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    game.beginExplore();
    // Record baseline
    game.recordPreGuessState();

    // Place a non-conflicting value
    game.guess({ row: 0, col: 2, value: 4 });
    expect(game.hasNewConflicts()).toBe(false);

    // Now place a conflicting value
    game.recordPreGuessState();
    game.guess({ row: 0, col: 3, value: 7 }); // 7 exists at (0,4)
    expect(game.hasNewConflicts()).toBe(true);
  });

  it('explore has independent undo/redo', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    game.beginExplore();
    game.guess({ row: 0, col: 2, value: 4 });
    game.guess({ row: 1, col: 1, value: 7 });

    // Undo in explore
    game.undo();
    expect(game.getGrid()[1][1]).toBe(0);

    // Redo in explore
    game.redo();
    expect(game.getGrid()[1][1]).toBe(7);

    // After commit, main undo works
    game.commitExplore();
    expect(game.canUndo()).toBe(true);
  });

  it('conflicts are allowed but tracked in explore', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    game.beginExplore();
    game.recordPreGuessState();

    // Place a value that conflicts (3 conflicts with row 0 existing 3 at col 1)
    const result = game.guess({ row: 0, col: 2, value: 3 });
    expect(result.success).toBe(true); // conflicts now allowed

    // Should detect new conflicts
    expect(game.hasNewConflicts()).toBe(true);
  });

  it('failed branch memory prevents retrying same board', async () => {
    const { createGame, createSudoku } = await loadDomainApi();
    const game = createGame({ sudoku: createSudoku(makePuzzle()) });

    game.beginExplore();
    // Create a conflicting board and mark it
    game.guess({ row: 0, col: 2, value: 3 });
    game.markFailedBranch();

    // Backtrack and check the board is marked
    game.backtrackExplore();
    game.guess({ row: 0, col: 2, value: 3 });
    expect(game.isInFailedBranch()).toBe(true);
  });
});
