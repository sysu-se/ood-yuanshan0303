import { Sudoku } from './sudoku';

function _emptyGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

/**
 * 代表一局游戏会话。
 *
 * 管三件事：当前盘面是谁、操作历史（undo/redo）、当前处于什么模式（normal/exploring）。
 * 提示和探索的具体盘面分析交给 Sudoku，Game 负责把它们串进历史和模式里。
 */
export class Game {
  /** @type {'normal' | 'exploring'} */
  _mode = 'normal';

  /** @type {Sudoku | null} */
  _exploreSnapshot = null;

  /** @type {Sudoku[]} */
  _exploreUndoStack = [];

  /** @type {Sudoku[]} */
  _exploreRedoStack = [];

  /** @type {Set<string>} */
  _failedBranches = new Set();

  /** @type {number} */
  _preGuessConflictCount = 0;

  /**
   * @param {Sudoku} sudoku
   * @param {object[]|null} [undoStack=null]
   * @param {object[]|null} [redoStack=null]
   */
  constructor(sudoku, undoStack = null, redoStack = null) {
    this._current = sudoku.clone();

    if (undoStack && redoStack) {
      this._undoStack = undoStack.map(j => new Sudoku(j.grid, j.initial));
      this._redoStack = redoStack.map(j => new Sudoku(j.grid, j.initial));
    } else {
      this._undoStack = [this._current.clone()];
      this._redoStack = [];
    }
  }

  /** @returns {Game} */
  static empty() {
    return new Game(new Sudoku(_emptyGrid()));
  }

  // ==================== 查询方法 ====================

  /** @returns {Sudoku} */
  getSudoku() {
    return this._current.clone();
  }

  /** @returns {number[][]} */
  getGrid() {
    return this._current.getGrid();
  }

  /** @returns {number[][]} */
  getInitialGrid() {
    return this._current.getInitialGrid();
  }

  /** @returns {boolean} */
  isInitialCell(row, col) {
    return this._current.isInitialCell(row, col);
  }

  /** @returns {{ row: number, col: number }[]} */
  findConflicts() {
    return this._current.findConflicts();
  }

  /** @returns {boolean} */
  isSolved() {
    return this._current.isSolved();
  }

  // ==================== 操作：填数 ====================

  /**
   * @param {{ row: number, col: number, value: number }} move
   * @returns {{ success: boolean, reason?: string }}
   */
  guess(move) {
    const oldValue = this._current.getCell(move.row, move.col);
    if (oldValue === move.value) {
      return { success: true };
    }

    const result = this._current.guess(move);
    if (!result.success) {
      return result;
    }

    if (this._mode === 'exploring') {
      // 探索模式：使用独立历史栈
      this._exploreRedoStack = [];
      this._exploreUndoStack.push(this._current.clone());
    } else {
      this._redoStack = [];
      this._undoStack.push(this._current.clone());
    }

    return { success: true };
  }

  // ==================== 操作：撤销/重做 ====================

  undo() {
    if (this._mode === 'exploring') {
      if (this._exploreUndoStack.length <= 1) return;
      const snapshot = this._exploreUndoStack.pop();
      this._exploreRedoStack.push(snapshot);
      this._current = this._exploreUndoStack[this._exploreUndoStack.length - 1].clone();
    } else {
      if (!this.canUndo()) return;
      const snapshot = this._undoStack.pop();
      this._redoStack.push(snapshot);
      this._current = this._undoStack[this._undoStack.length - 1].clone();
    }
  }

  redo() {
    if (this._mode === 'exploring') {
      if (this._exploreRedoStack.length === 0) return;
      const snapshot = this._exploreRedoStack.pop();
      this._exploreUndoStack.push(snapshot);
      this._current = snapshot.clone();
    } else {
      if (!this.canRedo()) return;
      const snapshot = this._redoStack.pop();
      this._undoStack.push(snapshot);
      this._current = snapshot.clone();
    }
  }

  /** @returns {boolean} */
  canUndo() {
    if (this._mode === 'exploring') {
      return this._exploreUndoStack.length > 1;
    }
    return this._undoStack.length > 1;
  }

  /** @returns {boolean} */
  canRedo() {
    if (this._mode === 'exploring') {
      return this._exploreRedoStack.length > 0;
    }
    return this._redoStack.length > 0;
  }

  // ==================== HW2：提示 ====================

  /** @returns {{ row: number, col: number, value: number, explanation: string } | null} */
  findHint() {
    return this._current.findNakedSingle();
  }

  // ==================== HW2：探索模式 ====================

  /** @returns {boolean} */
  isExploring() {
    return this._mode === 'exploring';
  }

  /**
   * 进入探索模式。
   *
   * 保存当前局面快照，切换到探索模式，
   * 初始化独立的探索历史栈，清空失败分支记忆。
   *
   * @returns {{ success: boolean, reason?: string }}
   */
  beginExplore() {
    if (this._mode === 'exploring') {
      return { success: false, reason: 'Already in explore mode' };
    }

    this._mode = 'exploring';
    this._exploreSnapshot = this._current.clone();
    this._exploreUndoStack = [this._current.clone()];
    this._exploreRedoStack = [];
    this._failedBranches = new Set();
    this._preGuessConflictCount = this._current.findConflicts().length;

    return { success: true };
  }

