const AUDIO_WAVE_BARS = [
  38, 44, 35, 52, 40, 60, 42, 64, 48, 58, 34, 56, 44, 62, 37, 49, 33, 46,
  30, 42, 36, 55, 41, 63, 47, 59, 35, 54, 43, 61, 39, 50, 34, 45, 31, 40,
  37, 53, 46, 57,
];

const AUDIO_WAVE_DISPLAY_BARS = 52;

const resizeWaveform = (input: number[], targetBars: number): number[] => {
  if (input.length === 0) return [];
  if (input.length === targetBars) return input;
  return Array.from({ length: targetBars }, (_, index) => {
    const start = Math.floor((index * input.length) / targetBars);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * input.length) / targetBars)
    );
    let peak = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      const next = input[cursor] ?? 0;
      if (next > peak) peak = next;
    }
    return peak;
  });
};

export const buildAudioMessageWaveformBars = (
  waveform?: number[],
  targetBars = AUDIO_WAVE_DISPLAY_BARS
): number[] => {
  const sourceBars =
    Array.isArray(waveform) && waveform.length > 0
      ? waveform
          .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
          .map((item) => Math.max(8, Math.min(100, Math.round(item))))
          .slice(0, 96)
      : AUDIO_WAVE_BARS;
  const resizedBars = resizeWaveform(
    sourceBars.length > 0 ? sourceBars : AUDIO_WAVE_BARS,
    targetBars
  );
  return resizedBars.map((height, index) => {
    const previous = resizedBars[index - 1] ?? height;
    const next = resizedBars[index + 1] ?? height;
    return Math.max(8, Math.round(height * 0.68 + previous * 0.16 + next * 0.16));
  });
};
