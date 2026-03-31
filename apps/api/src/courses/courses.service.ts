import { Injectable, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { CoursesRepository } from "./courses.repository";
import type { CourseCatalogItemDto } from "./courses.types";
import { readReadSliceSeedData, upsertCourses } from "../seed/readSlice.seed";

@Injectable()
export class CoursesService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly coursesRepository: CoursesRepository
  ) {}

  async onModuleInit() {
    await this.coursesRepository.ensureSchema();
    if (!this.runtimeConfig.coursesSeedOnBoot) return;
    const hasData = await this.coursesRepository.hasAnyCourses();
    if (hasData) return;
    const seed = readReadSliceSeedData(this.runtimeConfig.coursesSeedSourceFile);
    await upsertCourses(this.databaseService, seed.courses);
  }

  async getCatalog(): Promise<CourseCatalogItemDto[]> {
    return this.coursesRepository.findAll();
  }

  async getById(courseId: string): Promise<CourseCatalogItemDto | null> {
    const normalizedId = courseId.trim();
    if (!normalizedId) return null;
    return this.coursesRepository.findById(normalizedId);
  }
}
