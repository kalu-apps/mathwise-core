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
  materials?: LessonMaterial[];
  settings?: {
    disablePrintableDownloads?: boolean;
  };
};
