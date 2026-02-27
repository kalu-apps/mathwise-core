import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type DragEvent,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Typography,
  IconButton,
  Divider,
  Chip,
  MenuItem,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import DescriptionIcon from "@mui/icons-material/Description";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";

import { createCourse, updateCourse, getCourseById } from "@/entities/course/model/storage";
import {
  getLessonsByCourse,
  replaceLessonsByCourse,
} from "@/entities/lesson/model/storage";

import type { Course } from "@/entities/course/model/types";
import type { LessonDraft } from "./LessonEditor";
import { LessonEditor } from "./LessonEditor";
import { fileToDataUrl } from "@/shared/lib/files";
import { generateId } from "@/shared/lib/id";
import { t } from "@/shared/i18n";
import { useActionGuard } from "@/shared/lib/useActionGuard";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { ButtonPending, PageLoader } from "@/shared/ui/loading";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import {
  addTestItemToCourseContent,
  getCourseMaterialBlocks,
  getCourseContentItems,
  saveCourseMaterialBlocks,
  saveCourseContentItems,
} from "@/features/assessments/model/storage";
import type {
  CourseMaterialBlock,
  CourseContentItem,
  CourseContentTestItem,
  TestTemplate,
} from "@/features/assessments/model/types";
import { AddTestToCourseDialog } from "@/features/assessments/ui/AddTestToCourseDialog";
import { TestTemplatePreviewDialog } from "@/features/assessments/ui/TestTemplatePreviewDialog";

type Props = {
  teacherId: string;
  courseId?: string;
  onClose: () => void;
  onSaved?: () => void;
};

type CourseDraftSnapshot = {
  title: string;
  description: string;
  level: string;
  priceGuided: string;
  priceSelf: string;
  lessons: LessonDraft[];
  courseContentItems: CourseContentItem[];
  courseBlocks: CourseMaterialBlock[];
};

const toComparableSnapshot = (snapshot: CourseDraftSnapshot) => {
  const normalizedBlocks =
    snapshot.courseBlocks.length === 1 &&
    snapshot.courseBlocks[0]?.title === "Основной блок" &&
    snapshot.courseBlocks[0]?.description.trim() === ""
      ? []
      : snapshot.courseBlocks.map((block) => ({
          id: block.id,
          title: block.title.trim(),
          description: block.description.trim(),
          order: block.order,
        }));

  return {
    title: snapshot.title.trim(),
    description: snapshot.description.trim(),
    level: snapshot.level.trim(),
    priceGuided: snapshot.priceGuided.trim(),
    priceSelf: snapshot.priceSelf.trim(),
    lessons: snapshot.lessons.map((lesson) => ({
      id: lesson.id ?? null,
      title: lesson.title.trim(),
      duration: lesson.duration,
      hasVideoFile: Boolean(lesson.videoFile),
      videoUrl: lesson.videoUrl ?? "",
      settings: lesson.settings ?? null,
      materials: lesson.materials.map((material) => ({
        id: material.id,
        name: material.name.trim(),
        type: material.type,
        url: material.url ?? "",
        hasFile: Boolean(material.file),
      })),
    })),
    courseContentItems: snapshot.courseContentItems.map((item) => ({
      id: item.id,
      blockId: item.blockId,
      type: item.type,
      order: item.order,
      lessonId: item.type === "lesson" ? item.lessonId : null,
      templateId: item.type === "test" ? item.templateId : null,
      titleSnapshot: item.type === "test" ? item.titleSnapshot : null,
    })),
    courseBlocks: normalizedBlocks,
  };
};

const toLessonQueueItems = (
  courseId: string,
  lessons: LessonDraft[],
  blockId: string
): CourseContentItem[] =>
  lessons.map((lesson, index) => ({
    id: `lesson-item-${lesson.id ?? generateId()}`,
    courseId,
    blockId,
    type: "lesson" as const,
    lessonId: lesson.id ?? generateId(),
    createdAt: new Date().toISOString(),
    order: index + 1,
  }));

const normalizeQueue = (items: CourseContentItem[]) =>
  [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));

