import { Sudoku } from './sudoku';
import { Game } from './game';

export { Sudoku } from './sudoku';
export { Game } from './game';

export function createSudoku(grid) {
  return new Sudoku(grid);
}

export function createSudokuFromJSON(json) {
  return new Sudoku(json.grid, json.initial || null);
}

export function createGame({ sudoku }) {
  return new Game(sudoku);
}

export function createGameFromJSON(json) {
  const sudoku = createSudokuFromJSON(json.current);
  return new Game(sudoku, json.undoStack, json.redoStack);
}
