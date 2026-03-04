import {
  StudentStudyCabinetPanel,
} from "@/features/study-cabinet/student/ui/StudentStudyCabinetPanel";
import type { StudentStudyCabinetPanelProps } from "@/features/study-cabinet/student/model/types";
import {
  TeacherStudyCabinetPanel,
} from "@/features/study-cabinet/teacher/ui/TeacherStudyCabinetPanel";
import type { TeacherStudyCabinetPanelProps } from "@/features/study-cabinet/teacher/model/types";

export type StudyCabinetPanelProps =
  | ({ role: "student" } & StudentStudyCabinetPanelProps)
  | ({ role: "teacher" } & TeacherStudyCabinetPanelProps);

export function StudyCabinetPanel(props: StudyCabinetPanelProps) {
  if (props.role === "student") {
    const { role, ...studentProps } = props;
    void role;
    return <StudentStudyCabinetPanel {...studentProps} />;
  }
  const { role, ...teacherProps } = props;
  void role;
  return <TeacherStudyCabinetPanel {...teacherProps} />;
}
