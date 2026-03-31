export type LessonMaterialDto = {
  id: string;
  name: string;
  type: "video" | "pdf" | "doc";
  url: string;
};

export type LessonDto = {
  id: string;
  courseId: string;
  title: string;
  order: number;
  duration: number;
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
