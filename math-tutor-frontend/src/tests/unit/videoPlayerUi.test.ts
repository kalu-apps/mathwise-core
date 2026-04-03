import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VideoPlayer } from "@/entities/lesson/ui/VideoPlayer";
import { shouldShowVideoPlayerLoading } from "@/entities/lesson/model/videoPlayerUi";

describe("video player runtime ui polish", () => {
  it("renders glass polyhedron preview scene with compact lesson-start CTA", () => {
    const markup = renderToStaticMarkup(
      createElement(VideoPlayer, {
        src: "https://cdn.example.com/lesson.mp4",
      })
    );

    expect(markup).toContain("video-player__polyhedron-scene");
    expect(markup).toContain("video-player__poster-grid");
    expect(markup).toContain("Смотреть урок");
    expect(markup).not.toContain("Подготовить видео");
  });

  it("does not render old technical placeholder copy", () => {
    const markup = renderToStaticMarkup(
      createElement(VideoPlayer, {
        src: "https://cdn.example.com/lesson.mp4",
      })
    );

    expect(markup).not.toContain("Поток подготовлен к запуску");
    expect(markup).not.toContain("Добавьте poster, чтобы сократить визуальные скачки до запуска.");
  });

  it("does not render default teacher/watermark badge without explicit watermark text", () => {
    const markup = renderToStaticMarkup(
      createElement(VideoPlayer, {
        src: "https://cdn.example.com/lesson.mp4",
      })
    );

    expect(markup).not.toContain("Protected stream");
  });

  it("shows custom loading overlay only for initial startup phase", () => {
    expect(
      shouldShowVideoPlayerLoading({
        isActivated: true,
        isBuffering: true,
        playbackError: null,
        hasRenderedFirstFrame: false,
      })
    ).toBe(true);

    expect(
      shouldShowVideoPlayerLoading({
        isActivated: true,
        isBuffering: true,
        playbackError: null,
        hasRenderedFirstFrame: true,
      })
    ).toBe(false);
  });
});
