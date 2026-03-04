export type LessonMaterial = {
  id: string;
  name: string;
  type: "video" | "pdf" | "doc";
  url: string;
};

export type Lesson = {
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
  materials?: LessonMaterial[];
  settings?: {
    disablePrintableDownloads?: boolean;
  };
};
