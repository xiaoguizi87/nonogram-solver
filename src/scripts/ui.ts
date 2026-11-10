import { validatePuzzle, type Grid, type PuzzleInput, type SolveResult } from './solver';

interface EditorState extends PuzzleInput {}
const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};
const rowList = $<HTMLDivElement>('#row-clues');
const columnList = $<HTMLDivElement>('#column-clues');
const widthInput = $<HTMLInputElement>('#width');
const heightInput = $<HTMLInputElement>('#height');
const feedback = $<HTMLDivElement>('#feedback');
const errorsBox = $<HTMLDivElement>('#errors');
const board = $<HTMLCanvasElement>('#board');
const placeholder = $<HTMLDivElement>('#board-placeholder');
const detail = $<HTMLParagraphElement>('#result-detail');
const solveButton = $<HTMLButtonElement>('#solve');
const cancelButton = $<HTMLButtonElement>('#cancel');
const undoButton = $<HTMLButtonElement>('#undo');
const downloadButton = $<HTMLButtonElement>('#download');
const sizeNote = $<HTMLParagraphElement>('#size-note');

let state: EditorState = { width: 5, height: 5, rows: Array(5).fill(''), columns: Array(5).fill('') };
const history: EditorState[] = [];
let focusedSnapshot: EditorState | null = null;
let solution: Grid | null = null;
let worker: Worker | null = null;

const snapshot = (): EditorState => ({ width: state.width, height: state.height, rows: [...state.rows], columns: [...state.columns] });
const sameState = (a: EditorState, b: EditorState): boolean =>
  a.width === b.width && a.height === b.height && a.rows.every((v, i) => v === b.rows[i]) && a.columns.every((v, i) => v === b.columns[i]);

function pushHistory(previous: EditorState): void {
  if (sameState(previous, state)) return;
  history.push(previous);
  if (history.length > 100) history.shift();
  undoButton.disabled = false;
}

function setFeedback(message: string, tone: 'idle' | 'working' | 'success' | 'warning' | 'error' = 'idle'): void {
  feedback.className = `feedback ${tone}`;
  feedback.textContent = message;
}

function showErrors(messages: string[]): void {
  errorsBox.replaceChildren();
  errorsBox.hidden = messages.length === 0;
  if (messages.length) {
    const list = document.createElement('ul');
    for (const message of messages) {
      const item = document.createElement('li');
      item.textContent = message;
      list.append(item);
    }
    errorsBox.append(list);
  }
}

function stopWorker(): void {
  worker?.terminate();
  worker = null;
  cancelButton.hidden = true;
  solveButton.disabled = false;
}

function clearResult(): void {
  if (worker) stopWorker();
  solution = null;
  board.hidden = true;
  placeholder.hidden = false;
  downloadButton.disabled = true;
  detail.textContent = '';
  showErrors([]);
}

function makeField(kind: 'row' | 'column', index: number, value: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'clue-field';
  label.htmlFor = `${kind}-${index + 1}`;
  const caption = document.createElement('span');
  caption.textContent = `${kind === 'row' ? 'Row' : 'Column'} ${index + 1}`;
  const input = document.createElement('input');
  input.id = label.htmlFor;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.placeholder = 'e.g. 1 3';
  input.dataset.kind = kind;
  input.dataset.index = String(index);
  input.setAttribute('aria-label', `${caption.textContent} clues`);
  input.value = value;
  label.append(caption, input);
  return label;
}

function renderFields(): void {
  rowList.replaceChildren(...state.rows.map((value, index) => makeField('row', index, value)));
  columnList.replaceChildren(...state.columns.map((value, index) => makeField('column', index, value)));
  widthInput.value = String(state.width);
  heightInput.value = String(state.height);
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach((button) => {
    const size = Number(button.dataset.size);
    button.classList.toggle('active', state.width === size && state.height === size);
    button.setAttribute('aria-pressed', String(state.width === size && state.height === size));
  });
}

