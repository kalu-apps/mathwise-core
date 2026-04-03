import { describe, expect, it } from "vitest";
import { shouldOpenAdvancedMediaByDefault } from "@/features/course-editor/model/lessonMediaUi";

describe("lesson media advanced UI visibility", () => {
  it("keeps advanced section closed for normal teacher flow", () => {
    expect(
      shouldOpenAdvancedMediaByDefault({
        videoStreamUrl: "",
        videoUrl: "",
        videoPosterUrl: "",
      })
    ).toBe(false);
  });

  it("opens advanced section when technical media fields already exist", () => {
    expect(
      shouldOpenAdvancedMediaByDefault({
        videoStreamUrl: "https://cdn.example.com/lesson/master.m3u8",
      })
    ).toBe(true);
    expect(
      shouldOpenAdvancedMediaByDefault({
        videoUrl: "https://cdn.example.com/lesson/fallback.mp4",
      })
    ).toBe(true);
    expect(
      shouldOpenAdvancedMediaByDefault({
        videoPosterUrl: "https://cdn.example.com/lesson/poster.jpg",
      })
    ).toBe(true);
  });
});
