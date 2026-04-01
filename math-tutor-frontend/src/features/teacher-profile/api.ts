import { readStorage, writeStorage } from "@/shared/lib/localDb";
import type { TeacherProfile } from "./model/types";

const buildTeacherProfileStorageKey = (userId: string) =>
  `teacher-profile:v1:${userId}`;

export async function getTeacherProfile(userId: string): Promise<TeacherProfile> {
  return readStorage<TeacherProfile>(buildTeacherProfileStorageKey(userId), {
    firstName: "",
    lastName: "",
    about: "",
    experience: [],
    achievements: [],
    diplomas: [],
    photo: "",
  });
}

export async function saveTeacherProfile(
  userId: string,
  profile: TeacherProfile
): Promise<TeacherProfile> {
  writeStorage<TeacherProfile>(buildTeacherProfileStorageKey(userId), profile);
  return profile;
}
