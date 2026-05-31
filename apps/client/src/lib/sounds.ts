'use client';

type SoundName =
  | 'tool-call'
  | 'success'
  | 'click'
  | 'listening'
  | 'speaking'
  | 'connecting'
  | 'loading';

const cache = new Map<SoundName, AudioBuffer>();
let ctx: AudioContext | null = null;
let loadingSource: AudioBufferSourceNode | null = null;
let enabled = true;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

async function load(name: SoundName): Promise<AudioBuffer | null> {
  if (cache.has(name)) return cache.get(name)!;
  const context = getContext();
  if (!context) return null;
  try {
    const res = await fetch(`/sounds/${name}.mp3`);
    const raw = await res.arrayBuffer();
    const buffer = await context.decodeAudioData(raw);
    cache.set(name, buffer);
    return buffer;
  } catch {
    return null;
  }
}

function play(buffer: AudioBuffer, volume = 1.0): AudioBufferSourceNode | null {
  const context = getContext();
  if (!context) return null;
  const gain = context.createGain();
  gain.gain.value = volume;
  gain.connect(context.destination);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.start();
  return source;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

export function preloadSounds(
  names: SoundName[] = ['tool-call', 'success', 'click', 'listening', 'speaking', 'connecting'],
) {
  for (const name of names) {
    void load(name);
  }
}

export async function playSound(name: SoundName, volume = 0.6): Promise<void> {
  if (!enabled) return;
  const buffer = await load(name);
  if (buffer) play(buffer, volume);
}

export async function startLoadingSound(): Promise<void> {
  if (!enabled || loadingSource) return;
  const buffer = await load('loading');
  if (!buffer) return;
  const context = getContext();
  if (!context) return;
  const gain = context.createGain();
  gain.gain.value = 0.3;
  gain.connect(context.destination);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start();
  loadingSource = source;
}

export function stopLoadingSound(): void {
  if (!loadingSource) return;
  try {
    loadingSource.stop();
  } catch {
    // already stopped
  }
  loadingSource = null;
}
