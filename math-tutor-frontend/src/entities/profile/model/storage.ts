import { profileGateway } from "@/shared/gateway";
import type {
  ProfileMeResponseContract,
  StudentProfileContextResponseContract,
  TeacherDashboardContextResponseContract,
} from "@/shared/contracts/profile.contract";

export async function getProfileMe(): Promise<ProfileMeResponseContract> {
  return profileGateway.getProfileMe();
}

export async function getStudentProfileContext(): Promise<StudentProfileContextResponseContract> {
  return profileGateway.getStudentProfileContext();
}

export async function getTeacherDashboardContext(): Promise<TeacherDashboardContextResponseContract> {
  return profileGateway.getTeacherDashboardContext();
}
