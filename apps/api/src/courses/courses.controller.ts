import { Controller, Get, Param } from "@nestjs/common";
import type { CourseCatalogItemDto } from "./courses.types";
import { CoursesService } from "./courses.service";

@Controller("api/courses")
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async getCatalog(): Promise<CourseCatalogItemDto[]> {
    return this.coursesService.getCatalog();
  }

  @Get(":id")
  async getCourseById(
    @Param("id") courseId: string
  ): Promise<CourseCatalogItemDto | null> {
    return this.coursesService.getById(courseId);
  }
}