const getTestAttachmentItems = (item: CourseContentTestItem) => {
  const attachments =
    item.templateSnapshot?.questions
      .flatMap((question) => question.prompt.attachments ?? [])
      .filter((attachment) => attachment.type !== "image") ?? [];
  if (attachments.length === 0) return [];
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${attachment.type}:${attachment.id}:${attachment.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const syncQueueWithLessons = (
  queue: CourseContentItem[],
  courseId: string,
  lessons: LessonDraft[],
  defaultBlockId: string
) => {
  const lessonIds = new Set(
    lessons
      .map((lesson) => lesson.id)
      .filter((lessonId): lessonId is string => Boolean(lessonId))
  );
  const preserved = queue.filter((item) =>
    item.type === "test" ? true : lessonIds.has(item.lessonId)
  );
  const existingLessonIds = new Set(
    preserved
      .filter((item): item is Extract<CourseContentItem, { type: "lesson" }> => item.type === "lesson")
      .map((item) => item.lessonId)
  );
  const appended = lessons
    .map((lesson) => lesson.id)
    .filter((lessonId): lessonId is string => Boolean(lessonId))
    .filter((lessonId) => !existingLessonIds.has(lessonId))
    .map((lessonId) => ({
      id: `lesson-item-${lessonId}`,
      courseId,
      blockId: defaultBlockId,
      type: "lesson" as const,
      lessonId,
      createdAt: new Date().toISOString(),
      order: preserved.length + 1,
    }));

  return normalizeQueue([...preserved, ...appended]);
};

export function CourseWithLessonsEditor({
  teacherId,
  courseId,
  onClose,
  onSaved,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isEditMode = Boolean(courseId);
  const [loading, setLoading] = useState(isEditMode);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("");
  const [priceGuided, setPriceGuided] = useState("");
  const [priceSelf, setPriceSelf] = useState("");
  const [lessons, setLessons] = useState<LessonDraft[]>([]);
  const [courseBlocks, setCourseBlocks] = useState<CourseMaterialBlock[]>([]);
  const [courseContentItems, setCourseContentItems] = useState<CourseContentItem[]>(
    []
  );
  const [testTitlesByItemId, setTestTitlesByItemId] = useState<Record<string, string>>(
    {}
  );
  const [dragQueueItemId, setDragQueueItemId] = useState<string | null>(null);
  const [addTestOpen, setAddTestOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TestTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [blocksPanelOpen, setBlocksPanelOpen] = useState(false);
  const [saveError, setSaveError] = useState<unknown | null>(null);
  const [closing, setClosing] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const autoDraftCourseIdRef = useRef<string | null>(courseId ?? null);
  const committedRef = useRef(false);
  const skipAutoSaveOnUnmountRef = useRef(false);
  const autosaveInFlightRef = useRef(false);
  const initialDraftRef = useRef<CourseDraftSnapshot>({
    title: "",
    description: "",
    level: "",
    priceGuided: "",
    priceSelf: "",
    lessons: [],
    courseContentItems: [],
    courseBlocks: [],
  });
  const createInitialSnapshotSetRef = useRef(false);
  const saveGuard = useActionGuard();
  const isSaving = saveGuard.pending;
  const resolvedCourseId = courseId ?? "draft-course";
  const defaultBlockId =
    courseBlocks[0]?.id ?? `course-block-default-${resolvedCourseId}`;

  useEffect(() => {
    if (!isEditMode || !courseId) return;
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const [course, courseLessons] = await Promise.all([
          getCourseById(courseId),
          getLessonsByCourse(courseId),
        ]);
        if (!active) return;
        if (course) {
          setTitle(course.title);
          setDescription(course.description);
          setLevel(course.level);
          setPriceGuided(course.priceGuided ? String(course.priceGuided) : "");
          setPriceSelf(course.priceSelf ? String(course.priceSelf) : "");
        }
        const mappedLessons = courseLessons.map((l) => ({
          id: l.id,
          title: l.title,
          duration: l.duration,
          videoFile: null,
          videoUrl: l.videoUrl,
          settings: l.settings,
          materials: (l.materials ?? [])
            .filter(
              (m): m is typeof m & { type: "pdf" | "doc" } =>
                m.type === "pdf" || m.type === "doc"
            )
            .map((m) => ({
              id: m.id,
              name: m.name,
              type: m.type,
              url: m.url,
            })),
        }));
        setLessons(mappedLessons);
        const [queue, blocks] = await Promise.all([
          getCourseContentItems(courseId, courseLessons),
          getCourseMaterialBlocks(courseId),
        ]);
        if (!active) return;
        setCourseContentItems(queue);
        setCourseBlocks(blocks);
        setBlocksPanelOpen(blocks.length > 1);
        const testTitles = (
          await Promise.all(
            queue
              .filter(
                (item): item is CourseContentTestItem => item.type === "test"
              )
              .map(async (item) => [item.id, item.templateSnapshot?.title ?? item.titleSnapshot] as const)
          )
        ).reduce<Record<string, string>>((acc, [id, title]) => {
          acc[id] = title;
          return acc;
        }, {});
        if (!active) return;
        setTestTitlesByItemId(testTitles);
        const loadedSnapshot: CourseDraftSnapshot = {
          title: course?.title ?? "",
          description: course?.description ?? "",
          level: course?.level ?? "",
          priceGuided: course?.priceGuided ? String(course.priceGuided) : "",
          priceSelf: course?.priceSelf ? String(course.priceSelf) : "",
          lessons: mappedLessons,
          courseContentItems: queue,
          courseBlocks: blocks,
        };
        latestDraftRef.current = loadedSnapshot;
        initialDraftRef.current = loadedSnapshot;
      } catch {
        if (!active) return;
        setLessons([]);
        setCourseContentItems([]);
        setCourseBlocks([]);
        setTestTitlesByItemId({});
        const emptySnapshot: CourseDraftSnapshot = {
          title: "",
          description: "",
          level: "",
          priceGuided: "",
          priceSelf: "",
          lessons: [],
          courseContentItems: [],
          courseBlocks: [],
        };
        latestDraftRef.current = emptySnapshot;
        initialDraftRef.current = emptySnapshot;
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [courseId, isEditMode]);

  useEffect(() => {
    if (loading) return;
    const targetCourseId = resolvedCourseId;
    if (courseBlocks.length === 0) {
      setCourseBlocks([
        {
          id: `course-block-default-${targetCourseId}`,
          courseId: targetCourseId,
          title: "Основной блок",
          description: "",
          order: 1,
        },
      ]);
      return;
    }
    if (!courseContentItems.length && lessons.length > 0) {
      setCourseContentItems(
        toLessonQueueItems(targetCourseId, lessons, defaultBlockId)
      );
      return;
    }
    if (courseContentItems.length > 0) {
      const nextQueue = syncQueueWithLessons(
        courseContentItems,
        targetCourseId,
        lessons,
        defaultBlockId
      );
      if (JSON.stringify(nextQueue) !== JSON.stringify(courseContentItems)) {
        setCourseContentItems(nextQueue);
      }
    }
  }, [
    courseBlocks.length,
    courseContentItems,
    defaultBlockId,
    lessons,
    loading,
    resolvedCourseId,
  ]);

  const [lessonEditorOpen, setLessonEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const latestDraftRef = useRef<CourseDraftSnapshot>({
    title: "",
    description: "",
    level: "",
    priceGuided: "",
    priceSelf: "",
    lessons: [],
    courseContentItems: [],
    courseBlocks: [],
  });

  const hasMainFields =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    level.trim().length > 0 &&
    priceGuided.trim().length > 0 &&
    priceSelf.trim().length > 0;
  const hasValidLessons =
    lessons.length > 0 &&
    lessons.every(
      (lesson) =>
        lesson.title.trim().length > 0 &&
        (Boolean(lesson.videoFile) || Boolean(lesson.videoUrl))
    );
  const canOpenConfirm = hasMainFields && hasValidLessons;

  const currentSnapshot = useMemo<CourseDraftSnapshot>(
    () => ({
      title,
      description,
      level,
      priceGuided,
      priceSelf,
      lessons,
      courseContentItems,
      courseBlocks,
    }),
    [
      title,
      description,
      level,
      priceGuided,
      priceSelf,
      lessons,
      courseContentItems,
      courseBlocks,
    ]
  );

  useEffect(() => {
    latestDraftRef.current = currentSnapshot;
  }, [currentSnapshot]);

  useEffect(() => {
    if (isEditMode || loading || createInitialSnapshotSetRef.current) return;
    initialDraftRef.current = currentSnapshot;
    createInitialSnapshotSetRef.current = true;
  }, [currentSnapshot, isEditMode, loading]);

  const hasUnsavedChanges =
    JSON.stringify(toComparableSnapshot(currentSnapshot)) !==
    JSON.stringify(toComparableSnapshot(initialDraftRef.current));

  useEffect(() => {
    if (!hasUnsavedChanges && unsavedDialogOpen) {
      setUnsavedDialogOpen(false);
    }
  }, [hasUnsavedChanges, unsavedDialogOpen]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const handleSaveLesson = (lesson: LessonDraft) => {
    setSaveError(null);
    const normalizedLesson: LessonDraft = {
      ...lesson,
      id: lesson.id ?? generateId(),
    };
    setLessons((prev) => {
      const nextLessons =
        editingIndex === null
          ? [...prev, normalizedLesson]
          : prev.map((l, i) => (i === editingIndex ? normalizedLesson : l));
      const nextQueue = syncQueueWithLessons(
        courseContentItems,
        resolvedCourseId,
        nextLessons,
        defaultBlockId
      );
      setCourseContentItems(nextQueue);
      return nextLessons;
    });
    setEditingIndex(null);
    setLessonEditorOpen(false);
  };

  const removeLesson = (index: number) =>
    setLessons((prev) => {
      const nextLessons = prev.filter((_, i) => i !== index);
      const nextQueue = syncQueueWithLessons(
        courseContentItems,
        resolvedCourseId,
        nextLessons,
        defaultBlockId
      );
      setCourseContentItems(nextQueue);
      return nextLessons;
    });

  const addTemplateToQueue = async (template: TestTemplate) => {
    const queue = courseId
      ? await addTestItemToCourseContent(
          courseId,
          template,
          courseContentItems,
          defaultBlockId
        )
      : normalizeQueue([
          ...courseContentItems,
          {
            id: generateId(),
            courseId: resolvedCourseId,
            blockId: defaultBlockId,
            type: "test",
            templateId: template.id,
            titleSnapshot: template.title,
            templateSnapshot: {
              title: template.title,
              description: template.description ?? "",
              durationMinutes: template.durationMinutes,
              assessmentKind: template.assessmentKind,
              questions: template.questions,
              recommendationMap: template.recommendationMap,
            },
            createdAt: new Date().toISOString(),
            order: courseContentItems.length + 1,
          } as CourseContentTestItem,
        ]);
    setCourseContentItems(queue);
    setTestTitlesByItemId((prev) => {
      const knownIds = new Set(Object.keys(prev));
      const added = queue.find(
        (item) =>
          item.type === "test" &&
          item.templateId === template.id &&
          !knownIds.has(item.id)
      );
      if (!added) return prev;
      return {
        ...prev,
        [added.id]: template.title,
      };
    });
    setAddTestOpen(false);
  };

  const reorderQueueItems = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setCourseContentItems((prev) => {
      const sorted = normalizeQueue(prev);
      const sourceIndex = sorted.findIndex((item) => item.id === sourceId);
      const targetIndex = sorted.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const targetBlockId = sorted[targetIndex].blockId;
      const next = [...sorted];
      const [item] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, {
        ...item,
        blockId: targetBlockId,
      });
      return normalizeQueue(next);
    });
  }, []);

  const moveQueueItemByOffset = useCallback(
    (itemId: string, offset: -1 | 1) => {
      setCourseContentItems((prev) => {
        const sorted = normalizeQueue(prev);
        const sourceIndex = sorted.findIndex((item) => item.id === itemId);
        if (sourceIndex < 0) return prev;
        const targetIndex = sourceIndex + offset;
        if (targetIndex < 0 || targetIndex >= sorted.length) return prev;
        const next = [...sorted];
        const [entry] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, entry);
        return normalizeQueue(next);
      });
    },
    []
  );

  const handleQueueDragStart = (
    event: DragEvent<HTMLElement>,
    itemId: string
  ) => {
    if (isMobile) return;
    setDragQueueItemId(itemId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  };

  const handleQueueDrop = (event: DragEvent<HTMLElement>, targetId: string) => {
    if (isMobile) return;
    event.preventDefault();
    const sourceId = dragQueueItemId || event.dataTransfer.getData("text/plain");
    if (!sourceId) return;
    reorderQueueItems(sourceId, targetId);
    setDragQueueItemId(null);
  };

  const handleQueueDragOver = (event: DragEvent<HTMLElement>) => {
    if (isMobile) return;
    event.preventDefault();
  };

  const handleQueueDragHandleKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    itemId: string
  ) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveQueueItemByOffset(itemId, -1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveQueueItemByOffset(itemId, 1);
    }
  };

  const addMaterialBlock = () => {
    setCourseBlocks((prev) => {
      const next: CourseMaterialBlock[] = [
        ...prev,
        {
          id: generateId(),
          courseId: resolvedCourseId,
          title: `Блок ${prev.length + 1}`,
          description: "",
          order: prev.length + 1,
        },
      ];
      return next.map((block, index) => ({ ...block, order: index + 1 }));
    });
  };

  const toggleBlocksPanel = () => {
    if (blocksPanelOpen) {
      setBlocksPanelOpen(false);
      return;
    }
    setBlocksPanelOpen(true);
    if (courseBlocks.length === 1) {
      addMaterialBlock();
    }
  };

  const updateMaterialBlock = (
    blockId: string,
    patch: Partial<Pick<CourseMaterialBlock, "title" | "description">>
  ) => {
    setCourseBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId
          ? {
              ...block,
              ...patch,
            }
          : block
      )
    );
  };

  const removeMaterialBlock = (blockId: string) => {
    setCourseBlocks((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((block) => block.id !== blockId);
      const fallbackBlockId = next[0]?.id;
      if (fallbackBlockId) {
        setCourseContentItems((items) =>
          items.map((item) =>
            item.blockId === blockId ? { ...item, blockId: fallbackBlockId } : item
          )
        );
      }
      return next.map((block, index) => ({ ...block, order: index + 1 }));
    });
  };

  const setQueueItemBlock = (itemId: string, blockId: string) => {
    setCourseContentItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, blockId } : item))
    );
  };

  const sortedQueueItems = useMemo(
    () => normalizeQueue(courseContentItems),
    [courseContentItems]
  );

  const queueGroups = useMemo(() => {
    const orderedBlocks = [...courseBlocks].sort((a, b) => a.order - b.order);
    return orderedBlocks.map((block) => ({
      block,
      items: sortedQueueItems.filter((item) => item.blockId === block.id),
    }));
  }, [courseBlocks, sortedQueueItems]);

  const visibleQueueGroups = useMemo(
    () => queueGroups.filter((group) => group.items.length > 0 || blocksPanelOpen),
    [blocksPanelOpen, queueGroups]
  );

  const queueItemIndexMap = useMemo(
    () =>
      sortedQueueItems.reduce<Map<string, number>>((acc, item, index) => {
        acc.set(item.id, index);
        return acc;
      }, new Map<string, number>()),
    [sortedQueueItems]
  );

  const autoSaveDraftBeforeClose = async (
    snapshot: CourseDraftSnapshot = latestDraftRef.current
  ) => {
    if (autosaveInFlightRef.current) return false;
    if (committedRef.current || isEditMode) return false;
    const {
      title: snapTitle,
      description: snapDescription,
      level: snapLevel,
      priceGuided: snapPriceGuided,
      priceSelf: snapPriceSelf,
      lessons: snapLessons,
      courseContentItems: snapQueue,
      courseBlocks: snapBlocks,
    } = snapshot;
    const hasAnyContent =
      snapTitle.trim().length > 0 ||
      snapDescription.trim().length > 0 ||
      snapLevel.trim().length > 0 ||
      snapPriceGuided.trim().length > 0 ||
      snapPriceSelf.trim().length > 0 ||
      snapLessons.some(
        (lesson) =>
          lesson.title.trim().length > 0 ||
          Boolean(lesson.videoFile) ||
          Boolean(lesson.videoUrl) ||
          lesson.materials.length > 0
      ) ||
      snapBlocks.length > 1 ||
      snapBlocks.some(
        (block) =>
          block.description.trim().length > 0 ||
          (block.title.trim().length > 0 && block.title.trim() !== "Основной блок")
      ) ||
      snapQueue.some((item) => item.type === "test");

    if (!hasAnyContent) return false;

    const courseDraftId = autoDraftCourseIdRef.current ?? generateId();
    autoDraftCourseIdRef.current = courseDraftId;

    autosaveInFlightRef.current = true;
    try {
      const parsedPriceGuided = Number(snapPriceGuided);
      const parsedPriceSelf = Number(snapPriceSelf);
      const draftCourse: Course = {
        id: courseDraftId,
        title: snapTitle.trim() || "Черновик курса",
        description: snapDescription.trim() || "Черновик описания курса",
        level: snapLevel.trim() || "Не указан",
        priceGuided: Number.isFinite(parsedPriceGuided) ? parsedPriceGuided : 0,
        priceSelf: Number.isFinite(parsedPriceSelf) ? parsedPriceSelf : 0,
        teacherId,
        status: "draft",
      };

      const lessonsWithIds = snapLessons.map((lesson, index) => ({
        ...lesson,
        id: lesson.id ?? `draft-lesson-${index + 1}-${generateId()}`,
      }));

      const normalizedLessons = await Promise.all(
        lessonsWithIds.map(async (lesson, index) => ({
          id: lesson.id!,
          courseId: courseDraftId,
          order: index + 1,
          title: lesson.title || `Урок ${index + 1}`,
          duration: lesson.duration,
          videoUrl: lesson.videoFile
            ? await fileToDataUrl(lesson.videoFile)
            : lesson.videoUrl ?? "",
          materials: (
            await Promise.all(
              lesson.materials.map(async (material) => ({
                id: material.id,
                name: material.name,
                type: material.type,
                url:
                  material.url ??
                  (material.file ? await fileToDataUrl(material.file) : ""),
              }))
            )
          ).filter((material) => material.url),
          settings: lesson.settings,
        }))
      );

      const snapshotDefaultBlockId =
        snapBlocks[0]?.id ?? `course-block-default-${courseDraftId}`;
      const snapshotBlocks: CourseMaterialBlock[] =
        snapBlocks.length > 0
          ? snapBlocks.map((block, index) => ({ ...block, order: index + 1 }))
          : [
              {
                id: snapshotDefaultBlockId,
                courseId: courseDraftId,
                title: "Основной блок",
                description: "",
                order: 1,
              },
            ];
      const queue = normalizeQueue(
        syncQueueWithLessons(
          snapQueue,
          courseDraftId,
          lessonsWithIds,
          snapshotBlocks[0].id
        )
      );

      const existingDraft = await getCourseById(courseDraftId);
      if (existingDraft) {
        await updateCourse(draftCourse);
      } else {
        await createCourse(draftCourse);
      }
      await replaceLessonsByCourse(courseDraftId, normalizedLessons);
      await saveCourseMaterialBlocks(courseDraftId, snapshotBlocks);
      await saveCourseContentItems(courseDraftId, queue);
      return true;
    } finally {
      autosaveInFlightRef.current = false;
    }
  };

  const handleRequestClose = async () => {
    if (closing || isSaving) return;
    if (!hasUnsavedChanges) {
      skipAutoSaveOnUnmountRef.current = true;
      onClose();
      return;
    }
    setUnsavedDialogOpen(true);
  };

  const handleDiscardAndClose = () => {
    if (closing || isSaving) return;
    skipAutoSaveOnUnmountRef.current = true;
    committedRef.current = true;
    setUnsavedDialogOpen(false);
    onClose();
  };

  const handleSaveAndClose = async () => {
    if (closing || isSaving) return;
    setClosing(true);
    try {
      setUnsavedDialogOpen(false);
      if (canOpenConfirm) {
        await saveCourse();
        return;
      }
      const autosaved = await autoSaveDraftBeforeClose();
      if (!autosaved) {
        setSaveError(new Error("Заполните обязательные поля или сохраните курс вручную."));
        return;
      }
      skipAutoSaveOnUnmountRef.current = true;
      committedRef.current = true;
      onSaved?.();
      onClose();
    } finally {
      setClosing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (committedRef.current || skipAutoSaveOnUnmountRef.current) return;
      void autoSaveDraftBeforeClose(latestDraftRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCourse = async () => {
    if (!hasMainFields) {
      setSaveError(new Error(t("courseEditor.requiredFieldsError")));
      return;
    }
    if (!hasValidLessons) {
      setSaveError(new Error(t("courseEditor.requiredLessonFieldsError")));
      return;
    }
    setSaveError(null);
    try {
      const saved = await saveGuard.run(
        async () => {
          const id = courseId ?? autoDraftCourseIdRef.current ?? generateId();
          autoDraftCourseIdRef.current = id;
          const parsedPriceGuided = Number(priceGuided);
          const parsedPriceSelf = Number(priceSelf);
          const existingCourse = await getCourseById(id);
          const nextStatus =
            existingCourse?.status === "published"
              ? "draft"
              : existingCourse?.status ?? "draft";
          const normalizedBlocks: CourseMaterialBlock[] =
            courseBlocks.length > 0
              ? courseBlocks.map((block, index) => ({ ...block, order: index + 1 }))
              : [
                  {
                    id: defaultBlockId,
                    courseId: id,
                    title: "Основной блок",
                    description: "",
                    order: 1,
                  },
                ];

          const course: Course = {
            id,
            title,
            description,
            level,
            priceGuided: Number.isFinite(parsedPriceGuided) ? parsedPriceGuided : 0,
            priceSelf: Number.isFinite(parsedPriceSelf) ? parsedPriceSelf : 0,
            teacherId,
            status: nextStatus,
          };

          if (isEditMode || existingCourse) {
            await updateCourse(course);
          } else {
            await createCourse(course);
          }

          const lessonOrderByQueue = normalizeQueue(
            syncQueueWithLessons(courseContentItems, id, lessons, defaultBlockId)
          )
            .filter(
              (item): item is Extract<CourseContentItem, { type: "lesson" }> =>
                item.type === "lesson"
            )
            .map((item) => item.lessonId);
          const orderedLessons = [...lessons].sort((a, b) => {
            const aIndex = lessonOrderByQueue.indexOf(a.id ?? "");
            const bIndex = lessonOrderByQueue.indexOf(b.id ?? "");
            if (aIndex < 0 && bIndex < 0) return 0;
            if (aIndex < 0) return 1;
            if (bIndex < 0) return -1;
            return aIndex - bIndex;
          });

          const normalizedLessons = await Promise.all(
            orderedLessons.map(async (lesson, index) => {
              const videoUrl = lesson.videoFile
                ? await fileToDataUrl(lesson.videoFile)
                : lesson.videoUrl ?? "";

              const materials = (
                await Promise.all(
                  lesson.materials.map(async (m) => ({
                    id: m.id,
                    name: m.name,
                    type: m.type,
                    url: m.url ?? (m.file ? await fileToDataUrl(m.file) : ""),
                  }))
                )
              ).filter((m) => m.url);

              return {
                id: lesson.id ?? generateId(),
                courseId: id,
                order: index + 1,
                title: lesson.title,
                duration: lesson.duration,
                videoUrl,
                materials,
                settings: lesson.settings,
              };
            })
          );

          await replaceLessonsByCourse(id, normalizedLessons);
          await saveCourseMaterialBlocks(id, normalizedBlocks);
          const normalizedQueue = normalizeQueue(
            syncQueueWithLessons(
              courseContentItems,
              id,
              orderedLessons,
              normalizedBlocks[0].id
            )
          );
          await saveCourseContentItems(id, normalizedQueue);

          committedRef.current = true;
          setConfirmOpen(false);
          onClose();
          onSaved?.();
        },
        {
          lockKey: `course-save:${courseId ?? "new"}:${teacherId}`,
          retry: { label: t("common.retryCourseSaveAction") },
        }
      );
      if (saved === undefined) return;
    } catch (error) {
      setSaveError(
        error instanceof Error ? error : new Error(t("courseEditor.saveFailed"))
      );
    }
  };

  if (loading) {
    return (
      <Dialog
        open
        onClose={() => {
          void handleRequestClose();
        }}
        maxWidth={false}
        fullWidth
        className="course-editor-dialog ui-dialog ui-dialog--wide"
      >
        <DialogTitleWithClose
          title={t("courseEditor.loadingCourse")}
          onClose={() => {
            void handleRequestClose();
          }}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent className="course-editor-dialog__content">
          <PageLoader
            title={t("courseEditor.loadingCourse")}
            description={t("courseEditor.loadingCourse")}
            minHeight={isMobile ? 180 : 220}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        open
        onClose={() => {
          void handleRequestClose();
        }}
        maxWidth={false}
        fullWidth
        className="course-editor-dialog ui-dialog ui-dialog--wide"
      >
        <DialogTitleWithClose
          title={
            isEditMode
              ? t("courseEditor.editCourseTitle")
              : t("courseEditor.createCourseTitle")
          }
          onClose={() => {
            void handleRequestClose();
          }}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent className="course-editor-dialog__content">
          <Stack spacing={2}>
            {saveError ? (
              <RecoverableErrorAlert
                error={saveError}
                onRetry={() => saveCourse()}
                retryLabel={t("common.retryCourseSaveAction")}
              />
            ) : null}
            <TextField
              label={t("courseEditor.courseNameLabel")}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (saveError) setSaveError(null);
              }}
              fullWidth
              required
              size="small"
            />
            <TextField
              label={t("courseEditor.descriptionLabel")}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (saveError) setSaveError(null);
              }}
              multiline
              minRows={3}
              fullWidth
              required
              size="small"
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label={t("courseEditor.levelLabel")}
                value={level}
                onChange={(e) => {
                  setLevel(e.target.value);
                  if (saveError) setSaveError(null);
                }}
                fullWidth
                required
                size="small"
              />
              <TextField
                label={t("courseEditor.guidedPriceLabel")}
                type="text"
                value={priceGuided}
                onChange={(e) => {
                  setPriceGuided(e.target.value.replace(/[^\d]/g, ""));
                  if (saveError) setSaveError(null);
                }}
                inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                fullWidth
                required
                size="small"
              />
              <TextField
                label={t("courseEditor.selfPriceLabel")}
                type="text"
                value={priceSelf}
                onChange={(e) => {
                  setPriceSelf(e.target.value.replace(/[^\d]/g, ""));
                  if (saveError) setSaveError(null);
                }}
                inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                fullWidth
                required
                size="small"
              />
            </Stack>
            <Divider />
            <Stack spacing={1.25} className="course-editor-dialog__blocks">
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
              >
                <Typography variant="h6">Объединить материалы в блоки</Typography>
                <Button
                  startIcon={
                    blocksPanelOpen ? <RemoveRoundedIcon /> : <AddRoundedIcon />
                  }
                  variant="outlined"
                  size="small"
                  onClick={toggleBlocksPanel}
                >
                  Добавить блок
                </Button>
              </Stack>
              {blocksPanelOpen ? (
                <Stack spacing={1}>
                  {courseBlocks.map((block) => (
                    <Stack
                      key={block.id}
                      className="course-editor-dialog__block-card"
                      direction={{ xs: "column", md: "row" }}
                      spacing={1}
                    >
                      <TextField
                        label="Название блока"
                        value={block.title}
                        onChange={(event) =>
                          updateMaterialBlock(block.id, { title: event.target.value })
                        }
                        fullWidth
                        size="small"
                      />
                      <TextField
                        label="Описание блока"
                        value={block.description}
                        onChange={(event) =>
                          updateMaterialBlock(block.id, {
                            description: event.target.value,
                          })
                        }
                        fullWidth
                        size="small"
                      />
                      <Tooltip title="Удалить блок">
                        <span>
                          <IconButton
                            color="error"
                            onClick={() => removeMaterialBlock(block.id)}
                            disabled={courseBlocks.length <= 1}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    variant="text"
                    size="small"
                    onClick={addMaterialBlock}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Добавить еще блок
                  </Button>
                </Stack>
              ) : null}
            </Stack>
            <Divider />
            <Stack
              direction="row"
              justifyContent="flex-end"
              alignItems="center"
            >
              {isMobile ? (
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title={t("courseEditor.addLesson")}>
                    <IconButton
                      className="course-editor-dialog__mobile-add"
                      onClick={() => {
                        setEditingIndex(null);
                        setLessonEditorOpen(true);
                      }}
                      aria-label={t("courseEditor.addLesson")}
                    >
                      <AddIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Добавить тест">
                    <IconButton
                      className="course-editor-dialog__mobile-add"
                      onClick={() => setAddTestOpen(true)}
                      aria-label="Добавить тест"
                    >
                      <FactCheckRoundedIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1}>
                  <Button
                    startIcon={<AddIcon />}
                    variant="outlined"
                    onClick={() => {
                      setEditingIndex(null);
                      setLessonEditorOpen(true);
                    }}
                  >
                    {t("courseEditor.addLesson")}
                  </Button>
                  <Button
                    startIcon={<FactCheckRoundedIcon />}
                    variant="outlined"
                    onClick={() => setAddTestOpen(true)}
                    >
                      Добавить тест
                    </Button>
                </Stack>
              )}
            </Stack>
            {courseContentItems.length === 0 && (
              <Typography color="text.secondary">
                {t("courseEditor.lessonsEmpty")}
              </Typography>
            )}
            <Stack spacing={1}>
              {visibleQueueGroups.map((group) => (
                <Stack key={group.block.id} spacing={1} className="course-editor-dialog__queue-group">
                  {(blocksPanelOpen || courseBlocks.length > 1) && (
                    <div className="course-editor-dialog__queue-group-head">
                      <Typography variant="subtitle2">{group.block.title}</Typography>
                      {group.block.description.trim() ? (
                        <Typography variant="caption" color="text.secondary">
                          {group.block.description}
                        </Typography>
                      ) : null}
                    </div>
                  )}
                  {group.items.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      В этом блоке пока нет материалов.
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {group.items.map((item) => {
                        const queueIndex = queueItemIndexMap.get(item.id) ?? -1;
                        if (item.type === "test") {
                          const testKind =
                            item.templateSnapshot?.assessmentKind === "exam"
                              ? "exam"
                              : "credit";
                          return (
                            <div
                              key={item.id}
                              data-course-queue-item-id={item.id}
                              draggable={!isMobile}
                              tabIndex={0}
                              onDragStart={(event) => handleQueueDragStart(event, item.id)}
                              onDragEnd={() => setDragQueueItemId(null)}
                              onDragOver={handleQueueDragOver}
                              onDrop={(event) => handleQueueDrop(event, item.id)}
                              onKeyDown={(event) =>
                                handleQueueDragHandleKeyDown(event, item.id)
                              }
                              className={`course-editor-dialog__queue-item course-editor-dialog__queue-item--test ${
                                dragQueueItemId === item.id ? "is-touch-target" : ""
                              }`}
                            >
                              <div className="course-editor-dialog__queue-item-main">
                                <Typography
                                  fontWeight={700}
                                  className="course-editor-dialog__queue-item-title"
                                >
                                  Тест: {testTitlesByItemId[item.id] ?? item.titleSnapshot}
                                </Typography>
                                <div className="course-editor-dialog__queue-item-meta">
                                  <Chip
                                    size="small"
                                    icon={
                                      testKind === "exam" ? (
                                        <GavelRoundedIcon />
                                      ) : (
                                        <FactCheckRoundedIcon />
                                      )
                                    }
                                    label={testKind === "exam" ? "Экзамен" : "Зачет"}
                                    color={testKind === "exam" ? "warning" : "info"}
                                    sx={{ alignSelf: "flex-start" }}
                                  />
                                  {getTestAttachmentItems(item).map((attachment) => (
                                    <Tooltip key={attachment.id} title={attachment.name}>
                                      <Chip
                                        size="small"
                                        icon={<DescriptionIcon />}
                                        label={
                                          attachment.name.length > 12
                                            ? `${attachment.name.slice(0, 12)}…`
                                            : attachment.name
                                        }
                                      />
                                    </Tooltip>
                                  ))}
                                </div>
                              </div>
                              <div className="course-editor-dialog__queue-item-actions">
                                {blocksPanelOpen ? (
                                  <TextField
                                    select
                                    size="small"
                                    label="Блок"
                                    value={item.blockId}
                                    onChange={(event) =>
                                      setQueueItemBlock(item.id, event.target.value)
                                    }
                                    sx={{ minWidth: 176 }}
                                  >
                                    {courseBlocks.map((block) => (
                                      <MenuItem key={block.id} value={block.id}>
                                        {block.title}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                ) : null}
                                <div className="course-editor-dialog__queue-item-icons">
                                  {isMobile ? (
                                    <>
                                      <Tooltip title="Поднять в списке">
                                        <span>
                                          <IconButton
                                            size="small"
                                            aria-label="Поднять карточку"
                                            onClick={() => moveQueueItemByOffset(item.id, -1)}
                                            disabled={queueIndex <= 0}
                                          >
                                            <ArrowUpwardRoundedIcon fontSize="small" />
                                          </IconButton>
                                        </span>
                                      </Tooltip>
                                      <Tooltip title="Опустить в списке">
                                        <span>
                                          <IconButton
                                            size="small"
                                            aria-label="Опустить карточку"
                                            onClick={() => moveQueueItemByOffset(item.id, 1)}
                                            disabled={
                                              queueIndex < 0 ||
                                              queueIndex >= sortedQueueItems.length - 1
                                            }
                                          >
                                            <ArrowDownwardRoundedIcon fontSize="small" />
                                          </IconButton>
                                        </span>
                                      </Tooltip>
                                    </>
                                  ) : null}
                                  <Tooltip title="Предпросмотр теста">
                                    <IconButton
                                      aria-label="Предпросмотр теста"
                                      onClick={() => {
                                        const snapshot = item.templateSnapshot;
                                        setPreviewTemplate({
                                          id: item.templateId,
                                          title: snapshot?.title ?? item.titleSnapshot,
                                          description: snapshot?.description ?? "",
                                          durationMinutes: snapshot?.durationMinutes ?? 0,
                                          assessmentKind:
                                            snapshot?.assessmentKind === "exam"
                                              ? "exam"
                                              : "credit",
                                          createdByTeacherId: teacherId,
                                          createdAt: item.createdAt,
                                          updatedAt: item.createdAt,
                                          questions: snapshot?.questions ?? [],
                                          recommendationMap: snapshot?.recommendationMap,
                                          status: "published",
                                        });
                                        setPreviewOpen(true);
                                      }}
                                    >
                                      <VisibilityRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Удалить тест из курса">
                                    <IconButton
                                      color="error"
                                      onClick={() =>
                                        setCourseContentItems((prev) =>
                                          normalizeQueue(
                                            prev.filter((entry) => entry.id !== item.id)
                                          )
                                        )
                                      }
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </Tooltip>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const lessonIndex = lessons.findIndex(
                          (lesson) => lesson.id === item.lessonId
                        );
                        const lesson = lessonIndex >= 0 ? lessons[lessonIndex] : null;
                        if (!lesson) return null;

                        return (
                          <div
                            key={item.id}
                            data-course-queue-item-id={item.id}
                            draggable={!isMobile}
                            tabIndex={0}
                            onDragStart={(event) => handleQueueDragStart(event, item.id)}
                            onDragEnd={() => setDragQueueItemId(null)}
                            onDragOver={handleQueueDragOver}
                            onDrop={(event) => handleQueueDrop(event, item.id)}
                            onKeyDown={(event) =>
                              handleQueueDragHandleKeyDown(event, item.id)
                            }
                            className={`course-editor-dialog__queue-item ${
                              dragQueueItemId === item.id ? "is-touch-target" : ""
                            }`}
                          >
                            <div className="course-editor-dialog__queue-item-main">
                              <Typography
                                fontWeight={600}
                                className="course-editor-dialog__queue-item-title"
                              >
                                {lesson.title}
                              </Typography>
                              <div className="course-editor-dialog__queue-item-meta">
                                <Tooltip
                                  title={
                                    lesson.videoFile || lesson.videoUrl
                                      ? t("courseEditor.videoExists")
                                      : t("courseEditor.videoMissing")
                                  }
                                >
                                  <Chip
                                    size="small"
                                    icon={<PlayCircleOutlineIcon />}
                                    label={
                                      lesson.videoFile || lesson.videoUrl
                                        ? t("courseEditor.videoYes")
                                        : t("courseEditor.videoDash")
                                    }
                                  />
                                </Tooltip>
                                {lesson.materials.map((m) => (
                                  <Tooltip key={m.id} title={m.name}>
                                    <Chip
                                      size="small"
                                      icon={<DescriptionIcon />}
                                      label={
                                        m.name.length > 10
                                          ? m.name.slice(0, 10) + "…"
                                          : m.name
                                      }
                                    />
                                  </Tooltip>
                                ))}
                              </div>
                            </div>
                            <div className="course-editor-dialog__queue-item-actions">
                              {blocksPanelOpen ? (
                                <TextField
                                  select
                                  size="small"
                                  label="Блок"
                                  value={item.blockId}
                                  onChange={(event) =>
                                    setQueueItemBlock(item.id, event.target.value)
                                  }
                                  sx={{ minWidth: 176 }}
                                >
                                  {courseBlocks.map((block) => (
                                    <MenuItem key={block.id} value={block.id}>
                                      {block.title}
                                    </MenuItem>
                                  ))}
                                </TextField>
                              ) : null}
                              <div className="course-editor-dialog__queue-item-icons">
                                {isMobile ? (
                                  <>
                                    <Tooltip title="Поднять в списке">
                                      <span>
                                        <IconButton
                                          size="small"
                                          aria-label="Поднять карточку"
                                          onClick={() => moveQueueItemByOffset(item.id, -1)}
                                          disabled={queueIndex <= 0}
                                        >
                                          <ArrowUpwardRoundedIcon fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Tooltip title="Опустить в списке">
                                      <span>
                                        <IconButton
                                          size="small"
                                          aria-label="Опустить карточку"
                                          onClick={() => moveQueueItemByOffset(item.id, 1)}
                                          disabled={
                                            queueIndex < 0 ||
                                            queueIndex >= sortedQueueItems.length - 1
                                          }
                                        >
                                          <ArrowDownwardRoundedIcon fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </>
                                ) : null}
                                <Tooltip title={t("courseEditor.editLesson")}>
                                  <IconButton
                                    color="primary"
                                    onClick={() => {
                                      setEditingIndex(lessonIndex);
                                      setLessonEditorOpen(true);
                                    }}
                                  >
                                    <EditIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={t("courseEditor.deleteLesson")}>
                                  <IconButton
                                    color="error"
                                    onClick={() => removeLesson(lessonIndex)}
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </Tooltip>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </Stack>
                  )}
                </Stack>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions className="course-editor-dialog__actions">
          <Button
            onClick={() => {
              void handleRequestClose();
            }}
            color="inherit"
            startIcon={<CloseRoundedIcon />}
          >
            <span className="course-editor-dialog__action-text">
              {t("common.cancel")}
            </span>
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!canOpenConfirm) {
                setSaveError(
                  !hasMainFields
                    ? t("courseEditor.requiredFieldsError")
                    : t("courseEditor.requiredLessonFieldsError")
                );
                return;
              }
              setSaveError(null);
              setConfirmOpen(true);
            }}
            disabled={isSaving}
            startIcon={<SaveRoundedIcon />}
          >
            <ButtonPending
              loading={isSaving}
              className="course-editor-dialog__action-text"
            >
              {isEditMode
                ? t("courseEditor.saveChanges")
                : t("courseEditor.createCourse")}
            </ButtonPending>
          </Button>
        </DialogActions>
      </Dialog>

      {confirmOpen && (
        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          maxWidth={false}
          fullWidth
          className="course-editor-dialog ui-dialog ui-dialog--compact"
        >
          <DialogTitleWithClose
            title={
              isEditMode
                ? t("courseEditor.confirmEditTitle")
                : t("courseEditor.confirmCreateTitle")
            }
            onClose={() => setConfirmOpen(false)}
            closeAriaLabel={t("common.close")}
          />
          <DialogContent>
            <Typography color="text.secondary">
              {isEditMode
                ? t("courseEditor.confirmEditDescription")
                : t("courseEditor.confirmCreateDescription")}
            </Typography>
          </DialogContent>
          <DialogActions className="course-editor-dialog__actions">
            <Button
              onClick={() => setConfirmOpen(false)}
              startIcon={<CloseRoundedIcon />}
            >
              <span className="course-editor-dialog__action-text">
                {t("common.cancel")}
              </span>
            </Button>
            <Button
              variant="contained"
              onClick={() => void saveCourse()}
              disabled={isSaving}
              startIcon={<SaveRoundedIcon />}
            >
              <ButtonPending
                loading={isSaving}
                className="course-editor-dialog__action-text"
              >
                {t("courseEditor.confirmAction")}
              </ButtonPending>
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog
        open={unsavedDialogOpen}
        onClose={() => setUnsavedDialogOpen(false)}
        maxWidth={false}
        fullWidth
        className="course-editor-dialog ui-dialog ui-dialog--compact"
      >
        <DialogTitleWithClose
          title="Есть несохранённые изменения"
          onClose={() => setUnsavedDialogOpen(false)}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent>
          <Typography color="text.secondary">
            Сохранить изменения перед закрытием формы?
          </Typography>
        </DialogContent>
        <DialogActions className="course-editor-dialog__actions">
          <Button onClick={() => setUnsavedDialogOpen(false)}>
            <span className="course-editor-dialog__action-text">Остаться</span>
          </Button>
          <Button color="inherit" onClick={handleDiscardAndClose}>
            <span className="course-editor-dialog__action-text">
              Не сохранять
            </span>
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              void handleSaveAndClose();
            }}
            disabled={isSaving || closing}
            startIcon={<SaveRoundedIcon />}
          >
            <ButtonPending
              loading={isSaving || closing}
              className="course-editor-dialog__action-text"
            >
              Сохранить
            </ButtonPending>
          </Button>
        </DialogActions>
      </Dialog>

      {lessonEditorOpen && (
        <LessonEditor
          key={editingIndex ?? "new"}
          initialLesson={
            editingIndex !== null ? lessons[editingIndex] : undefined
          }
          onSave={handleSaveLesson}
          onCancel={() => {
            setLessonEditorOpen(false);
            setEditingIndex(null);
          }}
        />
      )}

      <AddTestToCourseDialog
        open={addTestOpen}
        teacherId={teacherId}
        onClose={() => setAddTestOpen(false)}
        onAddTemplate={(template) => {
          void addTemplateToQueue(template);
        }}
      />

      <TestTemplatePreviewDialog
        open={previewOpen}
        template={previewTemplate}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewTemplate(null);
        }}
      />
    </>
  );
}