function commitFocusedEdit(): void {
  if (focusedSnapshot) pushHistory(focusedSnapshot);
  focusedSnapshot = null;
}

function applySize(width: number, height: number): void {
  if (!Number.isInteger(width) || width < 5 || width > 25 || !Number.isInteger(height) || height < 5 || height > 25) {
    widthInput.value = String(state.width);
    heightInput.value = String(state.height);
    setFeedback('Width and height must each be a whole number from 5 to 25.', 'error');
    return;
  }
  if (width === state.width && height === state.height) return;
  commitFocusedEdit();
  const previous = snapshot();
  const removed = Math.max(0, state.height - height) + Math.max(0, state.width - width);
  state = {
    width, height,
    rows: Array.from({ length: height }, (_, i) => state.rows[i] ?? ''),
    columns: Array.from({ length: width }, (_, i) => state.columns[i] ?? '')
  };
  pushHistory(previous);
  clearResult();
  renderFields();
  sizeNote.textContent = removed
    ? `Size changed to ${width} × ${height}. ${removed} clue ${removed === 1 ? 'field was' : 'fields were'} removed; remaining clues were kept. Use Undo to restore them.`
    : `Size changed to ${width} × ${height}. Existing clues were kept; new fields are blank.`;
  setFeedback('Grid size updated. Review your clues before solving.');
}

document.querySelectorAll<HTMLButtonElement>('.preset').forEach((button) => {
  button.addEventListener('click', () => applySize(Number(button.dataset.size), Number(button.dataset.size)));
});
widthInput.addEventListener('change', () => applySize(Number(widthInput.value), state.height));
heightInput.addEventListener('change', () => applySize(state.width, Number(heightInput.value)));

document.querySelector('.input-panel')?.addEventListener('focusin', (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.dataset.kind) focusedSnapshot = snapshot();
});
document.querySelector('.input-panel')?.addEventListener('focusout', (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.dataset.kind) commitFocusedEdit();
});
document.querySelector('.input-panel')?.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.kind) return;
  const index = Number(input.dataset.index);
  if (input.dataset.kind === 'row') state.rows[index] = input.value;
  else state.columns[index] = input.value;
  clearResult();
  setFeedback('Clues changed. Solve again to see the updated result.');
});

$<HTMLButtonElement>('#example').addEventListener('click', () => {
  commitFocusedEdit();
  const previous = snapshot();
  state = { width: 5, height: 5, rows: ['1', '3', '5', '3', '1'], columns: ['1', '3', '5', '3', '1'] };
  pushHistory(previous);
  clearResult();
  renderFields();
  sizeNote.textContent = 'Loaded the 5 × 5 diamond example. Your previous clues can be restored with Undo.';
  setFeedback('Example loaded. Select Solve Puzzle to reveal the diamond.');
});

undoButton.addEventListener('click', () => {
  commitFocusedEdit();
  const previous = history.pop();
  if (!previous) return;
  state = previous;
  undoButton.disabled = history.length === 0;
  clearResult();
  renderFields();
  setFeedback('Previous clue edit restored.');
});

$<HTMLButtonElement>('#reset').addEventListener('click', () => {
  commitFocusedEdit();
  if (!window.confirm('Clear all clues and the current result? You can use Undo to restore your clues.')) return;
  const previous = snapshot();
  state = { ...state, rows: Array(state.height).fill(''), columns: Array(state.width).fill('') };
  pushHistory(previous);
  clearResult();
  renderFields();
  setFeedback('Clues cleared. Use Undo to restore them.');
});

