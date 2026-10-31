let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** Browsers block audio until the user has interacted with the page, so unlock the context on the first gesture. */
export function unlockNotificationSound(): () => void {
  const unlock = () => { void context()?.resume(); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
}

/** Two-note chime. Silent (never throws) if audio is unavailable or still locked. */
export function playNotificationSound(): void {
  try {
    const c = context();
    if (!c || c.state !== "running") return;
    const start = c.currentTime;
    [[880, 0], [1318.5, 0.14]].forEach(([freq, offset]) => {
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.35);
      osc.connect(gain).connect(c.destination);
      osc.start(start + offset); osc.stop(start + offset + 0.4);
    });
  } catch { /* sound is a nicety; ignore failures */ }
}
