import fs from "fs";
import { mapUnknownCourseToDto } from "../courses/courses.mapper";
import type { CourseCatalogItemDto } from "../courses/courses.types";
import { resolveCourseVisualMetadata } from "../courses/courses.visuals";
import { mapUnknownLessonToDto } from "../lessons/lessons.mapper";
import type { LessonDto } from "../lessons/lessons.types";

type SeedExecutor = {
  execute: (text: string, params?: unknown[]) => Promise<void>;
};

type SourcePayload = {
  courses?: unknown;
  lessons?: unknown;
  users?: unknown;
  identity?: unknown;
  purchases?: unknown;
  entitlements?: unknown;
};

type AccessUserSeed = {
  id: string;
  email: string;
  role: "student" | "teacher";
  isIdentityVerified: boolean;
};

type UserCourseAccessSeed = {
  userId: string;
  courseId: string;
  hasActiveEntitlement: boolean;
};

export type ReadSliceSeedData = {
  courses: CourseCatalogItemDto[];
  lessons: LessonDto[];
  access: {
    users: AccessUserSeed[];
    courseAccess: UserCourseAccessSeed[];
  };
};

const normalizeRole = (value: unknown): "student" | "teacher" | null => {
  return value === "student" || value === "teacher" ? value : null;
};

const isIdentityVerifiedState = (value: unknown) => value === "verified";

export const readReadSliceSeedData = (sourceFile: string): ReadSliceSeedData => {
  if (!fs.existsSync(sourceFile)) {
    return {
      courses: [],
      lessons: [],
      access: { users: [], courseAccess: [] },
    };
  }

  try {
    const raw = fs.readFileSync(sourceFile, "utf-8");
    const parsed = JSON.parse(raw) as SourcePayload;

    const courses = Array.isArray(parsed.courses)
      ? parsed.courses
          .map((item) => mapUnknownCourseToDto(item))
          .filter((item): item is CourseCatalogItemDto => Boolean(item))
      : [];

    const lessons = Array.isArray(parsed.lessons)
      ? parsed.lessons
          .map((item) => mapUnknownLessonToDto(item))
          .filter((item): item is LessonDto => Boolean(item))
      : [];

    const users = Array.isArray(parsed.users)
      ? parsed.users
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const rawUser = item as Record<string, unknown>;
            const id = typeof rawUser.id === "string" ? rawUser.id : "";
            const email = typeof rawUser.email === "string" ? rawUser.email : "";
            const role = normalizeRole(rawUser.role);
            if (!id || !role) return null;
            return {
              id,
              email,
              role,
            };
          })
          .filter(
            (item): item is { id: string; email: string; role: "student" | "teacher" } =>
              Boolean(item)
          )
      : [];

    const verifiedUserIds = new Set(
      Array.isArray(parsed.identity)
        ? parsed.identity
            .map((item) => {
              if (!item || typeof item !== "object") return null;
              const rawIdentity = item as Record<string, unknown>;
              const userId =
                typeof rawIdentity.userId === "string" ? rawIdentity.userId : null;
              const state = rawIdentity.state;
              if (!userId || !isIdentityVerifiedState(state)) return null;
              return userId;
            })
            .filter((item): item is string => Boolean(item))
        : []
    );

    const accessUsers: AccessUserSeed[] = users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      isIdentityVerified:
        user.role === "teacher" ? true : verifiedUserIds.has(user.id),
    }));

    const activeAccessByUserCourse = new Map<string, UserCourseAccessSeed>();
    const addActiveAccess = (userId: string, courseId: string) => {
      if (!userId || !courseId) return;
      const key = `${userId}:${courseId}`;
      activeAccessByUserCourse.set(key, {
        userId,
        courseId,
        hasActiveEntitlement: true,
      });
    };

    if (Array.isArray(parsed.purchases)) {
      for (const entry of parsed.purchases) {
        if (!entry || typeof entry !== "object") continue;
        const rawPurchase = entry as Record<string, unknown>;
        const userId = typeof rawPurchase.userId === "string" ? rawPurchase.userId : "";
        const courseId =
          typeof rawPurchase.courseId === "string" ? rawPurchase.courseId : "";
        addActiveAccess(userId, courseId);
      }
    }

    if (Array.isArray(parsed.entitlements)) {
      for (const entry of parsed.entitlements) {
        if (!entry || typeof entry !== "object") continue;
        const rawEntitlement = entry as Record<string, unknown>;
        if (
          rawEntitlement.kind === "course_access" &&
          rawEntitlement.state === "active"
        ) {
          const userId =
            typeof rawEntitlement.userId === "string" ? rawEntitlement.userId : "";
          const courseId =
            typeof rawEntitlement.courseId === "string" ? rawEntitlement.courseId : "";
          addActiveAccess(userId, courseId);
        }
      }
    }

    return {
      courses,
      lessons,
      access: {
        users: accessUsers,
        courseAccess: [...activeAccessByUserCourse.values()],
      },
    };
  } catch {
    return {
      courses: [],
      lessons: [],
      access: { users: [], courseAccess: [] },
    };
  }
};

