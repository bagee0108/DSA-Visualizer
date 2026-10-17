/** The viewBox every renderer draws into; its aspect is what the dock letterboxes against. */

export const VIEW_W = 1000;
export const VIEW_H = 520;

/** "1 node", "3 nodes": for the canvas's accessible name. */
export function counted(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}
