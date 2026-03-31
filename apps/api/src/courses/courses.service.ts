import { Injectable, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { readCourseSeedItems, upsertCourses } from "./courses.seed";
import { CoursesRepository } from "./courses.repository";
import type { CourseCatalogItemDto } from "./courses.types";

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
    const seedItems = readCourseSeedItems(this.runtimeConfig.coursesSeedSourceFile);
    await upsertCourses(this.databaseService, seedItems);
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
