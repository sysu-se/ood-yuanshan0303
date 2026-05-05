# EVOLUTION.md — Homework 2 设计演进文档

## 1. 你如何实现提示功能？

提示功能分为两个层次，均通过 Sudoku 领域对象提供：

**A. 候选提示（getCandidates）**

`Sudoku.getCandidates(row, col)` 计算指定格子的候选数集合。对于指定空格，扫描其所在行、列、宫，收集已出现的数字，返回 1-9 中未出现的数字列表（升序）。若该格已有数字或是固定格，返回空数组。

**B. 下一步提示（findNakedSingle / findHint）**

`Sudoku.findNakedSingle()` 扫描整个盘面的所有空格，对每个空格调用 `getCandidates`，找到第一个候选数恰好只有 1 个的格子（Naked Single），返回 `{ row, col, value }`。若无此类格子则返回 null。

Game 层通过 `findHint()` 委托给 Sudoku，gameStore 直接调 `getSudoku().getCandidatesWithExplanation()` 获取候选信息。在此基础上提供提示消费方式：

- `findHintCell()`：返回推定位置及解释，不修改盘面
- `applyHintFill()`：调用 `findHintCell()` 找到推定格后，通过 `guess()` 自动填入（产生历史记录、触发响应式更新）
- `applyHintAtCell(row, col)`：对指定格从原始题面求解唯一答案并填入，确保用户填错数字后提示仍返回正确值

**UI 层**：三种按钮分别对应候选提示（?）、下一步-仅显示位置（眼睛）、下一步-自动填入（灯泡），全部调 gameStore 接口，不直接在组件中计算。

## 2. 你认为提示功能更属于 Sudoku 还是 Game？为什么？

**提示的核心能力属于 Sudoku**，提示的使用管理属于 Game。

理由：

- `getCandidates(row, col)` 和 `findNakedSingle()` 是纯粹的盘面分析能力——它们读取 board 数据并基于数独规则（行列宫排除法）进行推理，不涉及任何游戏状态（undo/redo、历史、模式切换等）。这与 Sudoku 已有的 `findConflicts()` 和 `isSolved()` 属于同一类别：对盘面数据的"查询"。

- Game 负责"何时使用提示"和"如何使用提示"：例如 `applyHint` 需要求解器辅助（solveSudoku），求解结果通过 `guess()` 流入 Game 的历史管理机制，产生可撤销的操作记录。这属于 Game 的协调职责。

- 如果将来需要多等级提示（如"仅提示位置"vs"直接填答案"），核心分析逻辑仍然在 Sudoku 中演进（如添加 `findHiddenSingle()` 等），而 Game 仅需调整调度策略。

## 3. 你如何实现探索模式？

探索模式采用**临时子会话（Sub-Session）**方案。

### 核心状态

Game 新增以下状态字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `_mode` | `'normal' \| 'exploring'` | 当前会话模式 |
| `_exploreSnapshot` | `Sudoku \| null` | 进入探索前的盘面快照 |
| `_exploreUndoStack` | `Sudoku[]` | 探索模式独立的撤销栈 |
| `_exploreRedoStack` | `Sudoku[]` | 探索模式独立的重做栈 |
| `_failedBranches` | `Set<string>` | 已确认失败的盘面哈希集合 |

### 生命周期

```
normal ──beginExplore()──→ exploring ──commitExplore()──→ normal
                              │  ↑
                              │  backtrackExplore()
                              │
                              └──abandonExplore()──→ normal
```

**进入探索（beginExplore）**：
1. 保存当前盘面快照到 `_exploreSnapshot`
2. 切换到 `exploring` 模式
3. 初始化独立的历史栈（`_exploreUndoStack` / `_exploreRedoStack`）
4. 清空 `_failedBranches`

**在探索中操作**：
- `guess()` 使用探索独立的 undo/redo 栈
- 每次 guess 后检测冲突：若有冲突调用 `markFailedBranch()` 记录当前盘面哈希
- 每次 guess 前检查目标盘面是否命中已知的失败分支
- `undo()` / `redo()` 操作探索独立栈

**提交（commitExplore）**：
- 将探索前的快照压入主 `_undoStack`
- 依次将探索过程中的每个快照压入主 `_undoStack`
- 当前最终状态也压入主栈
- 清空主 `_redoStack`
- 恢复到 normal 模式，清理探索状态

