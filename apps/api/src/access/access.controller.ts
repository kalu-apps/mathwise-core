import { Controller, Get, Param, Query } from "@nestjs/common";
import { AccessService } from "./access.service";
import type {
  CourseAccessDecisionDto,
  CourseAccessListResponseDto,
  LessonAccessDecisionDto,
} from "./access.types";

@Controller("api/access")
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get("courses")
  async getCourseAccessList(
    @Query("userId") userId?: string
  ): Promise<CourseAccessListResponseDto> {
    return this.accessService.getCourseAccessList(userId?.trim());
  }

  @Get("courses/:courseId")
  async getCourseAccessDecision(
    @Param("courseId") courseId: string,
    @Query("userId") userId?: string
  ): Promise<CourseAccessDecisionDto> {
    return this.accessService.getCourseAccessDecision(
      courseId.trim(),
      userId?.trim()
    );
  }

  @Get("lessons/:lessonId")
  async getLessonAccessDecision(
    @Param("lessonId") lessonId: string,
    @Query("userId") userId?: string
  ): Promise<LessonAccessDecisionDto> {
    return this.accessService.getLessonAccessDecision(
      lessonId.trim(),
      userId?.trim()
    );
  }
}