export const upsertCourses = async (
  executor: SeedExecutor,
  courses: CourseCatalogItemDto[]
) => {
  if (courses.length === 0) return;
  for (const course of courses) {
    const visual = resolveCourseVisualMetadata(course.id, {
      visualStyle: course.visualStyle,
      visualSeed: course.visualSeed,
      visualPalette: course.visualPalette,
      visualVariant: course.visualVariant,
    });
    await executor.execute(
      `
        INSERT INTO courses_catalog (
          id,
          title,
          description,
          level,
          price_guided,
          price_self,
          teacher_id,
          status,
          visual_style,
          visual_seed,
          visual_palette,
          visual_variant,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          level = EXCLUDED.level,
          price_guided = EXCLUDED.price_guided,
          price_self = EXCLUDED.price_self,
          teacher_id = EXCLUDED.teacher_id,
          status = EXCLUDED.status,
          visual_style = EXCLUDED.visual_style,
          visual_seed = EXCLUDED.visual_seed,
          visual_palette = EXCLUDED.visual_palette,
          visual_variant = EXCLUDED.visual_variant,
          updated_at = NOW()
      `,
      [
        course.id,
        course.title,
        course.description,
        course.level,
        Math.round(course.priceGuided),
        Math.round(course.priceSelf),
        course.teacherId,
        course.status,
        visual.visualStyle,
        visual.visualSeed,
        visual.visualPalette,
        visual.visualVariant,
      ]
    );
  }
};

export const upsertLessons = async (executor: SeedExecutor, lessons: LessonDto[]) => {
  if (lessons.length === 0) return;
  for (const lesson of lessons) {
    await executor.execute(
      `
        INSERT INTO course_lessons (
          id,
          course_id,
          title,
          sort_order,
          duration_sec,
          video_media_object_id,
          video_url,
          video_stream_url,
          video_poster_url,
          media_job_id,
          media_job_status,
          media_job_error,
          materials_json,
          settings_json,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12,
          $13::jsonb, $14::jsonb, NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          course_id = EXCLUDED.course_id,
          title = EXCLUDED.title,
          sort_order = EXCLUDED.sort_order,
          duration_sec = EXCLUDED.duration_sec,
          video_media_object_id = EXCLUDED.video_media_object_id,
          video_url = EXCLUDED.video_url,
          video_stream_url = EXCLUDED.video_stream_url,
          video_poster_url = EXCLUDED.video_poster_url,
          media_job_id = EXCLUDED.media_job_id,
          media_job_status = EXCLUDED.media_job_status,
          media_job_error = EXCLUDED.media_job_error,
          materials_json = EXCLUDED.materials_json,
          settings_json = EXCLUDED.settings_json,
          updated_at = NOW()
      `,
      [
        lesson.id,
        lesson.courseId,
        lesson.title,
        Math.max(1, Math.floor(lesson.order)),
        Math.max(0, Math.floor(lesson.duration)),
        lesson.videoMediaObjectId ?? null,
        lesson.videoUrl ?? null,
        lesson.videoStreamUrl ?? null,
        lesson.videoPosterUrl ?? null,
        lesson.mediaJobId ?? null,
        lesson.mediaJobStatus ?? null,
        lesson.mediaJobError ?? null,
        JSON.stringify(lesson.materials ?? null),
        JSON.stringify(lesson.settings ?? null),
      ]
    );
  }
};

export const upsertAccessReadModel = async (
  executor: SeedExecutor,
  access: ReadSliceSeedData["access"]
) => {
  for (const user of access.users) {
    await executor.execute(
      `
        INSERT INTO access_users (
          id, email, role, is_identity_verified, updated_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          is_identity_verified = EXCLUDED.is_identity_verified,
          updated_at = NOW()
      `,
      [user.id, user.email, user.role, user.isIdentityVerified]
    );
  }

  for (const item of access.courseAccess) {
    await executor.execute(
      `
        INSERT INTO user_course_access (
          user_id, course_id, has_active_entitlement, updated_at
        )
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, course_id)
        DO UPDATE SET
          has_active_entitlement = EXCLUDED.has_active_entitlement,
          updated_at = NOW()
      `,
      [item.userId, item.courseId, item.hasActiveEntitlement]
    );
  }
};
