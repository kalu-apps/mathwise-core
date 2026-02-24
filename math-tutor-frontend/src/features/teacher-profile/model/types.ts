export type DiplomaFile = {
  id: string;
  name: string;
  type: "image" | "pdf";
  dataUrl: string;
  addedAt: string;
};

export type ExperienceItem = {
  id: string;
  title: string;
  place: string;
  period: string;
  description: string;
};

export type TeacherProfile = {
  firstName: string;
  lastName: string;
  about: string;
  experience: ExperienceItem[];
  achievements: string[];
  diplomas: DiplomaFile[];
  photo?: string;
};
