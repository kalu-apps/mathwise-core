# Visual Smoke-Pass Matrix

Scope: global visual layer only, logic unchanged.

Modes:
- `Desktop Dark`
- `Desktop Light`
- `Mobile Dark`
- `Mobile Light`

## 10 Key Screens

1. `/` (Home)
2. `/courses` (Catalog)
3. `/courses/:courseId` (Course details)
4. `/lessons/:id` (Lesson details)
5. `/booking` (Individual lessons)
6. `/about-teacher` (About teacher)
7. `/student/profile` (Student dashboard)
8. `/teacher/profile` (Teacher dashboard)
9. `/teacher/students/:studentId` (Teacher -> Student details)
10. `Dialogs/Overlays` (auth, course/lesson editor, confirmations)

## What is validated in each screen

- Contrast parity for `text/background` in dark/light.
- Unified corners/radii and soft-premium surfaces.
- Status/tag readability and visual prominence.
- Button/input/tab consistency by shared tokens.
- Empty/error/loading/skeleton consistency.
- Mobile fit and no overflow for cards/dialogs.
- Pricing visual emphasis in light theme.
- Lesson-header counter safety in course details.
- Study-cabinet icon visibility in light theme.

## Current Result

- All 10 screens passed static visual smoke criteria for 4 modes.
- Token consistency: no undefined CSS variables in visual layer.
- Dialog ergonomics: globally aligned for mobile widths/heights/actions.
- Hardcoded visual debt reduced and below enforced thresholds.

## Commands

1. `npm run smoke:visual`
2. `npm run audit:contracts`
3. `npm run audit:contrast`
4. `npm run visual:matrix`

## Notes

- In this sandbox environment, browser screenshot automation is unavailable (no headless browser runtime).
- Production-safe fallback used here: strict static visual smoke + lint/build/audit gates.
- For pixel screenshots on a local machine, install Playwright and run an image-baseline pass as a separate local step.
