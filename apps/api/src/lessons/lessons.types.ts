export type LessonMaterialDto = {
  id: string;
  name: string;
  type: "video" | "pdf" | "doc";
  mediaObjectId?: string;
  url?: string;
  downloadable?: boolean;
};

export type LessonDto = {
  id: string;
  courseId: string;
  title: string;
  order: number;
  duration: number;
  contentVisibility?: "public_preview" | "entitled_full";
  videoMediaObjectId?: string;
  videoUrl?: string;
  videoStreamUrl?: string;
  videoPosterUrl?: string;
  mediaJobId?: string;
  mediaJobStatus?: "queued" | "processing" | "ready" | "failed";
  mediaJobError?: string;
  materials?: LessonMaterialDto[];
  settings?: {
    disablePrintableDownloads?: boolean;
  };
};

export type LessonPlaybackAccessDto = {
  lessonId: string;
  source: "media" | "external";
  playbackUrl: string;
  expiresAt?: string | null;
};

export type LessonMaterialAccessDto = {
  lessonId: string;
  materialId: string;
  source: "media" | "external";
  accessUrl: string;
  expiresAt?: string | null;
  downloadable: boolean;
};