**放弃（abandonExplore）**：
- 将 `_current` 恢复为 `_exploreSnapshot` 的克隆
- 主历史栈不变
- 恢复到 normal 模式，清理探索状态

**回溯（backtrackExplore）**：
- 将 `_current` 恢复为 `_exploreSnapshot` 的克隆
- 重置探索历史栈
- **保留** `_failedBranches`（跨路径记忆）

### 冲突检测与失败记忆

- guess 前调用 `recordPreGuessState()` 记录当前冲突数
- guess 后调用 `hasNewConflicts()`：仅在盘面从 0 冲突→>0 冲突时（即本次 guess 首次引入冲突），才调用 `markFailedBranch()`
- 同一分支上后续 guess 即使加剧冲突，也不重复计数——一条失败分支只计一次
- guess 前在克隆盘面上模拟填入并计算哈希，若命中 `_failedBranches`，拒绝填入并通过 toast 提示用户
- 回溯时保留 `_failedBranches`，跨路径记忆

## 4. 主局面与探索局面的关系是什么？

**是独立的深拷贝对象，而非共享引用。**

| 方面 | 设计 |
|------|------|
| 数据隔离 | 探索模式使用 `_current` 的独立拷贝；`_exploreSnapshot` 是进入探索时的深拷贝快照 |
| 深拷贝问题 | 不存在。Sudoku 的 `clone()` 方法已确保二维数组完全独立（每行 `slice()`），探索过程中的修改不会污染主局面 |
| 提交合并 | 通过"重放"方式：将探索过程中的所有快照依次压入主历史栈，主 `_current` 更新为探索最终状态。对主历史而言，相当于完成了一系列操作 |
| 放弃回滚 | 直接将 `_current` 替换为 `_exploreSnapshot` 的克隆，主历史不受影响 |

**为何选择深拷贝而非共享对象：**

- 安全性：探索中的任何修改都不会意外影响主局面，放弃时不需要反向计算
- 简单性：不像命令模式需要维护正向/反向操作序列，快照方式在 9x9 数独上几乎没有性能开销
- 独立性：探索模式拥有完全独立的历史栈，不污染主历史的 Undo/Redo 语义

## 5. 你的 history 结构在本次作业中是否发生了变化？

**主 history 结构保持线性双栈不变**，但在探索模式中引入了**临时分支**。

### 主 history（normal 模式）

```
_undoStack: [S0, S1, S2, S3]
_redoStack: [S4]

当前: clone of _undoStack[last]
```

线性栈结构完全保留，Undo/Redo 行为与 HW1 一致。

### 探索 history（exploring 模式）

```
_undoStack:          [S0, S1, ...]  ← 主栈（冻结）
_exploreUndoStack:   [E0, E1, E2]  ← 探索栈（活跃）
_exploreRedoStack:   []

当前: clone of _exploreUndoStack[last]
```

探索拥有独立的双栈，与主栈互不干扰。

### 提交后的 history

```
_undoStack: [S0, S1, _exploreSnapshot, E1, E2, ..., E_final]
_redoStack: []
```

探索过程被"展平"为线性序列附加到主栈尾部。**未引入树状分支**，主历史仍然为线性结构。

提交后的一个 Undo 可以逐步回退探索中的每一步，符合用户预期。

### 设计取舍

如果将来需要支持多层嵌套探索或 DAG 合并，当前的线性 + 临时分支结构可能需要重构为真正的树状结构。但在 HW2 范围内（明确不要求嵌套探索和 DAG 合并），当前的简单方案足够且正确。

## 6. Homework 1 中的哪些设计，在 Homework 2 中暴露出了局限？

**1. Game 缺少"模式"概念**

HW1 的 Game 是单一状态机：只有 normal 运行模式。添加探索模式时，必须在 Game 中引入 `_mode` 字段，并在 guess/undo/redo 等方法中增加模式分支。如果 HW1 就预留了可扩展的模式枚举，HW2 的改动会更加局部。

**2. history 的线性假设**

