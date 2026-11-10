import { solvePuzzle, type PuzzleInput } from './solver';

self.onmessage = (event: MessageEvent<PuzzleInput>) => {
  try {
    self.postMessage(solvePuzzle(event.data));
  } catch {
    self.postMessage({ status: 'limit', errors: [], elapsedMs: 0, nodes: 0, reason: 'The search stopped unexpectedly. Please try again.' });
  }
};
