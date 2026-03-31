import { Injectable, OnModuleInit } from "@nestjs/common";
import { AuthRepository } from "../auth/auth.repository";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { CoursesRepository } from "../courses/courses.repository";
import { DatabaseService } from "../db/database.service";
import { LessonsRepository } from "../lessons/lessons.repository";
import {
  readProfileSeedData,
  upsertProfileBookings,
  upsertProfilePurchases,
  upsertTeacherAvailability,
} from "./profile.seed";
import { ProfileRepository } from "./profile.repository";
import type {
  StudentProfileContextDto,
  TeacherDashboardContextDto,
} from "./profile.types";

@Injectable()
export class ProfileService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly profileRepository: ProfileRepository,
    private readonly authRepository: AuthRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly lessonsRepository: LessonsRepository
  ) {}

  async onModuleInit() {
    await this.profileRepository.ensureSchema();
    if (!this.runtimeConfig.coursesSeedOnBoot) return;
    const hasAny = await this.profileRepository.hasAnyProfileData();
    if (hasAny) return;
    const seed = readProfileSeedData(this.runtimeConfig.coursesSeedSourceFile);
    const executor = {
      execute: async (text: string, params: unknown[] = []) => {
        await this.databaseService.execute(text, params);
      },
    };
    await upsertProfilePurchases(executor, seed.purchases);
    await upsertProfileBookings(executor, seed.bookings);
    await upsertTeacherAvailability(executor, seed.teacherAvailability);
  }

  async getStudentContext(userId: string): Promise<StudentProfileContextDto> {
    const [profile, courses, lessons, purchases, bookings, teachers] =
      await Promise.all([
        this.authRepository.findById(userId),
        this.coursesRepository.findAll(),
        this.lessonsRepository.findAll(),
        this.profileRepository.findPurchasesByUser(userId),
        this.profileRepository.findBookingsByStudent(userId),
        this.authRepository.findByRole("teacher"),
      ]);

    const availabilityRows =
      teachers.length > 0
        ? await this.profileRepository.findTeacherAvailabilityByTeacherIds(
            teachers.map((teacher) => teacher.id)
          )
        : [];
    const teacherAvailabilityByTeacherId: StudentProfileContextDto["teacherAvailabilityByTeacherId"] =
      {};
    for (const row of availabilityRows) {
      const list = teacherAvailabilityByTeacherId[row.teacherId] ?? [];
      list.push({
        id: row.id,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
      });
      teacherAvailabilityByTeacherId[row.teacherId] = list;
    }

    return {
      profile,
      courses,
      lessons,
      purchases,
      bookings,
      teachers,
      teacherAvailabilityByTeacherId,
    };
  }

  async getTeacherDashboardContext(
    teacherId: string
  ): Promise<TeacherDashboardContextDto> {
    const [profile, allCourses, allLessons, students, bookings, availability] =
      await Promise.all([
        this.authRepository.findById(teacherId),
        this.coursesRepository.findAll(),
        this.lessonsRepository.findAll(),
        this.authRepository.findByRole("student"),
        this.profileRepository.findBookingsByTeacher(teacherId),
        this.profileRepository.findTeacherAvailabilityByTeacherId(teacherId),
      ]);

    const courses = allCourses.filter((course) => course.teacherId === teacherId);
    const courseIdSet = new Set(courses.map((course) => course.id));
    const lessons = allLessons.filter((lesson) => courseIdSet.has(lesson.courseId));

    return {
      profile,
      courses,
      lessons,
      students,
      bookings,
      availability: availability.map((slot) => ({
        id: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    };
  }
}
