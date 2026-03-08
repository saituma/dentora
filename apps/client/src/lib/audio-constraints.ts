/**
 * Default audio constraints for microphone capture.
 * Enables browser-built-in noise suppression and echo cancellation so that
 * mainly the user's voice is captured and background/other voices are reduced.
 */
export const VOICE_FOCUSED_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Build getUserMedia audio constraint, optionally with a specific device.
 * Always includes voice-focused processing (noise suppression, etc.).
 */
export function getAudioConstraints(deviceId?: string): MediaTrackConstraints {
  const base = { ...VOICE_FOCUSED_AUDIO_CONSTRAINTS };
  if (deviceId) {
    return { ...base, deviceId: { exact: deviceId } };
  }
  return base;
}
