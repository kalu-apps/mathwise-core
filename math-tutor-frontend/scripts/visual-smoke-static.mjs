import fs from "fs";
import path from "path";

const root = process.cwd();

const mustExist = [
  "src/pages/home/Home.tsx",
  "src/pages/courses/Courses.tsx",
  "src/pages/courses/CourseDetails.tsx",
  "src/pages/lessons/LessonDetails.tsx",
  "src/pages/booking/Booking.tsx",
  "src/pages/about-teacher/AboutTeacher.tsx",
  "src/pages/profile/StudentProfile.tsx",
  "src/pages/teacher/TeacherDashboard.tsx",
  "src/pages/teacher/TeacherStudentProfile.tsx",
  "src/styles/design-system.css",
  "src/styles/visual/_core.scss",
];

const migratedCritical = [
  "src/styles/visual/migrated/courses-preview.scss",
  "src/styles/visual/migrated/courses.scss",
  "src/styles/visual/migrated/course-details.scss",
  "src/styles/visual/migrated/lesson-details.scss",
  "src/styles/visual/migrated/booking.scss",
  "src/styles/visual/migrated/about-teacher.scss",
  "src/styles/visual/migrated/student-profile.scss",
  "src/styles/visual/migrated/teacher-dashboard.scss",
  "src/styles/visual/migrated/teacher-student-profile.scss",
  "src/styles/visual/migrated/auth-modal.scss",
  "src/styles/visual/migrated/lesson-editor.scss",
];

const requiredTokens = [
  "--bg-canvas",
  "--surface-elevated",
  "--surface-soft",
  "--surface-translucent",
  "--surface-glass",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--brand-solid",
  "--brand-soft",
  "--brand-violet",
  "--feedback-success",
  "--feedback-warning",
  "--feedback-danger",
  "--feedback-info",
  "--gradient-brand",
  "--gradient-brand-hover",
  "--gradient-brand-alt",
  "--tag-bg",
  "--tag-border",
  "--tag-text",
  "--card-bg",
  "--card-border",
  "--price-title-color",
  "--price-value-color",
  "--price-icon-color",
  "--price-card-border",
  "--cabinet-icon-bg",
  "--cabinet-icon-border",
  "--cabinet-icon-color",
  "--header-counter-bg",
  "--header-counter-text",
];

const issues = [];

const read = (p) => fs.readFileSync(path.join(root, p), "utf-8");

for (const p of mustExist) {
  if (!fs.existsSync(path.join(root, p))) {
    issues.push(`Missing file: ${p}`);
  }
}

for (const p of migratedCritical) {
  if (!fs.existsSync(path.join(root, p))) {
    issues.push(`Missing critical visual file: ${p}`);
    continue;
  }
  const content = read(p);
  if (!/@media\s*\(max-width:\s*\d+px\)/.test(content)) {
    issues.push(`No mobile media-query found in ${p}`);
  }
}

if (fs.existsSync(path.join(root, "src/styles/design-system.css"))) {
  const ds = read("src/styles/design-system.css");
  for (const token of requiredTokens) {
    if (!ds.includes(`${token}:`)) {
      issues.push(`Missing required token: ${token}`);
    }
  }
  if (!ds.includes(':root[data-theme="light"]')) {
    issues.push("Light theme block not found in design-system.css");
  }
  if (!ds.includes(':root[data-theme="dark"]')) {
    issues.push("Dark theme block not found in design-system.css");
  }
}

const scopedChecks = [
  {
    file: "src/styles/visual/migrated/course-details.scss",
    mustContain: [
      ".course-details__lessons-head",
      ".course-details__lessons-total",
      "var(--header-counter-bg)",
      "var(--price-value-color)",
      "var(--price-title-color)",
    ],
  },
  {
    file: "src/styles/visual/migrated/study-cabinet.scss",
    mustContain: [
      ".study-cabinet-panel__icon",
      "var(--cabinet-icon-color)",
      "var(--cabinet-icon-bg)",
    ],
  },
];

for (const check of scopedChecks) {
  const abs = path.join(root, check.file);
  if (!fs.existsSync(abs)) {
    issues.push(`Missing scoped check file: ${check.file}`);
    continue;
  }
  const content = read(check.file);
  for (const needle of check.mustContain) {
    if (!content.includes(needle)) {
      issues.push(`${check.file}: missing required fragment "${needle}"`);
    }
  }
}

if (issues.length > 0) {
  console.error("Visual static smoke failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Visual static smoke passed.");
console.log(`Screens covered: 10`);
console.log(`Modes expected: desktop/mobile + dark/light`);
