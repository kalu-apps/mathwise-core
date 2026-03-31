import { Controller, Get, Param, Query } from "@nestjs/common";
import { LessonsService } from "./lessons.service";
import type { LessonDto } from "./lessons.types";

@Controller()
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get("api/lessons")
  async getLessons(@Query("courseId") courseId?: string): Promise<LessonDto[]> {
    return this.lessonsService.getLessons({
      courseId: courseId?.trim() || undefined,
    });
  }

  @Get("api/lessons/:id")
  async getLessonById(@Param("id") lessonId: string): Promise<LessonDto | null> {
    return this.lessonsService.getLessonById(lessonId);
  }

  @Get("api/courses/:courseId/lessons")
  async getLessonsByCourse(
    @Param("courseId") courseId: string
  ): Promise<LessonDto[]> {
    return this.lessonsService.getLessons({
      courseId: courseId.trim(),
    });
  }
}