HW1 的双栈历史假设操作序列是严格线性的。探索模式天然引入了"分支"概念（尝试一条路径，可能回溯换另一条）。虽然本次通过独立探索栈解决了问题（提交时展平为线性），但这种"展平"丢失了分支的结构信息——如果将来需要可视化探索树，线性历史无法还原。

**3. Sudoku 缺少盘面分析接口**

HW1 的 Sudoku 只有 `findConflicts()` 和 `isSolved()` 两个盘面查询方法。添加提示功能时，需要新增 `getCandidates()`、`findNakedSingle()`、`hashBoard()` 等方法。如果 HW1 就考虑到提示/求解等扩展方向，可以提前设计一个更完整的盘面查询接口。

**4. gameStore 的 hint 耦合**

HW1.1 的 gameStore 中 `applyHint` 直接依赖 `@mattflow/sudoku-solver`（外部求解器）。提示功能本应通过领域对象提供，但"直接填答案"类型的提示需要求解器辅助。这里存在一个设计张力：求解能力属于 Sudoku 还是外部工具？本次选择让 Game 层协调（调用求解器 → Sudoku 填入 → Game 管理历史），但如果 Sudoku 自身就具备求解能力（如 `Sudoku.solve()`），层次会更加清晰。

## 7. 如果重做一次 Homework 1，你会如何修改原设计？

**1. 为 Game 引入状态枚举**

```js
// HW1 改进
this._state = 'normal'; // 为后续扩展预留
```

这样 HW2 添加 explore 模式时，只需增加枚举值，无需修改现有状态检查逻辑的结构。

**2. 为 Sudoku 设计更完整的查询接口**

```js
// HW1 改进
class Sudoku {
  getCandidates(row, col) { /* ... */ }
  findAllCandidates() { /* 返回所有格子的候选数 */ }
}
```

将 `getCandidates` 提前到 HW1 实现（即使 UI 暂不使用），HW2 的提示功能就可以直接消费这些接口。

**3. Game 的序列化应包含模式信息**

```js
// HW1 改进
toJSON() {
  return {
    mode: this._mode,
    current: this._current.toJSON(),
    // ...
  };
}
```

这样 HW2 的探索模式序列化（保存探索前快照而非当前状态）有统一的结构。

**4. 将 history 栈抽象为独立类**

```js
// HW1 改进
class HistoryStack {
  push(snapshot) { /* ... */ }
  undo() { /* ... */ }
  redo() { /* ... */ }
}
```

HW2 的探索模式需要独立的历史栈。如果 HW1 就将历史栈抽象为可复用的类，探索模式只需 `new HistoryStack()` 即可获得独立的 Undo/Redo 能力。

**5. 为 Game 的 guess 预留返回值扩展**

```js
// HW1 改进
guess(move) {
  // ...
  return {
    success: true,
    warnings: [], // 预留：失败分支警告等
    conflicts: [], // 预留：新产生的冲突
  };
}
```

HW2 中，guess 在探索模式下需要额外返回"是否命中失败分支"等信息。如果 HW1 就预留了 warnings/conflicts 字段，HW2 的扩展不会改变现有返回值结构。

---

---

## 8. HW1.1 Review 反馈及本次修正

HW1.1 的 code review（con-oo-yuanshan0303/review.txt）指出了以下核心问题，在本次 HW2 中均已修正：

### 修正 1：冲突输入行为（review core issue #1）

**问题**：`Sudoku.guess()` 以 `_hasConflict` 拒绝冲突输入，但 UI 保留了冲突高亮路径（`conflictingNumber`），导致"领域模型与 UI 业务语义相互打架"。

**修正**：移除 `guess()` 中的 `_hasConflict` 检查。用户可填入任意数字，冲突格通过 `findConflicts()` 和 UI 高亮展示。这与原始模板的"允许填入 + 标红提示"语义一致。

### 修正 2：findConflicts 返回类型（review issue #3）

**问题**：`findConflicts()` 返回 `"col,row"` 字符串，UI 坐标编码泄露进领域层。

**修正**：改为返回 `{ row, col }` 对象数组。gameStore 适配层负责转换为 Board 需要的 `"x,y"` 字符串格式。

### 修正 3：提示求解基准

**问题**：`applyHint` 对用户当前盘面求解（`solveSudoku(currentGrid)`），若用户填入了错误数字，求解器可能返回不同的解或求解失败，导致提示无效。

