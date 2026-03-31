import { Injectable, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { LessonsRepository } from "./lessons.repository";
import type { LessonDto } from "./lessons.types";
import { readReadSliceSeedData, upsertLessons } from "../seed/readSlice.seed";

@Injectable()
export class LessonsService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly lessonsRepository: LessonsRepository
  ) {}

  async onModuleInit() {
    await this.lessonsRepository.ensureSchema();
    if (!this.runtimeConfig.coursesSeedOnBoot) return;
    const hasData = await this.lessonsRepository.hasAnyLessons();
    if (hasData) return;
    const seed = readReadSliceSeedData(this.runtimeConfig.coursesSeedSourceFile);
    await upsertLessons(this.databaseService, seed.lessons);
  }

  async getLessons(params?: { courseId?: string }): Promise<LessonDto[]> {
    return this.lessonsRepository.findAll(params?.courseId);
  }

  async getLessonById(lessonId: string): Promise<LessonDto | null> {
    const normalized = lessonId.trim();
    if (!normalized) return null;
    return this.lessonsRepository.findById(normalized);
  }
}
