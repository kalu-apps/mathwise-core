import type {
  TeacherPlannerTabId,
  TeacherPlannerTabOption,
} from "@/features/study-cabinet/teacher/model/types";

type TeacherPlannerTabsProps = {
  tabs: TeacherPlannerTabOption[];
  activeTab: TeacherPlannerTabId;
  counts: Record<TeacherPlannerTabId, number>;
  onChange: (tab: TeacherPlannerTabId) => void;
};

export function TeacherPlannerTabs({
  tabs,
  activeTab,
  counts,
  onChange,
}: TeacherPlannerTabsProps) {
  return (
    <div className="teacher-planner-tabs" role="tablist" aria-label="Типы событий">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "is-active" : ""}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          <em>{counts[tab.id]}</em>
        </button>
      ))}
    </div>
  );
}
