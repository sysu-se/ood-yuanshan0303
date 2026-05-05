import { BOX_SIZE, SUDOKU_SIZE } from '@sudoku/constants';

const SKIP_VALIDATION = Symbol('SKIP_VALIDATION');

/**
 * 代表一张数独盘面及其规则。
 *
 * 只关心盘面上"能放什么、有没有冲突、是不是做完了"这类问题，
 * 不关心谁在玩、历史怎么记录——那些是 Game 的事。
 */
export class Sudoku {
  /**
   * @param {number[][]} grid - 9x9 二维数组，0 表示空格，1-9 表示已填数字
   * @param {number[][]|null} [initialGrid=null] - 题面固定格
   * @param {Symbol|null} [_flag=null] - 内部标记，仅 clone() 使用
   */
  constructor(grid, initialGrid = null, _flag = null) {
    if (_flag !== SKIP_VALIDATION) {
      this._validateGrid(grid);
      if (initialGrid) this._validateGrid(initialGrid);
    }
    this.board = this._copy(grid);
    this.initial = initialGrid ? this._copy(initialGrid) : this._copy(grid);
  }

  _validateGrid(grid) {
    if (!Array.isArray(grid) || grid.length !== SUDOKU_SIZE) {
      throw new Error(`Grid must be ${SUDOKU_SIZE}x${SUDOKU_SIZE}`);
    }
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      if (!Array.isArray(grid[r]) || grid[r].length !== SUDOKU_SIZE) {
        throw new Error(`Row ${r} must have ${SUDOKU_SIZE} columns`);
      }
      for (let c = 0; c < SUDOKU_SIZE; c++) {
        const v = grid[r][c];
        if (!Number.isInteger(v) || v < 0 || v > 9) {
          throw new Error(`Invalid value ${v} at (${r},${c})`);
        }
      }
    }
  }

  _copy(source) {
    return source.map(row => row.slice());
  }

  /** @returns {number[][]} 当前盘面深拷贝 */
  getGrid() {
    return this._copy(this.board);
  }

  /** @returns {number[][]} 题面固定格深拷贝 */
  getInitialGrid() {
    return this._copy(this.initial);
  }

  /** @returns {number} */
  getCell(row, col) {
    return this.board[row][col];
  }

  /** @returns {boolean} */
  isInitialCell(row, col) {
    return this.initial[row][col] !== 0;
  }

  /**
   * 在指定位置填入数字。
   * @param {{ row: number, col: number, value: number }} move
   * @returns {{ success: boolean, reason?: string }}
   */
  guess(move) {
    const { row, col, value } = move;

    if (row < 0 || row >= SUDOKU_SIZE || col < 0 || col >= SUDOKU_SIZE) {
      return { success: false, reason: `Position (${row},${col}) out of bounds` };
    }
    if (!Number.isInteger(value) || value < 0 || value > 9) {
      return { success: false, reason: `Invalid value: ${value}, must be 0-9` };
    }
    if (this.isInitialCell(row, col)) {
      return { success: false, reason: `Cell (${row},${col}) is a fixed initial cell` };
    }
    this.board[row][col] = value;
    return { success: true };
  }

  /**
   * 查找盘面中所有存在行列宫冲突的格子。
   * @returns {{ row: number, col: number }[]}
   */
  findConflicts() {
    const conflicts = new Set();
    const key = (r, c) => `${r},${c}`;
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      for (let c = 0; c < SUDOKU_SIZE; c++) {
        const val = this.board[r][c];
        if (val === 0) continue;
        for (let i = 0; i < SUDOKU_SIZE; i++) {
          if (i !== c && this.board[r][i] === val) {
            conflicts.add(key(r, c));
            conflicts.add(key(r, i));
          }
          if (i !== r && this.board[i][c] === val) {
            conflicts.add(key(r, c));
            conflicts.add(key(i, c));
          }
        }
        const sr = Math.floor(r / BOX_SIZE) * BOX_SIZE;
        const sc = Math.floor(c / BOX_SIZE) * BOX_SIZE;
        for (let dr = sr; dr < sr + BOX_SIZE; dr++) {
          for (let dc = sc; dc < sc + BOX_SIZE; dc++) {
            if (!(dr === r && dc === c) && this.board[dr][dc] === val) {
              conflicts.add(key(r, c));
              conflicts.add(key(dr, dc));
            }
          }
        }
      }
    }
    return [...conflicts].map(k => {
      const [r, c] = k.split(',');
      return { row: Number(r), col: Number(c) };
    });
  }

  /** @returns {boolean} */
  isSolved() {
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      for (let c = 0; c < SUDOKU_SIZE; c++) {
        if (this.board[r][c] === 0) return false;
      }
    }
    return this.findConflicts().length === 0;
  }

  /**
   * 检查盘面是否有冲突。
   * @returns {boolean}
   */
  hasConflicts() {
    return this.findConflicts().length > 0;
  }

  // ==================== HW2：提示能力 ====================

  /**
   * 获取指定格子的候选数集合。
   * @param {number} row
   * @param {number} col
   * @returns {number[]} 候选数字数组（升序）
   */
  getCandidates(row, col) {
    if (this.board[row][col] !== 0) return [];
    if (this.isInitialCell(row, col)) return [];

    const used = new Set();
    for (let c = 0; c < SUDOKU_SIZE; c++) {
      if (this.board[row][c] !== 0) used.add(this.board[row][c]);
    }
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      if (this.board[r][col] !== 0) used.add(this.board[r][col]);
    }
    const sr = Math.floor(row / BOX_SIZE) * BOX_SIZE;
    const sc = Math.floor(col / BOX_SIZE) * BOX_SIZE;
    for (let dr = sr; dr < sr + BOX_SIZE; dr++) {
      for (let dc = sc; dc < sc + BOX_SIZE; dc++) {
        if (this.board[dr][dc] !== 0) used.add(this.board[dr][dc]);
      }
    }

    const candidates = [];
    for (let v = 1; v <= 9; v++) {
      if (!used.has(v)) candidates.push(v);
    }
    return candidates;
  }

  /**
   * 获取候选数及其解释——每个被排除的数字的原因。
   * @param {number} row
   * @param {number} col
   * @returns {{ candidates: number[], eliminated: { value: number, reason: string }[] }}
   */
  getCandidatesWithExplanation(row, col) {
    const candidates = this.getCandidates(row, col);
    const eliminated = [];

    if (this.board[row][col] !== 0) {
      return { candidates: [], eliminated: [{ value: this.board[row][col], reason: 'cell already filled' }] };
    }
    if (this.isInitialCell(row, col)) {
      return { candidates: [], eliminated: [{ value: this.initial[row][col], reason: 'fixed initial cell' }] };
    }

    const used = new Map(); // value -> reason

    for (let c = 0; c < SUDOKU_SIZE; c++) {
      const v = this.board[row][c];
      if (v !== 0 && c !== col) used.set(v, `row ${row + 1} already has ${v}`);
    }
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      const v = this.board[r][col];
      if (v !== 0 && r !== row) used.set(v, `column ${col + 1} already has ${v}`);
    }
    const sr = Math.floor(row / BOX_SIZE) * BOX_SIZE;
    const sc = Math.floor(col / BOX_SIZE) * BOX_SIZE;
    for (let dr = sr; dr < sr + BOX_SIZE; dr++) {
      for (let dc = sc; dc < sc + BOX_SIZE; dc++) {
        const v = this.board[dr][dc];
        if (v !== 0 && !(dr === row && dc === col)) used.set(v, `box already has ${v}`);
      }
    }

    for (let v = 1; v <= 9; v++) {
      if (!candidates.includes(v) && used.has(v)) {
        eliminated.push({ value: v, reason: used.get(v) });
      }
    }

    return { candidates, eliminated };
  }

  /**
   * 查找盘面中的所有唯一候选格（Naked Single）。
   * @returns {{ row: number, col: number, value: number }[]}
   */
  findAllNakedSingles() {
    const results = [];
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      for (let c = 0; c < SUDOKU_SIZE; c++) {
        if (this.board[r][c] !== 0) continue;
        if (this.isInitialCell(r, c)) continue;
        const candidates = this.getCandidates(r, c);
        if (candidates.length === 1) {
          results.push({ row: r, col: c, value: candidates[0] });
        }
      }
    }
    return results;
  }

  /**
   * 查找盘面中的一个唯一候选格（Naked Single）。
   * @returns {{ row: number, col: number, value: number, explanation: string } | null}
   */
  findNakedSingle() {
    const all = this.findAllNakedSingles();
    if (all.length === 0) return null;
    const hint = all[0];
    const { eliminated } = this.getCandidatesWithExplanation(hint.row, hint.col);
    const reasons = eliminated.map(e => e.reason).join('; ');
    return {
      ...hint,
      explanation: `Cell (${hint.row + 1},${hint.col + 1}) can only be ${hint.value} because ${reasons || 'all other numbers are eliminated'}.`,
    };
  }

  /** @returns {boolean} */
  hasNakedSingle() {
    return this.findNakedSingle() !== null;
  }

  // ==================== HW2 新增：盘面哈希（用于探索模式记忆失败分支） ====================

  /**
   * 生成当前盘面的字符串哈希，用于探索模式中记忆失败的分支。
   * 将盘面展平为 81 字符的字符串。
   *
   * @returns {string}
   */
  hashBoard() {
    let hash = '';
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      for (let c = 0; c < SUDOKU_SIZE; c++) {
        hash += String(this.board[r][c]);
      }
    }
    return hash;
  }

  // ==================== 深拷贝 / 序列化 / 外表化 ====================

  /** @returns {Sudoku} */
  clone() {
    return new Sudoku(this.board, this.initial, SKIP_VALIDATION);
  }

  /** @returns {{ grid: number[][], initial: number[][] }} */
  toJSON() {
    return {
      grid: this.getGrid(),
      initial: this.getInitialGrid(),
    };
  }

  /** @returns {string} */
  toString() {
    let header = '     ';
    for (let c = 0; c < SUDOKU_SIZE; c++) {
      header += (c + 1) + ' ';
      if (c === 2 || c === 5) header += '| ';
    }
    const lines = [header, '   ╔═══════╤═══════╤═══════╗'];
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      if (r > 0 && r % BOX_SIZE === 0) {
        lines.push('   ╟───────┼───────┼───────╢');
      }
      let line = ` ${r + 1} ║ `;
      for (let c = 0; c < SUDOKU_SIZE; c++) {
        const val = this.board[r][c];
        line += (val === 0 ? '·' : String(val)) + ' ';
        if (c === 2 || c === 5) line += '│ ';
      }
      lines.push(line + '║');
    }
    lines.push('   ╚═══════╧═══════╧═══════╝');
    return lines.join('\n');
  }
}
