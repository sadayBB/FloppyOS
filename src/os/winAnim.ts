/** Windows-2000-style minimize/restore: the window shrinks toward (or grows from) its taskbar button. */
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const winEl = (id: string) => document.querySelector<HTMLElement>(`[data-win="${id}"]`);

function rects(id: string) {
  const win = winEl(id);
  const btn = document.querySelector<HTMLElement>(`[data-taskbtn="${id}"]`);
  if (!win || !btn) return null;
  const a = win.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const sx = b.width / Math.max(1, a.width);
  const sy = b.height / Math.max(1, a.height);
  const dx = b.left - a.left;
  const dy = b.top - a.top;
  return { win, to: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` };
}

/** Removes finished/leftover window animations (call once the window is already hidden). */
export function clearWindowAnim(id: string) {
  winEl(id)?.getAnimations().forEach((a) => a.cancel());
}

/**
 * Shrinks the window into its taskbar button. The final frame is held (fill: forwards) so the
 * window never pops back to full size before it gets hidden; call clearWindowAnim afterwards.
 */
export function animateMinimize(id: string): Promise<void> {
  const r = rects(id);
  if (!r || reduced() || !r.win.animate) return Promise.resolve();
  r.win.getAnimations().forEach((a) => a.cancel());
  r.win.style.transformOrigin = '0 0';
  const anim = r.win.animate([{ transform: 'none', opacity: 1 }, { transform: r.to, opacity: 0 }], { duration: 220, easing: 'steps(6, end)', fill: 'forwards' });
  // Never block minimizing on the animation (hidden tabs pause animations).
  const timeout = new Promise<void>((res) => setTimeout(res, 300));
  return Promise.race([anim.finished.then(() => undefined, () => undefined), timeout]);
}

export function animateRestore(id: string) {
  requestAnimationFrame(() => {
    const r = rects(id);
    if (!r) return;
    r.win.getAnimations().forEach((a) => a.cancel()); // drop any held minimize frame
    if (reduced() || !r.win.animate) return;
    r.win.style.transformOrigin = '0 0';
    r.win.animate([{ transform: r.to, opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'steps(6, end)' });
  });
}
