<script>
  import { candidates } from '@sudoku/stores/candidates';
  import { cursor } from '@sudoku/stores/cursor';
  import { hints } from '@sudoku/stores/hints';
  import { notes } from '@sudoku/stores/notes';
  import { settings } from '@sudoku/stores/settings';
  import { keyboardDisabled } from '@sudoku/stores/keyboard';
  import { gamePaused } from '@sudoku/stores/game';
  import { gameStore } from '@sudoku/stores/gameStore';

  const { canUndo, canRedo, isExploring, exploreHasConflicts, exploreFailedBranches, grid: currentGrid, lastMessage } = gameStore;

  $: hintsAvailable = $hints > 0;
  $: cursorCellValue = ($cursor.x !== null && $cursor.y !== null) ? $currentGrid[$cursor.y][$cursor.x] : -1;

  // 候选提示：仅在用户点击后显示
  let showCandidates = false;
  let candidatesData = null;

  // 下一步提示结果
  let hintResult = null;
  let hintMode = 'show'; // 'show' = 仅提示位置, 'fill' = 自动填入

  function dismissMessage() {
    lastMessage.set(null);
  }

  // 光标移动时关闭候选面板（数据已过期）
  $: if (showCandidates && $cursor.x !== null && $cursor.y !== null) {
    // 记录触发时的光标位置，用于检测移动
  }
  $: cursorKey = $cursor.x + ',' + $cursor.y;
  $: if (showCandidates && cursorKey !== candidatesCursorKey) {
    showCandidates = false;
    candidatesData = null;
  }

  let candidatesCursorKey = null;

  /* ========== 提示 — 类型 1：候选提示 ========== */
  function handleCandidateHint() {
    if ($cursor.x === null || $cursor.y === null) return;
    if (cursorCellValue !== 0) return;
    candidatesData = gameStore.getCandidatesInfo($cursor.y, $cursor.x);
    candidatesCursorKey = $cursor.x + ',' + $cursor.y;
    showCandidates = true;
    hintResult = null;
  }

  function hideCandidateHint() {
    showCandidates = false;
    candidatesData = null;
    candidatesCursorKey = null;
  }

  /* ========== 提示 — 类型 2：下一步提示 ========== */

  /**
   * 仅显示下一步提示位置（不自动填入）。
   * 仅在成功找到可推定格子时消耗 1 次提示。
   */
  function handleNextHintShow() {
    if (!hintsAvailable) return;
    const hint = gameStore.findHintCell();
    if (!hint) {
      hintResult = null;
      return;
    }
    // 找到才消耗
    hints.useHint();
    hintResult = hint;
    hintMode = 'show';
    showCandidates = false;
    candidatesData = null;
  }

  /**
   * 自动填入下一步提示的值。
   * 仅在成功找到可推定格子时消耗 1 次提示。
   */
  function handleNextHintFill() {
    if (!hintsAvailable) return;
    const hint = gameStore.findHintCell();
    if (!hint) {
      hintResult = null;
      return;
    }
    // 找到才消耗
    hints.useHint();
    // 清除光标格的草稿标记
    if ($candidates.hasOwnProperty($cursor.x + ',' + $cursor.y)) {
      candidates.clear($cursor);
    }
    gameStore.guess({ row: hint.row, col: hint.col, value: hint.value });
    hintResult = hint;
    hintMode = 'fill';
    showCandidates = false;
    candidatesData = null;
  }

  /* ========== Undo / Redo ========== */
  function handleUndo() {
    hintResult = null;
    showCandidates = false;
    gameStore.undo();
  }

  function handleRedo() {
    hintResult = null;
    showCandidates = false;
    gameStore.redo();
  }

  /* ========== Explore ========== */
  function handleExplore() {
    hintResult = null;
    showCandidates = false;
    gameStore.beginExplore();
  }

  function handleCommit() {
    gameStore.commitExplore();
  }

  function handleAbandon() {
    gameStore.abandonExplore();
  }

  function handleBacktrack() {
    hintResult = null;
    gameStore.backtrackExplore();
  }
</script>

