import type { Booking } from "@/entities/booking/model/types";
import type { Course } from "@/entities/course/model/types";
import type { Lesson } from "@/entities/lesson/model/types";
import type { Purchase } from "@/entities/purchase/model/types";
import type { User } from "@/entities/user/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";

export type ProfileMeResponseContract = User | null;

export type AboutTeacherAssetContract = {
  key: string;
  fileName: string;
  url: string;
  contentType: string;
};

export type AboutTeacherPublicContentResponseContract = {
  avatar: AboutTeacherAssetContract | null;
  diplomas: AboutTeacherAssetContract[];
  reviews: AboutTeacherAssetContract[];
};

export type HomeHeroAssetResponseContract = {
  routeAsset: AboutTeacherAssetContract | null;
};

export type StudentProfileContextResponseContract = {
  profile: User | null;
  courses: Course[];
  lessons: Lesson[];
  purchases: Purchase[];
  bookings: Booking[];
  teachers: User[];
  teacherAvailabilityByTeacherId: Record<string, AvailabilitySlot[]>;
};

export type TeacherDashboardContextResponseContract = {
  profile: User | null;
  courses: Course[];
  lessons: Lesson[];
  students: User[];
  bookings: Booking[];
  availability: AvailabilitySlot[];
};

export type TeacherInviteStatusContract =
  | "active"
  | "expired"
  | "consumed"
  | "revoked"
  | "invalid";

export type TeacherInviteResponseContract = {
  id: string;
  teacherId: string;
  status: Exclude<TeacherInviteStatusContract, "invalid">;
  targetEmailCanonical?: string;
  note?: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  consumedByUserId?: string;
};

export type TeacherInviteCreateResponseContract = {
  ok: true;
  invite: TeacherInviteResponseContract;
  inviteUrl: string;
};

export type TeacherInviteInspectResponseContract = {
  ok: true;
  status: TeacherInviteStatusContract;
  inviteId: string | null;
  teacher:
    | {
        id: string;
        firstName: string;
        lastName: string;
        photo?: string;
      }
    | null;
  targetEmailMasked?: string;
  expiresAt: string | null;
  canAccept: boolean;
  requiresAuth: boolean;
  requiresEmailMatch: boolean;
};

export type TeacherInviteAcceptResponseContract = {
  ok: true;
  inviteId: string;
  teacherId: string;
  studentId: string;
  accepted: boolean;
  sessionEstablished: boolean;
  nextPath: string;
};
