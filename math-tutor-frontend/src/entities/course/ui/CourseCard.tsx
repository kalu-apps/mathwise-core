import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  IconButton,
  Tooltip,
  Chip,
  Box,
  Typography,
  Paper,
  Stack,
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LockIcon from "@mui/icons-material/Lock";
import DiamondRoundedIcon from "@mui/icons-material/DiamondRounded";

import type { Course } from "@/entities/course/model/types";

type PurchasedProgressDetails = {
  lessonsViewed: number;
  lessonsTotal: number;
  testsCompleted: number;
  testsTotal: number;
  knowledgePercent: number;
};

type Props = {
  course: Course;
  lessonsCount?: number;
  showLessonsCount?: boolean;
  testsCount?: number;
  locked?: boolean;
  progress?: number | null;
  ctaLabel?: string;
  showStatus?: boolean;
  isTeacherView?: boolean;
  isPremium?: boolean;
  bnplAvailable?: boolean;
  bnplFromAmount?: number | null;
  showPrices?: boolean;
  showPurchaseBadge?: boolean;
  hideCta?: boolean;
  clickable?: boolean;
  summaryMode?: "description" | "level";
  statusBelowTitle?: boolean;
  progressDetails?: PurchasedProgressDetails | null;
  detailsFromPath?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onPublish?: () => void;
};

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const formatPriceRub = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

const buildProgressVisual = (value: number) => {
  const percent = clampPercent(value);
  const normalized = percent / 100;
  const eased =
    percent <= 40
      ? (percent / 40) * 0.58
      : 0.58 + ((percent - 40) / 60) * 0.42;
  const hue = Math.round(4 + eased * 126);
  const saturation = Math.round(92 - normalized * 14);
  const lightness = percent === 0 ? 46 : Math.round(48 + normalized * 8);
  const color = `hsl(${hue} ${saturation}% ${lightness}%)`;
  const glow = `hsla(${hue} 96% ${Math.max(44, lightness)}% / 0.32)`;
  return { percent, color, glow };
};

