const roundToSecondMinutes = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round(minutes * 60);
};

export const formatLessonDuration = (durationInMinutes: number) => {
  const totalSeconds = roundToSecondMinutes(Number(durationInMinutes));
  if (totalSeconds <= 0) return "0 сек";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  if (seconds > 0) parts.push(`${seconds} сек`);

  return parts.length > 0 ? parts.join(" ") : "0 сек";
};

export const videoSecondsToStoredMinutes = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const wholeSeconds = Math.round(seconds);
  return Math.round((wholeSeconds / 60) * 10000) / 10000;
};
