import { profileGateway } from "@/shared/gateway";
import type {
  AboutTeacherPublicContentResponseContract,
  HomeHeroAssetResponseContract,
  ProfileMeResponseContract,
  StudentProfileContextResponseContract,
  TeacherInviteAcceptResponseContract,
  TeacherInviteCreateResponseContract,
  TeacherInviteInspectResponseContract,
  TeacherDashboardContextResponseContract,
} from "@/shared/contracts/profile.contract";

export async function getProfileMe(): Promise<ProfileMeResponseContract> {
  return profileGateway.getProfileMe();
}

export async function getPublicAboutTeacherContent(): Promise<AboutTeacherPublicContentResponseContract> {
  return profileGateway.getPublicAboutTeacherContent();
}

export async function getPublicHomeHeroAsset(): Promise<HomeHeroAssetResponseContract> {
  return profileGateway.getPublicHomeHeroAsset();
}

export async function getStudentProfileContext(): Promise<StudentProfileContextResponseContract> {
  return profileGateway.getStudentProfileContext();
}

export async function getTeacherDashboardContext(): Promise<TeacherDashboardContextResponseContract> {
  return profileGateway.getTeacherDashboardContext();
}

export async function createTeacherInvite(payload?: {
  targetEmail?: string;
  note?: string;
}): Promise<TeacherInviteCreateResponseContract> {
  return profileGateway.createTeacherInvite(payload ?? {});
}

export async function inspectTeacherInvite(
  token: string
): Promise<TeacherInviteInspectResponseContract> {
  return profileGateway.inspectTeacherInvite(token);
}

export async function acceptTeacherInvite(payload: {
  token: string;
  registration?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    password?: string;
  };
}): Promise<TeacherInviteAcceptResponseContract> {
  return profileGateway.acceptTeacherInvite(payload);
}
