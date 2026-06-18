import crypto from "node:crypto";
import {
  HttpException,
  Inject,
  Injectable,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { AuthRepository } from "../auth/auth.repository";
import { SessionStore } from "../auth/session.store";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { CoursesRepository } from "../courses/courses.repository";
import { DatabaseService } from "../db/database.service";
import { markFullLessonContent, redactLessonForPreview } from "../lessons/lessons.redaction";
import { LessonsRepository } from "../lessons/lessons.repository";
import { MediaStorageService } from "../media/media.storage";
import { ensureId, normalizeEmail, validateEmailFormat } from "../purchases/purchases.helpers";
import {
  readProfileSeedData,
  upsertProfileBookings,
  upsertProfilePurchases,
  upsertTeacherAvailability,
} from "./profile.seed";
import { ProfileRepository } from "./profile.repository";
import type {
  AboutTeacherAssetDto,
  AboutTeacherPublicContentDto,
  AcceptTeacherInvitePayloadDto,
  AcceptTeacherInviteResponseDto,
  CreateTeacherInvitePayloadDto,
  CreateTeacherInviteResponseDto,
  HomeHeroAssetDto,
  StudentProfileContextDto,
  TeacherInviteInspectResponseDto,
  TeacherDashboardContextDto,
} from "./profile.types";
import type { AuthUserDto } from "../auth/auth.types";

const nowIso = () => new Date().toISOString();

const hashInviteToken = (token: string, pepper: string) =>
  crypto.createHash("sha256").update(`teacher_invite:${token}:${pepper}`).digest("hex");

const generateInviteToken = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "") + crypto.randomBytes(12).toString("hex")
    : crypto.randomBytes(28).toString("hex");

const maskEmail = (email: string) => {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "";
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
};

const ABOUT_TEACHER_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
]);

const HOME_HERO_ROUTE_ASSET_KEY =
  "hero_section/infinity_route_asset_transparent_2400_no_shadow.png";

const normalizeKeyFileName = (objectKey: string) => {
  const segments = objectKey.split("/");
  const last = segments[segments.length - 1];
  return last?.trim() || objectKey;
};

const resolveContentTypeByFileName = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
};

const isImageObjectKey = (objectKey: string) => {
  const lower = objectKey.toLowerCase();
  return Array.from(ABOUT_TEACHER_IMAGE_EXTENSIONS).some((extension) =>
    lower.endsWith(extension)
  );
};

