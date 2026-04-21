export type NewsTone =
  | "general"
  | "exam"
  | "achievement"
  | "important"
  | "course_update";
export type NewsVisibility = "all" | "course_students";
export type NewsAttachmentKind = "image" | "video";

export type NewsAttachment = {
  id: string;
  kind: NewsAttachmentKind;
  mediaObjectId?: string;
  url?: string;
  downloadable?: boolean;
  fileName?: string;
  contentType?: string;
  accessUrl?: string;
  accessUrlExpiresAt?: string;
};

export type NewsPost = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  tone: NewsTone;
  highlighted: boolean;
  imageUrl?: string;
  attachments?: NewsAttachment[];
  externalUrl?: string;
  visibility?: NewsVisibility;
  targetCourseId?: string;
  targetUserIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateNewsPostPayload = {
  authorId: string;
  title: string;
  content: string;
  tone: NewsTone;
  highlighted?: boolean;
  imageUrl?: string;
  attachments?: NewsAttachment[];
  externalUrl?: string;
  visibility?: NewsVisibility;
  targetCourseId?: string;
  targetUserIds?: string[];
};

export type UpdateNewsPostPayload = Partial<
  Pick<
    NewsPost,
    | "title"
    | "content"
    | "tone"
    | "highlighted"
    | "imageUrl"
    | "attachments"
    | "externalUrl"
    | "visibility"
    | "targetCourseId"
    | "targetUserIds"
  >
>;
