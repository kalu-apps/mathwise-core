import fs from "fs";
import path from "path";

const root = process.cwd();
const outPath = path.join(root, "docs/visual-regression-matrix.json");

const routes = [
  { id: "home", path: "/" },
  { id: "catalog", path: "/courses" },
  { id: "course-details", path: "/courses/{courseId}" },
  { id: "lesson-details", path: "/lessons/{lessonId}" },
  { id: "booking", path: "/booking" },
  { id: "about-teacher", path: "/about-teacher" },
  { id: "student-profile", path: "/student/profile" },
  { id: "teacher-profile", path: "/teacher/profile" },
  { id: "teacher-student", path: "/teacher/students/{studentId}" },
  { id: "dialogs-overlay", path: "{contextual}" },
];

const modes = [
  { id: "desktop-dark", viewport: { width: 1440, height: 900 }, theme: "dark" },
  { id: "desktop-light", viewport: { width: 1440, height: 900 }, theme: "light" },
  { id: "mobile-dark", viewport: { width: 390, height: 844 }, theme: "dark" },
  { id: "mobile-light", viewport: { width: 390, height: 844 }, theme: "light" },
];

const scenarios = [];
for (const route of routes) {
  for (const mode of modes) {
    scenarios.push({
      id: `${route.id}__${mode.id}`,
      route: route.path,
      screen: route.id,
      theme: mode.theme,
      viewport: mode.viewport,
      baseline: `visual-baseline/${route.id}__${mode.id}.png`,
      current: `visual-current/${route.id}__${mode.id}.png`,
    });
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  totalScenarios: scenarios.length,
  routes,
  modes,
  scenarios,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`Visual regression matrix generated: ${path.relative(root, outPath)}`);
console.log(`Scenarios: ${scenarios.length}`);