function drawGrid(canvas: HTMLCanvasElement, grid: Grid, cell: number): void {
  const width = grid[0].length;
  const height = grid.length;
  canvas.width = width * cell + 1;
  canvas.height = height * cell + 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#19352e';
  grid.forEach((row, r) => row.forEach((filled, c) => {
    if (filled) ctx.fillRect(c * cell, r * cell, cell, cell);
  }));
  for (let c = 0; c <= width; c++) {
    ctx.beginPath();
    ctx.strokeStyle = c % 5 === 0 || c === width ? '#30483f' : '#a6b9b1';
    ctx.lineWidth = c % 5 === 0 || c === width ? Math.max(1.5, cell * 0.055) : Math.max(1, cell * 0.025);
    ctx.moveTo(c * cell + 0.5, 0);
    ctx.lineTo(c * cell + 0.5, height * cell);
    ctx.stroke();
  }
  for (let r = 0; r <= height; r++) {
    ctx.beginPath();
    ctx.strokeStyle = r % 5 === 0 || r === height ? '#30483f' : '#a6b9b1';
    ctx.lineWidth = r % 5 === 0 || r === height ? Math.max(1.5, cell * 0.055) : Math.max(1, cell * 0.025);
    ctx.moveTo(0, r * cell + 0.5);
    ctx.lineTo(width * cell, r * cell + 0.5);
    ctx.stroke();
  }
}

function showResult(result: SolveResult): void {
  stopWorker();
  if (result.solution) {
    solution = result.solution;
    drawGrid(board, solution, 32);
    board.hidden = false;
    placeholder.hidden = true;
    downloadButton.disabled = false;
    board.setAttribute('aria-label', `${state.width} by ${state.height} solved nonogram grid`);
  }
  const duration = `${(result.elapsedMs / 1000).toFixed(2)} s`;
  if (result.status === 'unique') setFeedback(`Unique Solution · solved in ${duration}`, 'success');
  else if (result.status === 'multiple') setFeedback(`Multiple Solutions · found in ${duration}`, 'warning');
  else if (result.status === 'none') setFeedback(`No Solution · checked in ${duration}`, 'error');
  else if (result.status === 'limit') setFeedback(`Timeout / Search Limit Reached · ${duration}`, 'warning');
  else setFeedback('Invalid Clues', 'error');
  if (result.status === 'multiple') detail.textContent = 'These clues allow more than one grid. One valid solution is shown.';
  else if (result.status === 'limit') detail.textContent = `${result.reason ?? 'Search stopped at its limit.'} ${result.solution ? 'One valid grid was found, but uniqueness is unproven.' : 'No conclusion about solvability was reached.'}`;
  else if (result.status === 'none') detail.textContent = 'The clues are individually valid but contradict each other. Check all rows and columns.';
  else if (result.status === 'unique') detail.textContent = 'This grid matches every row and column clue.';
  showErrors(result.errors);
}

solveButton.addEventListener('click', () => {
  commitFocusedEdit();
  clearResult();
  const checked = validatePuzzle(state);
  if (checked.errors.length) {
    setFeedback('Invalid Clues', 'error');
    showErrors(checked.errors);
    return;
  }
  setFeedback('Solving puzzle…', 'working');
  solveButton.disabled = true;
  cancelButton.hidden = false;
  const activeWorker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  worker = activeWorker;
  activeWorker.onmessage = (event: MessageEvent<SolveResult>) => {
    if (worker === activeWorker) showResult(event.data);
  };
  activeWorker.onerror = () => {
    if (worker !== activeWorker) return;
    stopWorker();
    setFeedback('The solver could not complete this search. Please try again.', 'error');
  };
  activeWorker.postMessage(snapshot());
});

cancelButton.addEventListener('click', () => {
  stopWorker();
  setFeedback('Search cancelled. Your clues are still here.', 'warning');
});

downloadButton.addEventListener('click', () => {
  if (!solution) return;
  const png = document.createElement('canvas');
  drawGrid(png, solution, 48);
  const link = document.createElement('a');
  link.href = png.toDataURL('image/png');
  link.download = `nonogram-${state.width}x${state.height}.png`;
  document.body.append(link);
  link.click();
  link.remove();
});