**修正**：改为对原始题面求解（`solveSudoku(initialGrid)`）。原始题面有唯一解，提示始终返回正确答案。

---

## 9. 加分项实现

### 1. 提示原因说明 ✅

`Sudoku.getCandidatesWithExplanation(row, col)` 返回每个被排除数字的具体原因（如 "row 1 already has 5"），`findNakedSingle()` 返回的 hint 对象包含 `explanation` 字段。

### 2. 区分"仅提示位置"和"直接填写答案" ✅

UI 提供三种提示操作：
- **候选提示**（? 按钮）：显示光标格的候选数面板，不消耗提示次数（纯计算，不揭示答案）
- **仅显示位置**（眼睛按钮）：找到下一步推定位置并显示，消耗 1 次提示
- **自动填入**（灯泡按钮）：找到推定位置并直接填入，消耗 1 次提示

后两者消耗相同（揭示的信息相同），区别仅在呈现方式。

### 3. 探索模式独立 Undo/Redo ✅

探索模式拥有独立的 `_exploreUndoStack` / `_exploreRedoStack`，与主历史隔离。探索中的 Undo/Redo 不影响主局面。

### 4. 探索失败分支精确追踪 ✅

引入 `_preGuessConflictCount` 和 `hasNewConflicts()` 机制：仅当本次 guess 引入了**新的**冲突（相比 guess 前），才标记为失败分支。避免了"已有冲突存在时每次填数都误标记"的 bug。

### 5. 较完整测试 ✅

新增 `tests/hw2/01-hint.test.js`（9 个用例）和 `tests/hw2/02-explore.test.js`（9 个用例），覆盖候选提示、下一步提示、探索生命周期、冲突追踪、失败记忆、独立 Undo/Redo 等核心路径。

### 6. 优雅的状态建模 ✅

Game 的探索模式采用 `_mode: 'normal' | 'exploring'` 状态切换 + 独立历史栈的临时子会话方案，而非在 guess/undo/redo 方法中大量 if-else。探索状态字段封装在 `_explore*` 命名空间下，与主状态清晰分离。

---

## 总结

HW2 在 HW1.1 的稳定对象模型上，通过以下演进完成了功能增长：

- **提示**：在 Sudoku 上新增盘面分析能力（getCandidates / getCandidatesWithExplanation / findNakedSingle），Game 层协调外部求解器提供"直接填答案"型提示。UI 提供候选提示、位置提示、自动填入三种操作
- **探索**：引入临时子会话机制（独立历史栈 + 快照 + 回滚 + 失败分支记忆），在保留主历史线性结构的前提下支持分支尝试
- **修正**：根据 HW1.1 review 修正了冲突输入行为、findConflicts 返回类型、提示求解基准

核心原则得到了保持：Sudoku 仍然是核心领域对象，Game 仍然负责会话、状态与历史，新增功能体现在已有对象的演进中而非推倒重来。

---

## 10. 项目亮点

### 三层提示体系
候选提示（免费）→ 下一步-仅显示（扣1次）→ 下一步-自动填入（扣1次），层层递进。无 naked single 时给出明确反馈引导用户进入 Explore，而非静默失败。

### 探索模式精确冲突追踪
`recordPreGuessState()` + `hasNewConflicts()` 实现 0→1 冲突检测，一条分支只计一次失败，避免无效计数。失败盘面哈希记忆 + toast 提示，跨路径去重。

### 完整测试覆盖
HW1 15 用例 + HW2 18 用例 = 33 用例，覆盖合同、基本行为、克隆、Undo/Redo、序列化、候选提示（含解释）、下一步提示、Naked Single 查找、探索生命周期、冲突追踪、失败记忆、独立 Undo/Redo。

### Review 驱动改进
根据 HW1.1 的 code review 修正了三个核心问题：冲突输入行为对齐产品语义、findConflicts 返回类型去 UI 耦合、提示求解基准锁定原始题面。

### 领域层无 UI 污染
`findConflicts()` 返回 `{row, col}` 通用对象，gameStore 适配层转换为 `"x,y"` 字符串供 Board 消费。候选提示、探索状态全在领域对象中，Actions.svelte 只做事件转发。
