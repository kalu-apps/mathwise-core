import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Avatar,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  createWorkbookInvite,
  createWorkbookSession,
  deleteWorkbookSession,
  duplicateWorkbookSession,
  getWorkbookDrafts,
  renameWorkbookSession,
} from "@/features/workbook/model/api";
import type { WorkbookDraftCard } from "@/features/workbook/model/types";
import { ListSkeleton } from "@/shared/ui/loading";
import { ListPagination } from "@/shared/ui/ListPagination";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { getTeacherChatEligibility } from "@/features/chat/model/api";

const pageSize = 8;

const buildSessionPath = (sessionId: string) =>
  `/workbook/session/${encodeURIComponent(sessionId)}`;

const buildSessionUrl = (sessionId: string) =>
  `${window.location.origin}${buildSessionPath(sessionId)}`;

const openPreparedTabOrFallback = (preparedTab: Window | null, sessionId: string) => {
  const targetUrl = buildSessionUrl(sessionId);
  if (!preparedTab || preparedTab.closed) return false;
  try {
    preparedTab.opener = null;
  } catch {
    // no-op
  }
  preparedTab.location.href = targetUrl;
  try {
    preparedTab.focus();
  } catch {
    // ignore browser focus restrictions
  }
  return true;
};

const mapCardStatusLabel = (status: WorkbookDraftCard["statusForCard"]) => {
  if (status === "ended") return "Завершено";
  if (status === "in_progress") return "В процессе";
  return "Черновик";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDurationLabel = (durationMinutes?: number | null) => {
  if (!durationMinutes || durationMinutes <= 0) return "—";
  if (durationMinutes < 60) return `${durationMinutes} мин`;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
};

export default function WorkbookHubPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [cards, setCards] = useState<WorkbookDraftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"personal" | "class">("personal");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<"personal" | "class" | null>(null);
  const [pendingDeleteCard, setPendingDeleteCard] = useState<WorkbookDraftCard | null>(null);
  const [pendingRenameCard, setPendingRenameCard] = useState<WorkbookDraftCard | null>(null);
  const [renameTitleDraft, setRenameTitleDraft] = useState("");
  const [detailsCard, setDetailsCard] = useState<WorkbookDraftCard | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [copyingInviteSessionId, setCopyingInviteSessionId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [blockedSessionUrl, setBlockedSessionUrl] = useState<string | null>(null);
  const [accessChecking, setAccessChecking] = useState(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";
  const fromPath =
    searchParams.get("from") ||
    (isTeacher ? "/teacher/profile?tab=study" : "/student/profile?tab=study");

  const openSessionFallbackCurrentTab = useCallback(
    (sessionId: string) => {
      navigate(buildSessionPath(sessionId));
    },
    [navigate]
  );

  const loadCards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getWorkbookDrafts("all");
      setCards(
        [...response.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      );
    } catch {
      setError("Не удалось загрузить рабочие тетради.");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isStudent) {
      setAccessChecking(false);
      setAccessDeniedMessage(null);
      return;
    }
    let active = true;
    const verifyAccess = async () => {
      setAccessChecking(true);
      try {
        const eligibility = await getTeacherChatEligibility();
        if (!active) return;
        if (!eligibility.available) {
          setAccessDeniedMessage(
            "Рабочая тетрадь доступна после покупки премиум-курса или записи на индивидуальное занятие."
          );
          return;
        }
        setAccessDeniedMessage(null);
      } catch {
        if (!active) return;
        setAccessDeniedMessage(
          "Не удалось проверить доступ к рабочей тетради. Попробуйте позже."
        );
      } finally {
        if (active) setAccessChecking(false);
      }
    };
    void verifyAccess();
    return () => {
      active = false;
    };
  }, [isStudent]);

  useEffect(() => {
    if (accessChecking) return;
    if (isStudent && accessDeniedMessage) {
      setCards([]);
      setLoading(false);
      return;
    }
    void loadCards();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadCards();
    });
    return () => unsubscribe();
  }, [accessChecking, accessDeniedMessage, isStudent, loadCards]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cards.filter((card) => {
      const byKind = filter === "personal" ? card.kind === "PERSONAL" : card.kind === "CLASS";
      const byQuery = normalizedQuery
        ? card.title.toLowerCase().includes(normalizedQuery)
        : true;
      return byKind && byQuery;
    });
  }, [cards, filter, query]);

  const canRenameCard = useCallback(
    (card: WorkbookDraftCard) =>
      card.kind === "PERSONAL"
        ? card.isOwner
        : Boolean(isTeacher && card.isOwner && card.kind === "CLASS"),
    [isTeacher]
  );

  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCards = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredCards.slice(start, start + pageSize);
  }, [filteredCards, safePage]);

  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  const latestContinuable = useMemo(
    () =>
      cards.find(
        (card) =>
          card.kind === "PERSONAL" &&
          card.statusForCard !== "ended" &&
          card.canEdit
      ) ?? null,
    [cards]
  );

  const handleCreatePersonal = async () => {
    if (isStudent && accessDeniedMessage) return;
    setBlockedSessionUrl(null);
    const preparedTab = window.open("", "_blank");
    try {
      setActionLoading("personal");
      const created = await createWorkbookSession({ kind: "PERSONAL" });
      const opened = openPreparedTabOrFallback(preparedTab, created.session.id);
      if (!opened) {
        setBlockedSessionUrl(buildSessionUrl(created.session.id));
        setError(
          "Тетрадь создана, но браузер заблокировал новую вкладку. Открываем в текущей вкладке."
        );
        openSessionFallbackCurrentTab(created.session.id);
      }
      await loadCards();
    } catch {
      if (preparedTab && !preparedTab.closed) preparedTab.close();
      setError("Не удалось создать личную тетрадь.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateClass = async () => {
    if (isStudent && accessDeniedMessage) return;
    setBlockedSessionUrl(null);
    const preparedTab = window.open("", "_blank");
    try {
      setActionLoading("class");
      const created = await createWorkbookSession({ kind: "CLASS" });
      const opened = openPreparedTabOrFallback(preparedTab, created.session.id);
      if (!opened) {
        setBlockedSessionUrl(buildSessionUrl(created.session.id));
        setError(
          "Урок создан, но браузер заблокировал новую вкладку. Открываем в текущей вкладке."
        );
        openSessionFallbackCurrentTab(created.session.id);
      }
      await loadCards();
    } catch {
      if (preparedTab && !preparedTab.closed) preparedTab.close();
      setError("Не удалось запустить коллективный урок.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenCard = async (card: WorkbookDraftCard) => {
    if (isStudent && accessDeniedMessage) return;
    setBlockedSessionUrl(null);
    const preparedTab = window.open("", "_blank");
    try {
      if (isStudent && card.kind === "CLASS" && card.statusForCard === "ended") {
        const created = await duplicateWorkbookSession(card.sessionId);
        const opened = openPreparedTabOrFallback(preparedTab, created.session.id);
        if (!opened) {
          setBlockedSessionUrl(buildSessionUrl(created.session.id));
          setError(
            "Личная копия создана, но браузер заблокировал новую вкладку. Открываем в текущей вкладке."
          );
          openSessionFallbackCurrentTab(created.session.id);
        }
        setSuccessMessage("Создана личная тетрадь на основе коллективного урока.");
        await loadCards();
        return;
      }
      const opened = openPreparedTabOrFallback(preparedTab, card.sessionId);
      if (!opened) {
        setBlockedSessionUrl(buildSessionUrl(card.sessionId));
        setError(
          "Браузер заблокировал новую вкладку. Открываем сессию в текущей вкладке."
        );
        openSessionFallbackCurrentTab(card.sessionId);
      }
    } catch {
      if (preparedTab && !preparedTab.closed) preparedTab.close();
      setError("Не удалось открыть сессию.");
    }
  };

  const handleDuplicate = async (card: WorkbookDraftCard) => {
    if (isStudent && accessDeniedMessage) return;
    setBlockedSessionUrl(null);
    const preparedTab = window.open("", "_blank");
    try {
      const created = await duplicateWorkbookSession(card.sessionId);
      const opened = openPreparedTabOrFallback(preparedTab, created.session.id);
      if (!opened) {
        setBlockedSessionUrl(buildSessionUrl(created.session.id));
        setError(
          "Копия создана, но новая вкладка заблокирована браузером. Открываем в текущей вкладке."
        );
        openSessionFallbackCurrentTab(created.session.id);
      }
      await loadCards();
    } catch {
      if (preparedTab && !preparedTab.closed) preparedTab.close();
      setError("Не удалось создать новую тетрадь на основе выбранной.");
    }
  };

  const handleDeleteSession = async () => {
    if (!pendingDeleteCard) return;
    try {
      setDeletingSessionId(pendingDeleteCard.sessionId);
      const response = await deleteWorkbookSession(pendingDeleteCard.sessionId);
      setSuccessMessage(response.message);
      setPendingDeleteCard(null);
      await loadCards();
    } catch {
      setError("Не удалось удалить сессию.");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleOpenRename = (card: WorkbookDraftCard) => {
    if (!canRenameCard(card)) return;
    setPendingRenameCard(card);
    setRenameTitleDraft(card.title);
  };

  const handleRenameSession = async () => {
    if (!pendingRenameCard) return;
    const nextTitle = renameTitleDraft.trim();
    if (!nextTitle) {
      setError("Название не может быть пустым.");
      return;
    }
    try {
      setRenamingSessionId(pendingRenameCard.sessionId);
      await renameWorkbookSession(pendingRenameCard.sessionId, nextTitle);
      setSuccessMessage("Название тетради обновлено.");
      setPendingRenameCard(null);
      setRenameTitleDraft("");
      await loadCards();
    } catch {
      setError("Не удалось переименовать тетрадь.");
    } finally {
      setRenamingSessionId(null);
    }
  };

  const handleCopyInvite = async (sessionId: string) => {
    try {
      setCopyingInviteSessionId(sessionId);
      const invite = await createWorkbookInvite(sessionId);
      await navigator.clipboard.writeText(invite.inviteUrl);
      setSuccessMessage("Ссылка для подключения скопирована.");
    } catch {
      setError("Не удалось скопировать ссылку.");
    } finally {
      setCopyingInviteSessionId(null);
    }
  };

  return (
    <section className="workbook-hub">
      <header className="workbook-hub__panel workbook-hub__panel--hero">
        <div className="workbook-hub__hero">
          <IconButton
            className="workbook-hub__back"
            onClick={() => navigate(fromPath)}
            aria-label="Назад"
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <div className="workbook-hub__hero-main">
            <h1>Рабочая тетрадь</h1>
            <p>
              Личные тетради и коллективные уроки. Любое открытие доски запускается
              в отдельной вкладке браузера.
            </p>
          </div>
          <div className="workbook-hub__hero-actions">
            {isTeacher ? (
              <Button
                variant="contained"
                startIcon={<GroupRoundedIcon />}
                onClick={() => void handleCreateClass()}
                disabled={actionLoading !== null || accessChecking || Boolean(accessDeniedMessage)}
              >
                Начать коллективный урок
              </Button>
            ) : null}
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={() => void handleCreatePersonal()}
              disabled={actionLoading !== null || accessChecking || Boolean(accessDeniedMessage)}
            >
              Новая личная тетрадь
            </Button>
            <Button
              variant="outlined"
              startIcon={<OpenInNewRoundedIcon />}
              disabled={
                !latestContinuable || accessChecking || Boolean(accessDeniedMessage)
              }
              component="a"
              href={latestContinuable ? buildSessionPath(latestContinuable.sessionId) : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              Продолжить последнюю
            </Button>
          </div>
        </div>
      </header>

      {accessChecking ? (
        <section className="workbook-hub__panel workbook-hub__panel--list">
          <ListSkeleton count={3} itemHeight={118} />
        </section>
      ) : accessDeniedMessage ? (
        <section className="workbook-hub__panel workbook-hub__panel--list">
          <Alert severity="warning">{accessDeniedMessage}</Alert>
          <div className="workbook-hub__card-actions">
            <Button variant="contained" onClick={() => navigate("/courses")}>
              Перейти к курсам
            </Button>
            <Button variant="outlined" onClick={() => navigate("/booking")}>
              Записаться на занятие
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section className="workbook-hub__panel workbook-hub__panel--search">
            <TextField
              fullWidth
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск сессии"
              InputProps={{
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Очистить поиск"
                      onClick={() => setQuery("")}
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
            <div className="workbook-hub__filters">
              <button
                type="button"
                className={filter === "personal" ? "is-active" : ""}
                onClick={() => setFilter("personal")}
              >
                Личные тетради
              </button>
              <button
                type="button"
                className={filter === "class" ? "is-active" : ""}
                onClick={() => setFilter("class")}
              >
                Коллективные уроки
              </button>
            </div>
          </section>

          <section className="workbook-hub__panel workbook-hub__panel--list">
            {successMessage ? (
              <Alert
                severity="success"
                onClose={() => setSuccessMessage(null)}
              >
                {successMessage}
              </Alert>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            {blockedSessionUrl ? (
              <Alert severity="warning">
                Автооткрытие вкладки заблокировано браузером. Откройте тетрадь вручную:{" "}
                <a href={blockedSessionUrl} target="_blank" rel="noopener noreferrer">
                  открыть в новой вкладке
                </a>
                .
              </Alert>
            ) : null}
            {loading ? (
              <ListSkeleton count={3} itemHeight={118} />
            ) : filteredCards.length === 0 ? (
              <Alert severity="info">Сессий по выбранному фильтру пока нет.</Alert>
            ) : (
              <div className="workbook-hub__list">
                {pagedCards.map((card) => (
                  <article key={card.draftId} className="workbook-hub__card">
                    {card.canDelete ? (
                      <IconButton
                        size="small"
                        className="workbook-hub__card-remove"
                        aria-label="Удалить карточку"
                        onClick={() => setPendingDeleteCard(card)}
                      >
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    ) : null}
                    <div className="workbook-hub__card-main">
                      <div className="workbook-hub__card-title-row">
                        {card.kind === "CLASS" ? (
                          <GroupRoundedIcon fontSize="small" />
                        ) : (
                          <PersonRoundedIcon fontSize="small" />
                        )}
                        <h3>{card.title}</h3>
                      </div>
                      <div className="workbook-hub__card-meta">
                        <Chip
                          size="small"
                          label={card.kind === "CLASS" ? "Коллективная" : "Личная"}
                        />
                        <Chip size="small" label={mapCardStatusLabel(card.statusForCard)} />
                      </div>
                      <div className="workbook-hub__card-timeline">
                        {card.kind === "CLASS" ? (
                          <>
                            <div className="workbook-hub__card-timeline-row">
                              <span>
                                Начало: {formatDateTime(card.startedAt ?? card.createdAt)}
                              </span>
                            </div>
                            <div className="workbook-hub__card-timeline-row">
                              <span>
                                Длительность: {formatDurationLabel(card.durationMinutes)}
                              </span>
                              <div className="workbook-hub__card-actions">
                                {canRenameCard(card) ? (
                                  <Tooltip title="Переименовать">
                                    <span>
                                      <IconButton
                                        size="small"
                                        onClick={() => handleOpenRename(card)}
                                        aria-label="Переименовать тетрадь"
                                      >
                                        <EditRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                ) : null}
                                <Tooltip
                                  title={
                                    isStudent && card.statusForCard === "ended"
                                      ? "Продолжить"
                                      : card.statusForCard === "ended" || !card.canEdit
                                        ? "Просмотр"
                                        : "Открыть"
                                  }
                                >
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      onClick={() => void handleOpenCard(card)}
                                      aria-label="Открыть сессию"
                                    >
                                      <OpenInNewRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                {card.statusForCard === "ended" ? (
                                  <Tooltip title="Создать новую на основе">
                                    <span>
                                      <IconButton
                                        size="small"
                                        onClick={() => void handleDuplicate(card)}
                                        aria-label="Создать новую на основе"
                                      >
                                        <LayersRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                ) : null}
                                {isTeacher &&
                                card.kind === "CLASS" &&
                                card.statusForCard === "ended" &&
                                card.participants?.some(
                                  (participant) => participant.roleInSession === "student"
                                ) ? (
                                  <Tooltip title="Детали урока">
                                    <span>
                                      <IconButton
                                        size="small"
                                        onClick={() => setDetailsCard(card)}
                                        aria-label="Детали коллективного урока"
                                      >
                                        <AccessTimeRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                ) : null}
                                {isTeacher &&
                                card.kind === "CLASS" &&
                                card.statusForCard !== "ended" &&
                                card.canInvite ? (
                                  <Tooltip title="Скопировать ссылку входа">
                                    <span>
                                      <IconButton
                                        size="small"
                                        onClick={() => void handleCopyInvite(card.sessionId)}
                                        disabled={copyingInviteSessionId === card.sessionId}
                                      >
                                        {copyingInviteSessionId === card.sessionId ? (
                                          <CircularProgress size={16} />
                                        ) : (
                                          <ContentCopyRoundedIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                ) : null}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="workbook-hub__card-timeline-row">
                            <span>Последнее изменение: {formatDateTime(card.updatedAt)}</span>
                            <div className="workbook-hub__card-actions">
                              {canRenameCard(card) ? (
                                <Tooltip title="Переименовать">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleOpenRename(card)}
                                      aria-label="Переименовать тетрадь"
                                    >
                                      <EditRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              ) : null}
                              <Tooltip
                                title={
                                  isStudent && card.statusForCard === "ended"
                                    ? "Продолжить"
                                    : card.statusForCard === "ended" || !card.canEdit
                                      ? "Просмотр"
                                      : "Открыть"
                                }
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={() => void handleOpenCard(card)}
                                    aria-label="Открыть сессию"
                                  >
                                    <OpenInNewRoundedIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Создать новую на основе">
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => void handleDuplicate(card)}
                                    aria-label="Создать новую на основе"
                                  >
                                    <LayersRoundedIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!loading && filteredCards.length > 0 ? (
              <ListPagination
                page={safePage}
                totalItems={filteredCards.length}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            ) : null}
          </section>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteCard)}
        title={
          pendingDeleteCard?.kind === "CLASS"
            ? pendingDeleteCard?.isOwner
              ? "Удалить коллективный урок?"
              : "Удалить карточку урока?"
            : "Удалить личную тетрадь?"
        }
        description={
          pendingDeleteCard?.kind === "CLASS"
            ? pendingDeleteCard?.isOwner
              ? "Урок будет удален у всех участников вместе с историей событий, приглашениями и снапшотами. Действие необратимо."
              : "Карточка коллективного урока исчезнет только из вашего списка."
            : "Тетрадь будет удалена без возможности восстановления."
        }
        confirmText={
          deletingSessionId ? "Удаление..." : "Удалить"
        }
        cancelText="Отмена"
        danger
        onCancel={() => {
          if (deletingSessionId) return;
          setPendingDeleteCard(null);
        }}
        onConfirm={() => {
          if (deletingSessionId) return;
          void handleDeleteSession();
        }}
      />

      <Dialog
        open={Boolean(pendingRenameCard)}
        onClose={() => {
          if (renamingSessionId) return;
          setPendingRenameCard(null);
          setRenameTitleDraft("");
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Переименовать тетрадь</DialogTitle>
        <DialogContent dividers>
          <TextField
            fullWidth
            size="small"
            value={renameTitleDraft}
            onChange={(event) => setRenameTitleDraft(event.target.value)}
            placeholder="Введите название"
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (renamingSessionId) return;
              setPendingRenameCard(null);
              setRenameTitleDraft("");
            }}
            disabled={Boolean(renamingSessionId)}
          >
            Отмена
          </Button>
          <Button
            onClick={() => void handleRenameSession()}
            disabled={Boolean(renamingSessionId) || !renameTitleDraft.trim()}
            variant="contained"
          >
            {renamingSessionId ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(detailsCard)}
        onClose={() => setDetailsCard(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Детали коллективного урока</DialogTitle>
        <DialogContent dividers>
          <div className="workbook-hub__details-meta">
            <span>Начало: {formatDateTime(detailsCard?.startedAt)}</span>
            <span>Длительность: {formatDurationLabel(detailsCard?.durationMinutes)}</span>
          </div>
          <div className="workbook-hub__details-list">
            {(detailsCard?.participants ?? [])
              .filter((participant) => participant.roleInSession === "student")
              .map((participant) => (
                <article key={participant.userId} className="workbook-hub__details-card">
                  <Avatar src={participant.photo} alt={participant.displayName}>
                    {participant.displayName.slice(0, 1)}
                  </Avatar>
                  <div>
                    <strong>{participant.displayName}</strong>
                  </div>
                </article>
              ))}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsCard(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
