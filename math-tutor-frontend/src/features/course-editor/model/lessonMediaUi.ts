export type LessonMediaUiStateInput = {
  videoStreamUrl?: string;
  videoUrl?: string;
  videoPosterUrl?: string;
};

const hasTrimmedValue = (value?: string) => Boolean(value?.trim());

export const shouldOpenAdvancedMediaByDefault = (
  input: LessonMediaUiStateInput
) =>
  hasTrimmedValue(input.videoStreamUrl) ||
  hasTrimmedValue(input.videoUrl) ||
  hasTrimmedValue(input.videoPosterUrl);