<div class="action-buttons space-x-3">

  <button class="btn btn-round" disabled={$gamePaused || !$canUndo} on:click={handleUndo} title="Undo">
    <svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  </button>

  <button class="btn btn-round" disabled={$gamePaused || !$canRedo} on:click={handleRedo} title="Redo">
    <svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 90 00-8 8v2M21 10l-6 6m6-6l-6-6" />
    </svg>
  </button>

  <!-- 候选提示：显示光标格的候选数（不消耗提示次数） -->
  <button class="btn btn-round" disabled={$keyboardDisabled || cursorCellValue !== 0} on:click={handleCandidateHint} title="Candidate hint: show possible values for this cell">
    <svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  </button>

  <!-- 下一步提示：仅显示位置（消耗1次提示） -->
  <button class="btn btn-round" disabled={$keyboardDisabled || !hintsAvailable} on:click={handleNextHintShow} title="Next step hint: show deducible cell (uses 1 hint)">
    <svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  </button>

  <!-- 下一步提示：自动填入（消耗1次提示） -->
  <button class="btn btn-round" disabled={$keyboardDisabled || !hintsAvailable} on:click={handleNextHintFill} title="Auto-fill hint: fill next deducible cell (uses 1 hint)">
    <svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  </button>

  <!-- 提示剩余次数（两个下一步提示共用） -->
  {#if $settings.hintsLimited}
    <span class="hint-count" class:depleted={!hintsAvailable}>{$hints}</span>
  {/if}

  <button class="btn btn-round btn-badge" on:click={notes.toggle} title="Notes ({$notes ? 'ON' : 'OFF'})">
    <svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
    <span class="badge tracking-tighter" class:badge-primary={$notes}>{$notes ? 'ON' : 'OFF'}</span>
  </button>

</div>

<!-- Toast 消息 -->
{#if $lastMessage}
  <div class="toast mt-2" class:toast-warn={$lastMessage.type === 'warn'} class:toast-info={$lastMessage.type === 'info'}>
    <span class="text-xs">{$lastMessage.text}</span>
    <button class="text-xs ml-2 opacity-50 hover:opacity-100" on:click={dismissMessage}>✕</button>
  </div>
{/if}

<!-- 候选提示面板（仅在用户点击后显示） -->
{#if showCandidates && candidatesData && candidatesData.candidates.length > 0}
  <div class="hint-panel mt-2">
    <div class="flex justify-between items-center">
      <span class="text-xs font-semibold">Cell ({$cursor.y + 1},{$cursor.x + 1}) candidates:</span>
      <button class="text-xs text-gray-400 hover:text-gray-600" on:click={hideCandidateHint}>✕</button>
    </div>
    <span class="text-base font-bold text-primary">{candidatesData.candidates.join(', ')}</span>
    {#if candidatesData.eliminated.length > 0}
      <div class="text-xs text-gray-400 mt-1">
        Eliminated: {candidatesData.eliminated.map(e => `${e.value}(${e.reason})`).join(', ')}
      </div>
    {/if}
  </div>
{/if}

<!-- 下一步提示结果 -->
{#if hintResult}
  <div class="hint-panel mt-2">
    <span class="text-xs font-semibold">
      {hintMode === 'show' ? 'Hint:' : 'Filled:'}
      Cell ({hintResult.row + 1},{hintResult.col + 1}) = {hintResult.value}
    </span>
    {#if hintResult.explanation}
      <div class="text-xs text-gray-400 mt-1">{hintResult.explanation}</div>
    {/if}
  </div>
{/if}

<!-- HW2: Explore mode controls -->
<div class="explore-bar mt-3" class:explore-active={$isExploring}>
  {#if !$isExploring}
    <button class="btn btn-small btn-explore" disabled={$gamePaused} on:click={handleExplore} title="Enter explore mode when no cell can be deduced">
      <svg class="icon-outline inline w-4 h-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Explore
    </button>
  {:else}
    <span class="explore-label text-xs font-semibold mr-2">EXPLORING</span>
    {#if $exploreHasConflicts}
      <span class="text-xs text-red-500 mr-2">Conflict!</span>
    {/if}
    {#if $exploreFailedBranches > 0}
      <span class="text-xs text-gray-500 mr-2">{$exploreFailedBranches} failed</span>
    {/if}
    <button class="btn btn-small btn-success mr-1" on:click={handleCommit}>Commit</button>
    <button class="btn btn-small btn-warning mr-1" on:click={handleBacktrack}>Backtrack</button>
    <button class="btn btn-small btn-danger" on:click={handleAbandon}>Abandon</button>
  {/if}
</div>


<style>
  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-evenly;
    align-self: flex-end;
  }

  .btn-badge {
    position: relative;
  }

  .badge {
    min-height: 20px;
    min-width: 20px;
    padding: 0.25rem;
    border-radius: 9999px;
    line-height: 1;
    text-align: center;
    font-size: 0.75rem;
    color: white;
    background-color: #4b5563;
    display: inline-block;
    position: absolute;
    top: 0;
    left: 0;
  }

  .badge-primary { background-color: #1d4ed8; }

  .hint-panel {
    background-color: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    text-align: left;
  }

  .explore-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }

  .explore-active {
    background-color: #fff7ed;
    border-radius: 0.5rem;
    padding: 0.5rem;
    border: 1px solid #fdba74;
  }

  .btn-explore { background-color: #f97316; color: white; }
  .btn-explore:hover { background-color: #ea580c; }

  .btn-success { background-color: #22c55e; color: white; }
  .btn-success:hover { background-color: #16a34a; }

  .btn-warning { background-color: #eab308; color: white; }
  .btn-warning:hover { background-color: #ca8a04; }

  .btn-danger { background-color: #ef4444; color: white; }
  .btn-danger:hover { background-color: #dc2626; }

  .explore-label {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .hint-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 0.35rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    background-color: #1d4ed8;
    color: white;
    align-self: center;
  }
  .hint-count.depleted {
    background-color: #9ca3af;
  }

  .toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.6rem;
    border-radius: 0.5rem;
    text-align: left;
  }
  .toast-info {
    background-color: #dbeafe;
    border: 1px solid #93c5fd;
    color: #1e40af;
  }
  .toast-warn {
    background-color: #fef3c7;
    border: 1px solid #fcd34d;
    color: #92400e;
  }
</style>