export function CourseCard({
  course,
  lessonsCount = 0,
  showLessonsCount = true,
  testsCount = 0,
  locked = false,
  progress = null,
  ctaLabel,
  showStatus = false,
  isTeacherView = false,
  isPremium = false,
  bnplAvailable = false,
  bnplFromAmount = null,
  showPrices = true,
  showPurchaseBadge = true,
  hideCta = false,
  clickable = false,
  summaryMode = "description",
  statusBelowTitle = false,
  progressDetails = null,
  detailsFromPath,
  onEdit,
  onDelete,
  onPublish,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedFromPath = detailsFromPath ?? `${location.pathname}${location.search}`;
  const detailsHref = `/courses/${course.id}`;
  const fromState = {
    from: resolvedFromPath,
  };
  const hasPurchasedProgress = Boolean(progressDetails);
  const isPurchasedStudentCard = !isTeacherView && hasPurchasedProgress;
  const isCatalogCard = !isTeacherView && !isPurchasedStudentCard;
  const learningVisual = hasPurchasedProgress
    ? buildProgressVisual(progressDetails?.lessonsTotal
        ? (progressDetails.lessonsViewed / Math.max(progressDetails.lessonsTotal, 1)) * 100
        : 0)
    : buildProgressVisual(progress ?? 0);
  const knowledgeVisual = hasPurchasedProgress
    ? buildProgressVisual(progressDetails?.knowledgePercent ?? 0)
    : buildProgressVisual(0);
  const courseStatusLabel = hasPurchasedProgress
    ? learningVisual.percent >= 100
      ? "Статус изучения: завершен"
      : "Статус изучения: в процессе"
    : null;
  const purchasedMetaLine = hasPurchasedProgress
    ? `Уроки: ${progressDetails!.lessonsViewed}/${progressDetails!.lessonsTotal}${
        progressDetails!.testsTotal > 0
          ? ` • Тесты: ${progressDetails!.testsCompleted}/${progressDetails!.testsTotal}`
          : ""
      }`
    : null;
  const compactMainPrice = Math.min(course.priceGuided, course.priceSelf);
  const compactSecondaryPrice = Math.max(course.priceGuided, course.priceSelf);
  const hasSecondaryPrice = compactSecondaryPrice > compactMainPrice;
  const isCatalogCompact = clickable && hideCta && !showPrices && summaryMode === "level";

  return (
    <Paper
      className={`course-card course-card--entity ${isCatalogCard ? "course-card--catalog" : ""} ${
        clickable ? "course-card--clickable" : ""
      }`}
      elevation={0}
      onClick={
        clickable
          ? () => {
              navigate(detailsHref, { state: fromState });
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(detailsHref, { state: fromState });
              }
            }
          : undefined
      }
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? "button" : undefined}
      aria-label={clickable ? `Открыть курс ${course.title}` : undefined}
      sx={{
        p: 2,
        borderRadius: 3,
        overflow: "hidden",
        display: "flex",
        flexDirection: isTeacherView
          ? "row"
          : isPurchasedStudentCard
          ? { xs: "column", lg: "row" }
          : "column",
        border: "1px solid var(--glass-tier-1-border)",
        background: "var(--glass-tier-1-bg)",
        boxShadow:
          "var(--glass-tier-1-shadow), inset 0 1px 0 var(--glass-tier-1-edge)",
        backdropFilter: "blur(var(--glass-tier-1-blur))",
        transition: "transform 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease",
        "&:hover": {
          transform: clickable ? "translateY(-3px) scale(1.018)" : "translateY(-2px)",
          borderColor:
            "color-mix(in srgb, var(--glass-tier-1-border) 84%, var(--accent-soft))",
          boxShadow:
            "var(--glass-tier-1-shadow), inset 0 1px 0 var(--glass-tier-1-edge)",
        },
        minHeight: 180,
        position: "relative",
        isolation: "isolate",
        opacity: locked && !isTeacherView ? 0.92 : 1,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      {!isTeacherView && locked && showPurchaseBadge && (
        <Box
          className="course-card__purchase-status"
          sx={{
            position: "absolute",
            top: 14,
            right: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.2,
            py: 0.5,
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-primary)",
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--brand-solid) 20%, transparent), color-mix(in srgb, var(--surface-soft) 86%, transparent))",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-xs)",
            zIndex: 2,
          }}
        >
          <LockIcon sx={{ fontSize: 16 }} />
          После покупки
        </Box>
      )}

      {!isTeacherView && progress !== null && !locked && !hasPurchasedProgress && (
        <Box
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 2,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background:
              "conic-gradient(var(--brand-solid) " +
              `${progress * 3.6}deg` +
              ", color-mix(in srgb, var(--text-muted) 34%, transparent) 0deg)",
            display: "grid",
            placeItems: "center",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--surface-elevated)",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {progress}%
          </Box>
        </Box>
      )}
      {/* Левый контент */}
      <Box
        className="course-card__content-col"
        sx={{
          flex: 1,
          pr: isTeacherView ? 2 : isPurchasedStudentCard ? { md: 2, xs: 0 } : 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Название и описание */}
        {clickable ? (
          <Box>
            <Typography
              variant="h6"
              className="course-card__title"
              sx={{
                fontWeight: 740,
                color: "var(--text-primary)",
                mb: 1,
                display: "flex",
                width: "fit-content",
                alignItems: "center",
                gap: 0.75,
              }}
            >
              {course.title}
              {!isTeacherView && isPremium && (
                <DiamondRoundedIcon
                  sx={{
                    color: "var(--feedback-warning)",
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                />
              )}
            </Typography>

            {showStatus && statusBelowTitle ? (
              <Chip
                label={course.status === "draft" ? "Черновик" : "Опубликован"}
                color={course.status === "draft" ? "warning" : "success"}
                size="small"
                sx={{ mb: 1 }}
              />
            ) : null}

            {summaryMode === "level" ? (
              <Typography
                variant="body2"
                className="course-card__summary course-card__summary--level"
                sx={{
                  color: "var(--text-secondary)",
                  mb: 1,
                  fontWeight: 700,
                }}
              >
                Уровень: {course.level}
              </Typography>
            ) : (
              <Typography
                variant="body2"
                className="course-card__summary course-card__summary--description"
                sx={{
                  color: "var(--text-secondary)",
                  mb: 1,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {course.description}
              </Typography>
            )}
          </Box>
        ) : (
        <Link
          to={detailsHref}
          state={fromState}
          style={{ textDecoration: "none" }}
        >
          <Typography
            variant="h6"
            className="course-card__title"
            sx={{
              fontWeight: 740,
              color: "var(--text-primary)",
              mb: 1,
              display: "flex",
              width: "fit-content",
              alignItems: "center",
              gap: 0.75,
            }}
          >
            {course.title}
            {!isTeacherView && isPremium && (
              <DiamondRoundedIcon
                sx={{
                  color: "var(--feedback-warning)",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              />
            )}
          </Typography>

          {showStatus && statusBelowTitle ? (
            <Chip
              label={course.status === "draft" ? "Черновик" : "Опубликован"}
              color={course.status === "draft" ? "warning" : "success"}
              size="small"
              sx={{ mb: 1 }}
            />
          ) : null}

          {summaryMode === "level" ? (
            <Typography
              variant="body2"
              className="course-card__summary course-card__summary--level"
              sx={{
                color: "var(--text-secondary)",
                mb: 1,
                fontWeight: 700,
              }}
            >
              Уровень: {course.level}
            </Typography>
          ) : (
            <Typography
              variant="body2"
              className="course-card__summary course-card__summary--description"
              sx={{
                color: "var(--text-secondary)",
                mb: 1,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {course.description}
            </Typography>
          )}
        </Link>
        )}

        {!isCatalogCompact && isCatalogCard && (
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            flexWrap="wrap"
            className="course-card__info-row"
            sx={{ mb: 1 }}
          >
            {showLessonsCount && lessonsCount > 0 ? (
              <Chip
                size="small"
                label={`${lessonsCount} урок${lessonsCount === 1 ? "" : lessonsCount < 5 && lessonsCount > 1 ? "а" : "ов"}`}
                className="course-card__info-chip"
              />
            ) : null}
            {testsCount > 0 && (
              <Chip
                size="small"
                label={`${testsCount} тест${testsCount === 1 ? "" : testsCount < 5 && testsCount > 1 ? "а" : "ов"}`}
                className="course-card__info-chip course-card__info-chip--tests"
              />
            )}
          </Stack>
        )}

        {/* Цены */}
        {!isCatalogCompact && showPrices ? (
          <Box
            className="course-card__price-zone"
            sx={{
              mb: 1.2,
              display: "grid",
              gap: 0.55,
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={1} flexWrap="wrap">
              <Typography
                component="strong"
                className="course-card__price-main"
                sx={{
                  fontSize: { xs: 23, md: 25 },
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.018em",
                  color: "var(--price-value-color)",
                }}
              >
                {formatPriceRub(compactMainPrice)}
              </Typography>
              {hasSecondaryPrice ? (
                <Typography
                  component="span"
                  className="course-card__price-secondary"
                  sx={{
                    fontSize: { xs: 14, md: 15 },
                    fontWeight: 650,
                    lineHeight: 1.15,
                    letterSpacing: "-0.004em",
                  }}
                >
                  до {formatPriceRub(compactSecondaryPrice)}
                </Typography>
              ) : null}
            </Stack>
            {!isTeacherView && bnplAvailable && (
              <Typography
                component="span"
                className="course-card__bnpl-note"
                sx={{
                  fontSize: 12.5,
                  fontWeight: 640,
                  lineHeight: 1.35,
                  color: "color-mix(in srgb, var(--text-secondary) 86%, #5f7da8)",
                }}
              >
                {bnplFromAmount
                  ? `Можно частями от ${bnplFromAmount.toLocaleString("ru-RU")} ₽ / мес`
                  : "Можно частями"}
              </Typography>
            )}
          </Box>
        ) : null}

        {/* Мета информация с статусом на одной линии */}
        {!isCatalogCompact && (
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            {summaryMode !== "level" ? (
              <Typography variant="caption" color="text.secondary">
                Уровень: {course.level}
              </Typography>
            ) : null}
            {(isTeacherView || hasPurchasedProgress) && showLessonsCount && (
              <Typography variant="caption" color="text.secondary">
                Уроков: {lessonsCount}
              </Typography>
            )}
            {(isTeacherView || hasPurchasedProgress) && testsCount > 0 && !hasPurchasedProgress && (
              <Typography variant="caption" color="text.secondary">
                Тестов: {testsCount}
              </Typography>
            )}
            {showStatus && !statusBelowTitle && (
              <Chip
                label={course.status === "draft" ? "Черновик" : "Опубликован"}
                color={course.status === "draft" ? "warning" : "success"}
                size="small"
              />
            )}
          </Stack>
        )}

        {!isCatalogCompact && !isTeacherView && hasPurchasedProgress ? (
          <Box sx={{ mt: 1.25, display: "grid", gap: 1 }}>
            <Typography
              variant="caption"
              sx={{
                color: "var(--text-secondary)",
                fontWeight: 700,
                lineHeight: 1.45,
                whiteSpace: { xs: "normal", md: "nowrap" },
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {purchasedMetaLine}
            </Typography>
            {courseStatusLabel ? (
              <Chip
                size="small"
                label={courseStatusLabel}
                sx={{
                  width: "fit-content",
                  borderRadius: 999,
                  fontWeight: 700,
                  bgcolor:
                    learningVisual.percent >= 100
                      ? "color-mix(in srgb, var(--feedback-success) 20%, transparent)"
                      : "color-mix(in srgb, var(--brand-solid) 18%, transparent)",
                  color:
                    learningVisual.percent >= 100
                      ? "var(--feedback-success)"
                      : "var(--accent-text)",
                  border: "1px solid color-mix(in srgb, var(--border-subtle) 84%, var(--brand-soft))",
                }}
              />
            ) : null}
            <Box mt={0.25}>
              <Link
                to={`/courses/${course.id}`}
                state={fromState}
                className="course-card__cta-link course-card__cta-link--continue"
                style={{
                  textDecoration: "none",
                  background: "var(--btn-primary-bg)",
                  color: "var(--btn-primary-text)",
                  padding: "6px 16px",
                  borderRadius: 14,
                  fontWeight: 600,
                  display: "inline-block",
                  border: "1px solid color-mix(in srgb, var(--brand-soft) 28%, transparent)",
                  boxShadow: "var(--shadow-xs)",
                }}
              >
                {ctaLabel ?? "Продолжить изучение"}
              </Link>
            </Box>
          </Box>
        ) : null}
      </Box>

      {!isTeacherView && hasPurchasedProgress ? (
        <Box
          sx={{
            width: { xs: "100%", lg: 220 },
            flexShrink: 0,
            mt: { xs: 1.25, lg: 0.25 },
            pl: { xs: 0, lg: 1.25 },
            display: "grid",
            alignContent: "start",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
              sx={{
                alignItems: "stretch",
                flexWrap: "wrap",
                justifyContent: { lg: "flex-end", xs: "flex-start" },
              }}
            >
            <Box
              sx={{
                flex: "1 1 96px",
                minWidth: 0,
                borderRadius: 2,
                p: 1,
                border: "1px solid color-mix(in srgb, var(--border-subtle) 86%, transparent)",
                background:
                  "radial-gradient(circle at 16% 18%, color-mix(in srgb, " +
                  learningVisual.color +
                  " 26%, transparent), transparent 58%), var(--surface-soft)",
                boxShadow: `0 8px 16px ${learningVisual.glow}`,
                display: "grid",
                justifyItems: "center",
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  background:
                    "conic-gradient(" +
                    learningVisual.color +
                    " " +
                    learningVisual.percent * 3.6 +
                    "deg, color-mix(in srgb, var(--text-muted) 34%, transparent) 0deg)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border-subtle)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: learningVisual.color,
                  }}
                >
                  {learningVisual.percent}%
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: learningVisual.color, fontWeight: 700 }}>
                Изучено
              </Typography>
            </Box>
            {progressDetails!.testsTotal > 0 ? (
              <Box
                sx={{
                  flex: "1 1 96px",
                  minWidth: 0,
                  borderRadius: 2,
                  p: 1,
                  border: "1px solid color-mix(in srgb, var(--border-subtle) 86%, transparent)",
                  background:
                    "radial-gradient(circle at 16% 18%, color-mix(in srgb, " +
                    knowledgeVisual.color +
                    " 26%, transparent), transparent 58%), var(--surface-soft)",
                  boxShadow: `0 8px 16px ${knowledgeVisual.glow}`,
                  display: "grid",
                  justifyItems: "center",
                  gap: 0.5,
                }}
              >
                <Box
                  sx={{
                    width: 58,
                    height: 58,
                    borderRadius: "50%",
                    background:
                      "conic-gradient(" +
                      knowledgeVisual.color +
                      " " +
                      knowledgeVisual.percent * 3.6 +
                      "deg, color-mix(in srgb, var(--text-muted) 34%, transparent) 0deg)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "var(--surface-elevated)",
                      border: "1px solid var(--border-subtle)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: knowledgeVisual.color,
                    }}
                  >
                    {knowledgeVisual.percent}%
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ color: knowledgeVisual.color, fontWeight: 700 }}>
                  Сдано
                </Typography>
              </Box>
            ) : null}
          </Stack>
        </Box>
      ) : null}

      {/* Иконки действий справа (только в профиле учителя) */}
      {isTeacherView && (
        <Stack
          spacing={1}
          sx={{
            minWidth: 48,
            alignItems: "center",
            justifyContent: "flex-start",
            position: "relative",
            zIndex: 1,
          }}
        >
          {onEdit && (
            <Tooltip title="Редактировать">
              <IconButton size="small" onClick={onEdit}>
                <EditIcon />
              </IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="Удалить">
              <IconButton size="small" onClick={onDelete}>
                <DeleteIcon color="error" />
              </IconButton>
            </Tooltip>
          )}
          {course.status === "draft" && onPublish && (
            <Tooltip title="Опубликовать">
              <IconButton size="small" onClick={onPublish}>
                <CheckCircleIcon color="success" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Перейти к курсу">
            <Link to={`/courses/${course.id}`} state={fromState}>
              <IconButton size="small">
                <VisibilityIcon />
              </IconButton>
            </Link>
          </Tooltip>
        </Stack>
      )}

      {/* Кнопка "Подробнее" для каталога */}
      {!isCatalogCompact && !isTeacherView && !isPurchasedStudentCard && !hideCta && (
        <Box mt={1} className="course-card__cta-slot">
          <Link
            to={detailsHref}
            state={fromState}
            className="course-card__cta-link course-card__cta-link--details"
            style={{
              textDecoration: "none",
              background: "var(--btn-primary-bg)",
              color: "var(--btn-primary-text)",
              padding: "7px 15px",
              borderRadius: 12,
              fontWeight: 650,
              display: "inline-block",
              border: "1px solid color-mix(in srgb, var(--brand-soft) 28%, transparent)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            {ctaLabel ?? "Подробнее"}
          </Link>
        </Box>
      )}
    </Paper>
  );
}