@Injectable()
export class ProfileService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly profileRepository: ProfileRepository,
    private readonly authRepository: AuthRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly lessonsRepository: LessonsRepository,
    @Optional()
    @Inject(MediaStorageService)
    private readonly mediaStorageService: MediaStorageService | undefined,
    @Optional()
    @Inject(AuthService)
    private readonly authService: AuthService | undefined,
    @Optional()
    @Inject(SessionStore)
    private readonly sessionStore: SessionStore | undefined
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
    const [profile, courses, bookings, availability, allStudents, linkedStudentIds] =
      await Promise.all([
        this.authRepository.findById(teacherId),
        this.coursesRepository.findAllDraftsByTeacher(teacherId),
        this.profileRepository.findBookingsByTeacher(teacherId),
        this.profileRepository.findTeacherAvailabilityByTeacherId(teacherId),
        this.authRepository.findByRole("student"),
        this.profileRepository.findTeacherRelationStudentIds(teacherId),
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
      ...linkedStudentIds,
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

  async createTeacherInvite(params: {
    actorUser: AuthUserDto | null;
    payload: CreateTeacherInvitePayloadDto;
  }): Promise<CreateTeacherInviteResponseDto> {
    this.assertTeacherInvitesEnabled();
    const actor = params.actorUser;
    if (!actor) {
      throw new HttpException({ error: "Требуется авторизация.", code: "unauthorized" }, 401);
    }
    if (actor.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя.", code: "forbidden" }, 403);
    }

    const targetEmail = normalizeEmail(params.payload.targetEmail ?? "");
    if (targetEmail && !validateEmailFormat(targetEmail)) {
      throw new HttpException(
        { error: "Некорректный email ученика для приглашения.", code: "validation_failed" },
        400
      );
    }
    const note = params.payload.note?.trim() || undefined;
    const createdAt = nowIso();
    const expiresAt = new Date(
      Date.now() + this.runtimeConfig.teacherInviteTtlSec * 1000
    ).toISOString();
    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken, this.runtimeConfig.authPasswordPepper);

    const invite = await this.profileRepository.createTeacherInvite({
      id: ensureId("teacher_invite"),
      teacherId: actor.id,
      tokenHash,
      targetEmailCanonical: targetEmail || undefined,
      note,
      maxUses: 1,
      metadata: {
        createdBy: actor.id,
        source: "teacher_dashboard",
      },
      createdAt,
      expiresAt,
    });

    return {
      ok: true,
      invite,
      inviteUrl: `${this.runtimeConfig.corsOrigin}/invite?token=${encodeURIComponent(
        rawToken
      )}`,
    };
  }

  async inspectTeacherInvite(token: string): Promise<TeacherInviteInspectResponseDto> {
    this.assertTeacherInvitesEnabled();
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return {
        ok: true,
        status: "invalid",
        inviteId: null,
        teacher: null,
        expiresAt: null,
        canAccept: false,
        requiresAuth: true,
        requiresEmailMatch: false,
      };
    }
    const invite = await this.profileRepository.findTeacherInviteByTokenHash(
      hashInviteToken(normalizedToken, this.runtimeConfig.authPasswordPepper)
    );
    if (!invite) {
      return {
        ok: true,
        status: "invalid",
        inviteId: null,
        teacher: null,
        expiresAt: null,
        canAccept: false,
        requiresAuth: true,
        requiresEmailMatch: false,
      };
    }

    let status = invite.status;
    if (status === "active" && Date.parse(invite.expiresAt) <= Date.now()) {
      await this.profileRepository.markTeacherInviteExpired(invite.id);
      status = "expired";
    }

    return {
      ok: true,
      status,
      inviteId: invite.id,
      teacher: {
        id: invite.teacherId,
        firstName: invite.teacherFirstName?.trim() || "Преподаватель",
        lastName: invite.teacherLastName?.trim() || "",
        photo: invite.teacherPhoto ?? undefined,
      },
      targetEmailMasked: invite.targetEmailCanonical
        ? maskEmail(invite.targetEmailCanonical)
        : undefined,
      expiresAt: invite.expiresAt,
      canAccept: status === "active",
      requiresAuth: true,
      requiresEmailMatch: Boolean(invite.targetEmailCanonical),
    };
  }

  async acceptTeacherInvite(params: {
    actorUser: AuthUserDto | null;
    payload: AcceptTeacherInvitePayloadDto;
  }): Promise<AcceptTeacherInviteResponseDto & { sessionId?: string }> {
    this.assertTeacherInvitesEnabled();

    const token = params.payload.token?.trim() || "";
    if (!token) {
      throw new HttpException({ error: "Токен приглашения обязателен.", code: "validation_failed" }, 400);
    }
    const invite = await this.profileRepository.findTeacherInviteByTokenHash(
      hashInviteToken(token, this.runtimeConfig.authPasswordPepper)
    );
    if (!invite) {
      throw new HttpException({ error: "Ссылка-приглашение недействительна.", code: "invite_invalid" }, 404);
    }
    if (invite.status === "revoked") {
      throw new HttpException({ error: "Ссылка-приглашение отозвана.", code: "invite_revoked" }, 409);
    }
    if (invite.status === "consumed") {
      if (params.actorUser && invite.consumedByUserId === params.actorUser.id) {
        return {
          ok: true,
          inviteId: invite.id,
          teacherId: invite.teacherId,
          studentId: params.actorUser.id,
          accepted: true,
          sessionEstablished: false,
          nextPath: "/booking",
        };
      }
      throw new HttpException(
        { error: "Ссылка-приглашение уже использована.", code: "invite_consumed" },
        409
      );
    }
    if (invite.status === "expired" || Date.parse(invite.expiresAt) <= Date.now()) {
      await this.profileRepository.markTeacherInviteExpired(invite.id);
      throw new HttpException(
        { error: "Срок действия ссылки-приглашения истек.", code: "invite_expired" },
        409
      );
    }

    let resolvedStudent = params.actorUser;
    let sessionId: string | undefined;
    if (resolvedStudent?.role === "teacher") {
      throw new HttpException({ error: "Преподаватель не может принять приглашение ученика.", code: "forbidden" }, 403);
    }

    if (!resolvedStudent) {
      if (!this.authService || !this.sessionStore) {
        throw new HttpException({ error: "Invite onboarding временно недоступен.", code: "service_unavailable" }, 503);
      }
      const registration = params.payload.registration;
      const email = normalizeEmail(registration?.email ?? "");
      if (!email || !validateEmailFormat(email)) {
        throw new HttpException({ error: "Введите корректный email для регистрации.", code: "validation_failed" }, 400);
      }
      if (
        invite.targetEmailCanonical &&
        invite.targetEmailCanonical.toLowerCase() !== email.toLowerCase()
      ) {
        throw new HttpException(
          {
            error: "Эта ссылка привязана к другому email. Войдите в нужный аккаунт.",
            code: "invite_email_mismatch",
            nextAction: "login_required_existing_account",
          },
          409
        );
      }

      const existing = await this.authRepository.findByEmail(email);
      if (existing?.role === "teacher") {
        throw new HttpException(
          {
            error: "Этот email принадлежит преподавателю. Используйте аккаунт ученика.",
            code: "invite_role_conflict",
          },
          409
        );
      }
      if (existing?.role === "student" && existing.passwordHash) {
        throw new HttpException(
          {
            error: "Для этого email уже есть аккаунт. Войдите в него и повторите принятие приглашения.",
            code: "identity_conflict_auth_required",
            nextAction: "login_required_existing_account",
          },
          409
        );
      }

      const ensured = await this.authService.ensureUserByEmail({
        email,
        firstName: registration?.firstName,
        lastName: registration?.lastName,
        phone: registration?.phone,
      });
      resolvedStudent = ensured.user;
      const password = registration?.password ?? "";
      if (!password.trim()) {
        throw new HttpException(
          {
            error: "Для завершения регистрации задайте пароль.",
            code: "first_password_required",
          },
          400
        );
      }
      const passwordSave = await this.authService.setPassword({
        userId: resolvedStudent.id,
        newPassword: password,
      });
      if (!passwordSave.ok) {
        throw new HttpException(
          { error: passwordSave.message || "Не удалось сохранить пароль.", code: "validation_failed" },
          400
        );
      }

      await this.authService.syncIdentityCompletionAfterPurchase({
        userId: resolvedStudent.id,
        identityVerifiedHint: true,
        source: "teacher_invite_registration",
      });

      const createdSession = await this.sessionStore.createSession(resolvedStudent.id);
      if (!createdSession.ok) {
        throw new HttpException(
          {
            error:
              "Этот аккаунт уже открыт на другом устройстве или в другом браузере. Выйдите из предыдущей сессии либо повторите попытку после автоматического выхода при бездействии.",
            code: "session_already_active",
          },
          409
        );
      }
      sessionId = createdSession.session.id;
    }

    if (!resolvedStudent) {
      throw new HttpException({ error: "Не удалось определить аккаунт ученика.", code: "invite_invalid" }, 409);
    }
    if (resolvedStudent.role !== "student") {
      throw new HttpException({ error: "Приглашение доступно только ученику.", code: "forbidden" }, 403);
    }
    const studentEmail = normalizeEmail(resolvedStudent.email);
    if (
      invite.targetEmailCanonical &&
      invite.targetEmailCanonical.toLowerCase() !== studentEmail.toLowerCase()
    ) {
      throw new HttpException(
        {
          error: "Ссылка-приглашение привязана к другому email.",
          code: "invite_email_mismatch",
        },
        409
      );
    }

    const consumed = await this.profileRepository.consumeTeacherInviteAndLinkStudentAtomic({
      inviteId: invite.id,
      teacherId: invite.teacherId,
      studentId: resolvedStudent.id,
      consumedAt: nowIso(),
    });
    if (consumed.outcome === "missing") {
      throw new HttpException({ error: "Ссылка-приглашение недействительна.", code: "invite_invalid" }, 404);
    }
    if (consumed.outcome === "revoked") {
      throw new HttpException({ error: "Ссылка-приглашение отозвана.", code: "invite_revoked" }, 409);
    }
    if (consumed.outcome === "expired") {
      throw new HttpException({ error: "Срок действия ссылки-приглашения истек.", code: "invite_expired" }, 409);
    }
    if (
      consumed.outcome === "already_consumed" &&
      consumed.invite?.consumedByUserId !== resolvedStudent.id
    ) {
      throw new HttpException(
        { error: "Ссылка-приглашение уже использована.", code: "invite_consumed" },
        409
      );
    }

    return {
      ok: true,
      inviteId: invite.id,
      teacherId: invite.teacherId,
      studentId: resolvedStudent.id,
      accepted: true,
      sessionEstablished: Boolean(sessionId),
      sessionId,
      nextPath: "/booking",
    };
  }

  async getPublicTeachers(): Promise<AuthUserDto[]> {
    return this.authRepository.findByRole("teacher");
  }

  async getPublicAboutTeacherContent(): Promise<AboutTeacherPublicContentDto> {
    const [avatarAssets, diplomas, reviews] = await Promise.all([
      this.listPublicAboutTeacherAssets("avatar", 4),
      this.listPublicAboutTeacherAssets("diplomas", 24),
      this.listPublicAboutTeacherAssets("reviews", 24),
    ]);

    return {
      avatar: avatarAssets[0] ?? null,
      diplomas,
      reviews,
    };
  }

  async getPublicHomeHeroAsset(): Promise<HomeHeroAssetDto> {
    const routeAsset = await this.getSignedPublicAssetByKey(
      HOME_HERO_ROUTE_ASSET_KEY,
      "home-hero-route"
    );

    return {
      routeAsset,
    };
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

  private assertTeacherInvitesEnabled() {
    if (!this.runtimeConfig.teacherInvitesEnabled) {
      throw new HttpException(
        { error: "Teacher invite flow отключен в текущем runtime.", code: "teacher_invites_disabled" },
        404
      );
    }
  }

  private async listPublicAboutTeacherAssets(
    folder: "avatar" | "diplomas" | "reviews",
    limit: number
  ): Promise<AboutTeacherAssetDto[]> {
    const mediaStorageService = this.mediaStorageService;
    if (!mediaStorageService?.isEnabled()) {
      console.warn("[profile] about-teacher-media-storage-disabled", {
        folder,
        appEnv: this.runtimeConfig.appEnv,
      });
      return [];
    }

    const rootPrefix = `about_teacher/${folder}/`;
    const envScopedPrefix = `${this.runtimeConfig.appEnv}/about_teacher/${folder}/`;
    const prefixes =
      rootPrefix === envScopedPrefix
        ? [rootPrefix]
        : [rootPrefix, envScopedPrefix];
    try {
      const maxKeys = Math.max(limit * 3, limit);
      let usedPrefix = rootPrefix;
      let listed: Awaited<ReturnType<typeof mediaStorageService.listObjectsByPrefix>> =
        [];

      for (const prefix of prefixes) {
        const candidate = await mediaStorageService.listObjectsByPrefix({
          prefix,
          maxKeys,
        });
        if (candidate.length > 0) {
          listed = candidate;
          usedPrefix = prefix;
          break;
        }
      }

      const nonFolderObjects = listed
        .filter((item) => !item.key.endsWith("/"))
        .sort((a, b) => a.key.localeCompare(b.key, "ru", { sensitivity: "base" }));
      const imageObjects = nonFolderObjects.filter((item) => isImageObjectKey(item.key));
      const selectedObjects = (imageObjects.length > 0 ? imageObjects : nonFolderObjects).slice(
        0,
        limit
      );

      if (selectedObjects.length === 0) {
        console.warn("[profile] about-teacher-assets-empty", {
          folder,
          appEnv: this.runtimeConfig.appEnv,
          prefixes,
        });
        return [];
      }

      if (usedPrefix !== rootPrefix) {
        console.warn("[profile] about-teacher-assets-fallback-prefix", {
          folder,
          appEnv: this.runtimeConfig.appEnv,
          usedPrefix,
        });
      }

      const signed = await Promise.all(
        selectedObjects.map(async (item) => {
          const fileName = normalizeKeyFileName(item.key);
          const signedUrl = await mediaStorageService.createSignedDownloadUrl({
            objectKey: item.key,
          });
          return {
            key: item.key,
            fileName,
            url: signedUrl.url,
            contentType: resolveContentTypeByFileName(fileName),
          } satisfies AboutTeacherAssetDto;
        })
      );
      return signed;
    } catch (error) {
      console.error("[profile] about-teacher-assets-unavailable", {
        folder,
        appEnv: this.runtimeConfig.appEnv,
        prefixes,
        message: error instanceof Error ? error.message : "unknown_error",
      });
      return [];
    }
  }

  private async getSignedPublicAssetByKey(
    objectKey: string,
    scope: string
  ): Promise<AboutTeacherAssetDto | null> {
    const mediaStorageService = this.mediaStorageService;
    if (!mediaStorageService?.isEnabled()) {
      console.warn("[profile] public-media-storage-disabled", {
        scope,
        objectKey,
        appEnv: this.runtimeConfig.appEnv,
      });
      return null;
    }

    const rootKey = objectKey;
    const envScopedKey = `${this.runtimeConfig.appEnv}/${objectKey}`;
    const candidateKeys =
      rootKey === envScopedKey
        ? [rootKey]
        : [rootKey, envScopedKey];

    try {
      for (const candidateKey of candidateKeys) {
        const listed = await mediaStorageService.listObjectsByPrefix({
          prefix: candidateKey,
          maxKeys: 1,
        });
        const exactObject = listed.find((item) => item.key === candidateKey);
        if (!exactObject) continue;

        const fileName = normalizeKeyFileName(exactObject.key);
        const signedUrl = await mediaStorageService.createSignedDownloadUrl({
          objectKey: exactObject.key,
        });

        return {
          key: exactObject.key,
          fileName,
          url: signedUrl.url,
          contentType: resolveContentTypeByFileName(fileName),
        };
      }

      console.warn("[profile] public-media-asset-missing", {
        scope,
        appEnv: this.runtimeConfig.appEnv,
        candidateKeys,
      });
      return null;
    } catch (error) {
      console.error("[profile] public-media-asset-unavailable", {
        scope,
        appEnv: this.runtimeConfig.appEnv,
        candidateKeys,
        message: error instanceof Error ? error.message : "unknown_error",
      });
      return null;
    }
  }
}
