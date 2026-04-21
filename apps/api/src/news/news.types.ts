export type NewsTone =
  | "general"
  | "exam"
  | "achievement"
  | "important"
  | "course_update";

export type NewsVisibility = "all" | "course_students";

export type NewsAttachmentKind = "image" | "video";

export type NewsAttachmentDto = {
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

export type NewsPostDto = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  tone: NewsTone;
  highlighted: boolean;
  imageUrl?: string;
  attachments?: NewsAttachmentDto[];
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
  attachments?: NewsAttachmentDto[];
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
    | "attachments"
    | "externalUrl"
    | "visibility"
    | "targetCourseId"
    | "targetUserIds"
  >
>;