  /**
   * 提交探索结果。
   *
   * 将探索过程中的所有操作合并到主历史栈：
   * 1. 主历史中压入探索前快照
   * 2. 依次压入探索中的每一步快照
   * 3. 当前状态设为探索最终状态
   * 4. 清空主 redoStack
   *
   * 恢复到正常模式，清理探索相关状态。
   *
   * @returns {{ success: boolean, reason?: string }}
   */
  commitExplore() {
    if (this._mode !== 'exploring') {
      return { success: false, reason: 'Not in explore mode' };
    }

    // 将探索中的快照依次压入主栈。
    // _exploreUndoStack[0] 即进入探索时的状态，与主栈顶相同，跳过。
    this._redoStack = [];
    for (let i = 1; i < this._exploreUndoStack.length; i++) {
      this._undoStack.push(this._exploreUndoStack[i]);
    }
    this._undoStack.push(this._current.clone());

    this._mode = 'normal';
    this._exploreSnapshot = null;
    this._exploreUndoStack = [];
    this._exploreRedoStack = [];
    this._failedBranches = new Set();

    return { success: true };
  }

  /**
   * 放弃探索，回滚到进入探索前的局面。
   *
   * 恢复探索前快照作为当前状态，
   * 主历史栈不变，清理探索相关状态。
   *
   * @returns {{ success: boolean, reason?: string }}
   */
  abandonExplore() {
    if (this._mode !== 'exploring') {
      return { success: false, reason: 'Not in explore mode' };
    }

    this._current = this._exploreSnapshot.clone();

    this._mode = 'normal';
    this._exploreSnapshot = null;
    this._exploreUndoStack = [];
    this._exploreRedoStack = [];
    this._failedBranches = new Set();

    return { success: true };
  }

  /**
   * 回溯到探索起点。
   *
   * 将当前局面恢复到进入探索时的状态，
   * 但保留失败分支记忆，以便用户尝试其他路径。
   *
   * @returns {{ success: boolean, reason?: string }}
   */
  backtrackExplore() {
    if (this._mode !== 'exploring') {
      return { success: false, reason: 'Not in explore mode' };
    }

    this._current = this._exploreSnapshot.clone();
    this._exploreUndoStack = [this._current.clone()];
    this._exploreRedoStack = [];
    this._preGuessConflictCount = this._current.findConflicts().length;
    // _failedBranches 保留，实现跨路径记忆

    return { success: true };
  }

  /**
   * 在探索模式 guess 前记录当前冲突数。
   * 由 gameStore 在 guess 前调用，用于判断本次 guess 是否引入了新冲突。
   */
  recordPreGuessState() {
    if (this._mode !== 'exploring') return;
    this._preGuessConflictCount = this._current.findConflicts().length;
  }

  /**
   * 判断探索模式中，本次 guess 是否使盘面从无冲突变为有冲突。
   * 仅 0→1 的转变算作新引入冲突，避免同一分支上多次计数。
   * @returns {boolean}
   */
  hasNewConflicts() {
    if (this._mode !== 'exploring') return false;
    const currentConflicts = this._current.findConflicts().length;
    return this._preGuessConflictCount === 0 && currentConflicts > 0;
  }

  /**
   * 标记当前盘面为失败分支。
   * 用于在探索中检测到新冲突后记录此路径不可行。
   */
  markFailedBranch() {
    if (this._mode !== 'exploring') return;
    this._failedBranches.add(this._current.hashBoard());
  }

  /**
   * 检查当前盘面是否已存在于失败分支记忆中。
   * @returns {boolean}
   */
  isInFailedBranch() {
    if (this._mode !== 'exploring') return false;
    return this._failedBranches.has(this._current.hashBoard());
  }

  /**
   * 检查指定哈希是否在失败分支记忆中。
   * 供 gameStore 在 guess 前做预检查，避免直接访问私有字段。
   * @param {string} hash
   * @returns {boolean}
   */
  isHashInFailedBranches(hash) {
    if (this._mode !== 'exploring') return false;
    return this._failedBranches.has(hash);
  }

  /** @returns {number} */
  getFailedBranchCount() {
    return this._failedBranches.size;
  }

  // ==================== 序列化 / 外表化 ====================

  /**
   * 序列化完整游戏会话。
   *
   * 注意：探索模式下的中间状态不会被序列化。
   * 如果在探索中保存，保存的是进入探索前的状态。
   *
   * @returns {{ current: object, undoStack: object[], redoStack: object[] }}
   */
  toJSON() {
    if (this._mode === 'exploring') {
      // 探索中序列化：保存探索前快照对应的状态
      return {
        current: this._exploreSnapshot.toJSON(),
        undoStack: this._undoStack.map(s => s.toJSON()),
        redoStack: this._redoStack.map(s => s.toJSON()),
      };
    }
    return {
      current: this._current.toJSON(),
      undoStack: this._undoStack.map(s => s.toJSON()),
      redoStack: this._redoStack.map(s => s.toJSON()),
    };
  }

  /** @returns {string} */
  toString() {
    const modeLabel = this._mode === 'exploring' ? ' [EXPLORE]' : '';
    return (
      `[Game${modeLabel}] undo=${this._undoStack.length - 1} redo=${this._redoStack.length}` +
      (this._mode === 'exploring'
        ? ` exploreUndo=${this._exploreUndoStack.length - 1} exploreRedo=${this._exploreRedoStack.length}`
        : '') +
      '\n' + this._current.toString()
    );
  }
}
