export const shouldShowVideoPlayerLoading = (params: {
  isActivated: boolean;
  isBuffering: boolean;
  playbackError: string | null;
  hasRenderedFirstFrame: boolean;
}) =>
  params.isActivated &&
  params.isBuffering &&
  !params.playbackError &&
  !params.hasRenderedFirstFrame;

