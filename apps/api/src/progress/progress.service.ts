import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { LessonsRepository } from "../lessons/lessons.repository";
import { ProgressRepository } from "./progress.repository";

const nowIso = () => new Date().toISOString();

@Injectable()
export class ProgressService implements OnModuleInit {
  constructor(
    private readonly progressRepository: ProgressRepository,
    private readonly lessonsRepository: LessonsRepository
  ) {}

  async onModuleInit() {
    await this.progressRepository.ensureSchema();
  }

  async markLessonViewed(params: {
    actorUser: AuthUserDto | null;
    userId?: string;
    courseId: string;
    lessonId: string;
  }): Promise<void> {
    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const courseId = params.courseId.trim();
    const lessonId = params.lessonId.trim();
    if (!courseId || !lessonId) {
      throw new HttpException({ error: "courseId и lessonId обязательны." }, 400);
    }

    const lesson = await this.lessonsRepository.findPublishedById(lessonId);
    if (!lesson || lesson.courseId !== courseId) {
      throw new HttpException({ error: "Урок не найден." }, 404);
    }

    const targetUserId = this.resolveTargetUserId({
      actorUser,
      requestedUserId: params.userId,
      allowTeacherOverride: false,
    });

    await this.progressRepository.markLessonViewed({
      userId: targetUserId,
      courseId,
      lessonId,
      viewedAt: nowIso(),
    });
  }

  async getViewedLessonIds(params: {
    actorUser: AuthUserDto | null;
    userId?: string;
    courseId: string;
  }): Promise<string[]> {
    const actorUser = params.actorUser;
    if (!actorUser) {
      return [];
    }
    const courseId = params.courseId.trim();
    if (!courseId) return [];

    const targetUserId = this.resolveTargetUserId({
      actorUser,
      requestedUserId: params.userId,
      allowTeacherOverride: true,
    });

    return this.progressRepository.findViewedLessonIds({
      userId: targetUserId,
      courseId,
    });
  }

  async deleteProgressByCourse(params: {
    actorUser: AuthUserDto | null;
    userId?: string;
    courseId: string;
  }): Promise<void> {
    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const courseId = params.courseId.trim();
    if (!courseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }

    if (actorUser.role === "teacher") {
      if (params.userId?.trim()) {
        await this.progressRepository.deleteProgressByCourseForUser({
          userId: params.userId.trim(),
          courseId,
        });
        return;
      }
      await this.progressRepository.deleteProgressByCourse(courseId);
      return;
    }

    await this.progressRepository.deleteProgressByCourseForUser({
      userId: actorUser.id,
      courseId,
    });
  }

  private resolveTargetUserId(params: {
    actorUser: AuthUserDto;
    requestedUserId?: string;
    allowTeacherOverride: boolean;
  }): string {
    const requested = params.requestedUserId?.trim();
    if (params.actorUser.role === "teacher") {
      if (params.allowTeacherOverride && requested) {
        return requested;
      }
      return params.actorUser.id;
    }

    if (requested && requested !== params.actorUser.id) {
      throw new HttpException({ error: "Нельзя запрашивать прогресс другого пользователя." }, 403);
    }
    return params.actorUser.id;
  }
}
