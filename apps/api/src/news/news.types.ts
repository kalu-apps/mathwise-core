export type NewsTone =
  | "general"
  | "exam"
  | "achievement"
  | "important"
  | "course_update";

export type NewsVisibility = "all" | "course_students";

export type NewsPostDto = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  tone: NewsTone;
  highlighted: boolean;
  imageUrl?: string;
  externalUrl?: string;
  visibility?: NewsVisibility;
  targetCourseId?: string;
  targetUserIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateNewsPostPayloadDto = {
  authorId?: string;
  title?: string;
  content?: string;
  tone?: NewsTone;
  highlighted?: boolean;
  imageUrl?: string;
  externalUrl?: string;
  visibility?: NewsVisibility;
  targetCourseId?: string;
  targetUserIds?: string[];
};

export type UpdateNewsPostPayloadDto = Partial<
  Pick<
    NewsPostDto,
    | "title"
    | "content"
    | "tone"
    | "highlighted"
    | "imageUrl"
    | "externalUrl"
    | "visibility"
    | "targetCourseId"
    | "targetUserIds"
  >
>;
