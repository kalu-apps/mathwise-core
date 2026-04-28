import type {
  TeacherPlannerEvent,
  TeacherPlannerTabId,
  TeacherPlannerTabOption,
} from "@/features/study-cabinet/teacher/model/types";

export const TEACHER_PLANNER_TABS: TeacherPlannerTabOption[] = [
  { id: "all", label: "Все" },
  { id: "bookings", label: "Занятия" },
  { id: "trial", label: "Пробные" },
  { id: "regular", label: "Платные" },
  { id: "availability", label: "Слоты" },
  { id: "notes", label: "Напоминания" },
];

export const filterTeacherPlannerEvents = (
  events: TeacherPlannerEvent[],
  activeTab: TeacherPlannerTabId
) => {
  if (activeTab === "all") return events;
  if (activeTab === "bookings") {
    return events.filter(
      (event) => event.kind === "trial-booking" || event.kind === "regular-booking"
    );
  }
  if (activeTab === "trial") {
    return events.filter((event) => event.kind === "trial-booking");
  }
  if (activeTab === "regular") {
    return events.filter((event) => event.kind === "regular-booking");
  }
  if (activeTab === "availability") {
    return events.filter((event) => event.kind === "availability-slot");
  }
  return events.filter((event) => event.kind === "note");
};

export const getPlannerEventsForRange = (params: {
  events: TeacherPlannerEvent[];
  dayKeys: Set<string>;
  activeTab: TeacherPlannerTabId;
}) =>
  filterTeacherPlannerEvents(params.events, params.activeTab).filter((event) =>
    params.dayKeys.has(event.dateKey)
  );

export const groupPlannerEventsByDay = (events: TeacherPlannerEvent[]) =>
  events.reduce<Map<string, TeacherPlannerEvent[]>>((acc, event) => {
    const current = acc.get(event.dateKey) ?? [];
    current.push(event);
    acc.set(event.dateKey, current);
    return acc;
  }, new Map());

export const buildPlannerTabCounts = (events: TeacherPlannerEvent[]) =>
  TEACHER_PLANNER_TABS.reduce<Record<TeacherPlannerTabId, number>>(
    (acc, tab) => {
      acc[tab.id] = filterTeacherPlannerEvents(events, tab.id).length;
      return acc;
    },
    {
      all: 0,
      bookings: 0,
      trial: 0,
      regular: 0,
      availability: 0,
      notes: 0,
    }
  );

export const selectPlannerEventById = (
  events: TeacherPlannerEvent[],
  selectedEventId: string | null
) => {
  if (!selectedEventId) return null;
  return events.find((event) => event.id === selectedEventId) ?? null;
};

export const selectPlannerSummary = (params: {
  events: TeacherPlannerEvent[];
  todayKey: string;
  weekKeys: Set<string>;
  nowTs: number;
}) => {
  const todayEvents = params.events.filter((event) => event.dateKey === params.todayKey);
  const weekEvents = params.events.filter((event) => params.weekKeys.has(event.dateKey));
  const weekBookings = weekEvents.filter(
    (event) => event.kind === "trial-booking" || event.kind === "regular-booking"
  );
  const todayBookings = todayEvents.filter(
    (event) => event.kind === "trial-booking" || event.kind === "regular-booking"
  );
  const unpaidBookings = weekEvents.filter(
    (event) => event.kind === "regular-booking" && event.paymentLabel === "Не оплачено"
  );
  const reminderEvents = weekEvents.filter((event) => event.kind === "note");
  const nextBooking =
    params.events.find(
      (event) =>
        event.startAtMs >= params.nowTs &&
        (event.kind === "trial-booking" || event.kind === "regular-booking")
    ) ?? null;
  const nextEvent = params.events.find((event) => event.startAtMs >= params.nowTs) ?? null;

  return {
    todayEvents,
    todayBookings,
    weekEvents,
    weekBookings,
    unpaidBookings,
    reminderEvents,
    nextBooking,
    nextEvent,
  };
};

export const getPlannerEmptyState = (activeTab: TeacherPlannerTabId) => {
  if (activeTab === "bookings") {
    return {
      title: "Занятий в выбранном периоде нет",
      description: "Запланированные и перенесённые занятия появятся здесь автоматически.",
    };
  }
  if (activeTab === "trial") {
    return {
      title: "Пробных занятий нет",
      description: "Когда появятся пробные записи, они будут выделены отдельным типом события.",
    };
  }
  if (activeTab === "regular") {
    return {
      title: "Платных занятий нет",
      description: "Плановые 1:1-сессии и статус оплаты появятся в этом слое календаря.",
    };
  }
  if (activeTab === "availability") {
    return {
      title: "Свободных слотов нет",
      description: "Добавляйте и редактируйте слоты во вкладке «Индивидуальные занятия».",
    };
  }
  if (activeTab === "notes") {
    return {
      title: "Напоминаний нет",
      description: "Создайте заметку, чтобы закрепить подготовку, итог или личный фокус в расписании.",
    };
  }
  return {
    title: "В выбранном периоде пока пусто",
    description: "Занятия, слоты и напоминания появятся здесь без ручного дублирования.",
  };
};
