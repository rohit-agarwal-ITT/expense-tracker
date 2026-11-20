/** Run work after the browser can paint the route shell (keeps navigation under ~1s perceived). */
export function deferHeavyWork(work: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      setTimeout(work, 0);
    });
    return;
  }
  setTimeout(work, 0);
}