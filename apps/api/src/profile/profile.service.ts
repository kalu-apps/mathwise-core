import { Injectable, OnModuleInit } from "@nestjs/common";
import { AuthRepository } from "../auth/auth.repository";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { CoursesRepository } from "../courses/courses.repository";
import { DatabaseService } from "../db/database.service";
import { markFullLessonContent, redactLessonForPreview } from "../lessons/lessons.redaction";
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
import type { AuthUserDto } from "../auth/auth.types";

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
    const profileUser = await this.authRepository.findById(userId);
    if (profileUser) {
      await this.profileRepository.attachGuestBookingsToStudentByEmail({
        userId,
        canonicalEmail: profileUser.email.toLowerCase(),
      });
    }

    const [profile, courses, lessons, purchases, bookings, teachers, entitlementRows] =
      await Promise.all([
        this.authRepository.findById(userId),
        this.coursesRepository.findAllPublishedCatalog(),
        this.lessonsRepository.findPublishedAll(),
        this.profileRepository.findPurchasesByUser(userId),
        this.profileRepository.findBookingsByStudent(userId),
        this.authRepository.findByRole("teacher"),
        this.databaseService.query<{ courseId: string }>(
          `
            SELECT course_id AS "courseId"
            FROM user_course_access
            WHERE user_id = $1
              AND has_active_entitlement = TRUE
          `,
          [userId]
        ),
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

    const entitledCourseIds = new Set<string>([
      ...purchases.map((purchase) => purchase.courseId),
      ...entitlementRows.map((item) => item.courseId),
    ]);

    const lessonsProjection = lessons.map((lesson) =>
      entitledCourseIds.has(lesson.courseId)
        ? markFullLessonContent(lesson)
        : redactLessonForPreview(lesson)
    );

    return {
      profile,
      courses,
      lessons: lessonsProjection,
      purchases,
      bookings,
      teachers,
      teacherAvailabilityByTeacherId,
    };
  }

  async getTeacherDashboardContext(
    teacherId: string
  ): Promise<TeacherDashboardContextDto> {
    const [profile, courses, bookings, availability, allStudents] =
      await Promise.all([
        this.authRepository.findById(teacherId),
        this.coursesRepository.findAllDraftsByTeacher(teacherId),
        this.profileRepository.findBookingsByTeacher(teacherId),
        this.profileRepository.findTeacherAvailabilityByTeacherId(teacherId),
        this.authRepository.findByRole("student"),
      ]);

    const courseIdSet = new Set(courses.map((course) => course.id));
    const lessonGroups = await Promise.all(
      courses.map((course) => this.lessonsRepository.findDraftByCourse(course.id))
    );
    const lessons = lessonGroups
      .flat()
      .filter((lesson) => courseIdSet.has(lesson.courseId));

    const purchaseRows =
      courses.length > 0
        ? await this.databaseService.query<{ userId: string }>(
            `
              SELECT DISTINCT user_id AS "userId"
              FROM profile_purchases
              WHERE course_id = ANY($1::text[])
            `,
            [courses.map((course) => course.id)]
          )
        : [];

    const relatedStudentIds = new Set<string>([
      ...bookings.map((booking) => booking.studentId),
      ...purchaseRows.map((row) => row.userId),
    ]);

    const students = allStudents.filter((student) =>
      relatedStudentIds.has(student.id)
    );

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

  async getPublicTeachers(): Promise<AuthUserDto[]> {
    return this.authRepository.findByRole("teacher");
  }

  async updateProfile(userId: string, patch: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    photo?: string;
  }): Promise<AuthUserDto | null> {
    return this.authRepository.updateUserProfile({
      userId,
      firstName: patch.firstName,
      lastName: patch.lastName,
      phone: patch.phone,
      photo: patch.photo,
    });
  }
}
