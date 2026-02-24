export type UserRole = "student" | "teacher";

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
  photo?: string;
};
