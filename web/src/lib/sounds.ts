let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function tone(freq: number, duration: number, volume = 0.06) {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export function playTapSound(critical = false) {
  tone(critical ? 920 : 520, critical ? 0.18 : 0.1, critical ? 0.09 : 0.05);
  if (critical) setTimeout(() => tone(1240, 0.12, 0.07), 40);
}

export function playConnectSound() {
  tone(660, 0.08, 0.04);
  setTimeout(() => tone(880, 0.1, 0.04), 60);
}
