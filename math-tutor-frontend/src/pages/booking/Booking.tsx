import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import { useNavigate } from "react-router-dom";
import { getUsers } from "@/features/auth/model/api";
import { getTeacherProfile } from "@/features/teacher-profile/api";
import { getTeacherAvailability } from "@/features/teacher-availability/api";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import { createBooking } from "@/entities/booking/model/storage";
import {
  buildCalendarDays,
  formatLongDate,
  groupSlotsByDate,
  isFutureSlot,
  normalizeFutureSlots,
} from "@/features/booking/lib/schedule";
import type { User } from "@/entities/user/model/types";
import type { TeacherProfile } from "@/features/teacher-profile/model/types";
import { useAuth } from "@/features/auth/model/AuthContext";
import { t } from "@/shared/i18n";
import {
  PHONE_MASK_TEMPLATE,
  formatRuPhoneInput,
  isRuPhoneComplete,
  toRuPhoneStorage,
} from "@/shared/lib/phone";
import { AccessStateBanner } from "@/shared/ui/AccessStateBanner";
import { useRecoverAccessNotice } from "@/features/auth/model/useRecoverAccessNotice";
import { ApiError } from "@/shared/api/client";
import { useActionGuard } from "@/shared/lib/useActionGuard";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { PageLoader } from "@/shared/ui/loading";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";

const blurActiveElement = () => {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
};

export default function Booking() {
  const { user, openAuthModal, openRecoverModal } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState<User | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<unknown | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [guestCheckoutOpen, setGuestCheckoutOpen] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [pendingAuthOpen, setPendingAuthOpen] = useState(false);
  const [bookingAcceptTerms, setBookingAcceptTerms] = useState(false);
  const [bookingAcceptPrivacy, setBookingAcceptPrivacy] = useState(false);
  const bookingActionGuard = useActionGuard();
  const bookingSaving = bookingActionGuard.pending;
  const {
    state: accessNoticeState,
    recheck: recheckAccessNotice,
    repair: repairAccessNotice,
  } =
    useRecoverAccessNotice({
      email: user?.email,
      role: user?.role,
    });

  const loadBookingPage = useCallback(async () => {
    try {
      setPageError(null);
      const teachers = await getUsers("teacher");
      const currentTeacher = teachers[0] ?? null;
      setTeacher(currentTeacher);
      if (currentTeacher) {
        try {
          const profileData = await getTeacherProfile(currentTeacher.id);
          setProfile(profileData);
          const slots = await getTeacherAvailability(currentTeacher.id);
          const normalized = slots.map((slot) => ({
            id: slot.id,
            date: slot.date,
            startTime: slot.startTime ?? "",
            endTime: slot.endTime ?? "",
          }));
          setAvailability(normalizeFutureSlots(normalized));
        } catch {
          setProfile({
            firstName: currentTeacher.firstName,
            lastName: currentTeacher.lastName,
            about: "",
            experience: [],
            achievements: [],
            diplomas: [],
            photo: "",
          });
          setAvailability([]);
        }
      }
    } catch (error) {
      setPageError(
        error instanceof Error ? error : new Error(t("booking.loadTeacherError"))
      );
      setTeacher(null);
      setProfile(null);
      setAvailability([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBookingPage();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadBookingPage();
    });
    return () => {
      unsubscribe();
    };
  }, [loadBookingPage]);

  const info = profile ?? {
    firstName: teacher?.firstName ?? "",
    lastName: teacher?.lastName ?? "",
    about: "",
    experience: [],
    achievements: [],
    diplomas: [],
    photo: teacher?.photo ?? "",
  };

  const slotsByDate = useMemo(() => {
    return groupSlotsByDate(availability);
  }, [availability]);

  const calendarDays = useMemo(() => buildCalendarDays(21), []);

  const availableDateSet = useMemo(
    () => new Set(availability.map((slot) => slot.date)),
    [availability]
  );

  const firstAvailableDate = useMemo(
    () => calendarDays.find((day) => availableDateSet.has(day.value))?.value ?? calendarDays[0]?.value ?? "",
    [calendarDays, availableDateSet]
  );

  const mobileDialogActionSx = isMobile
    ? {
        minWidth: 44,
        width: 44,
        height: 44,
        padding: 0.9,
        borderRadius: 2.5,
        flex: "0 0 auto",
      }
    : undefined;
  const stackedDialogContentSx = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } as const;

  const showMessage = (text: string) => {
    blurActiveElement();
    setMessageText(text);
    setMessageOpen(true);
  };

  const handleBookingConflictError = (
    error: unknown,
    slotId?: string
  ): boolean => {
    if (
      error instanceof Error &&
      error.message.includes(t("booking.slotToken")) &&
      slotId
    ) {
      setAvailability((prev) => prev.filter((s) => s.id !== slotId));
      return false;
    }
    if (!(error instanceof ApiError)) return false;
    const details = (error.details ?? {}) as {
      code?: string;
      nextAction?: string;
    };
    if (
      details.code === "identity_conflict_auth_required" ||
      details.nextAction === "login_and_attach"
    ) {
      setGuestCheckoutOpen(false);
      setBookingOpen(false);
      showMessage(t("booking.existingUserLoginRequired"));
      setPendingAuthOpen(true);
      return true;
    }
    if (
      details.code === "email_verification_required" ||
      details.nextAction === "verify_email"
    ) {
      showMessage(error.message);
      setPendingAuthOpen(true);
      return true;
    }
    return false;
  };

  const handleBook = () => {
    if (user?.role === "teacher") {
      showMessage(t("booking.teacherCannotBookSelf"));
      return;
    }
    blurActiveElement();
    setBookingAcceptTerms(false);
    setBookingAcceptPrivacy(false);
    setBookingOpen(true);
    if (!selectedDate) {
      setSelectedDate(firstAvailableDate);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlotId) return;
    if (user?.role === "teacher") {
      showMessage(t("booking.teacherCannotBookSelf"));
      return;
    }
    const slot = availability.find((s) => s.id === selectedSlotId);
    if (!slot || !teacher) return;
    if (!isFutureSlot(slot)) {
      setAvailability((prev) => prev.filter((s) => s.id !== slot.id));
      setSelectedSlotId(null);
      showMessage(t("booking.slotNoLongerAvailable"));
      return;
    }
    if (!bookingAcceptTerms || !bookingAcceptPrivacy) {
      showMessage(t("legal.consentRequired"));
      return;
    }
    if (!user) {
      blurActiveElement();
      setGuestCheckoutOpen(true);
      return;
    }
    try {
      const saved = await bookingActionGuard.run(
        async () => {
          await createBooking({
            teacherId: teacher.id,
            teacherName: `${teacher.firstName} ${teacher.lastName}`.trim(),
            teacherPhoto: info.photo || teacher.photo,
            studentId: user.id,
            studentName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            studentEmail: user.email,
            studentPhone: toRuPhoneStorage(user.phone ?? "") || undefined,
            studentPhoto: user.photo,
            slotId: slot.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            lessonKind: "regular",
            consents: {
              acceptedScopes: ["terms", "privacy", "trial_booking"],
            },
          });
          setAvailability((prev) => prev.filter((s) => s.id !== slot.id));
          setBookingOpen(false);
          showMessage(t("booking.bookingSuccess"));
        },
        {
          lockKey: `booking:${slot.id}:${user.id}`,
          retry: { label: t("common.retryBookingAction") },
        }
      );
      if (saved === undefined) return;
    } catch (error) {
      if (handleBookingConflictError(error, slot.id)) {
        return;
      }
      showMessage(
        error instanceof Error
          ? error.message
          : t("booking.bookingFailed")
      );
    }
  };

  const handleGuestCheckout = async () => {
    if (!selectedSlotId || !teacher) return;
    const slot = availability.find((s) => s.id === selectedSlotId);
    if (!slot) return;
    if (!isFutureSlot(slot)) {
      setAvailability((prev) => prev.filter((s) => s.id !== slot.id));
      setSelectedSlotId(null);
      showMessage(t("booking.slotNoLongerAvailable"));
      return;
    }
    if (!guestEmail.trim()) {
      showMessage(t("booking.guestEmailRequired"));
      return;
    }
    if (!guestFirstName.trim() || !guestLastName.trim()) {
      showMessage(t("booking.guestNameRequired"));
      return;
    }
    if (!isRuPhoneComplete(guestPhone)) {
      showMessage(t("booking.guestPhoneRequired"));
      return;
    }
    if (!bookingAcceptTerms || !bookingAcceptPrivacy) {
      showMessage(t("legal.consentRequired"));
      return;
    }

    try {
      const normalizedGuestEmail = guestEmail.trim().toLowerCase();
      const saved = await bookingActionGuard.run(
        async () => {
          await createBooking({
            teacherId: teacher.id,
            teacherName: `${teacher.firstName} ${teacher.lastName}`.trim(),
            teacherPhoto: info.photo || teacher.photo,
            studentEmail: normalizedGuestEmail,
            studentFirstName: guestFirstName.trim(),
            studentLastName: guestLastName.trim(),
            studentPhone: toRuPhoneStorage(guestPhone),
            slotId: slot.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            lessonKind: "trial",
            consents: {
              acceptedScopes: ["terms", "privacy", "trial_booking"],
            },
          });
          setAvailability((prev) => prev.filter((s) => s.id !== slot.id));
          setGuestCheckoutOpen(false);
          setBookingOpen(false);
          showMessage(t("booking.trialBookedSuccess"));
          setPendingAuthOpen(true);
        },
        {
          lockKey: `booking:${slot.id}:${normalizedGuestEmail}`,
          retry: { label: t("common.retryBookingAction") },
        }
      );
      if (saved === undefined) return;
    } catch (error) {
      if (handleBookingConflictError(error, slot.id)) {
        return;
      }
      showMessage(
        error instanceof Error
          ? error.message
          : t("booking.guestCheckoutFailed")
      );
    }
  };

  useEffect(() => {
    if (!bookingOpen) {
      setSelectedSlotId(null);
      setGuestCheckoutOpen(false);
      return;
    }
    if (!selectedDate) {
      setSelectedDate(firstAvailableDate);
      return;
    }
    const inRange = calendarDays.some((day) => day.value === selectedDate);
    if (!inRange) {
      setSelectedDate(firstAvailableDate);
    }
  }, [bookingOpen, selectedDate, calendarDays, firstAvailableDate]);

  useEffect(() => {
    if (!pendingAuthOpen) return;
    if (bookingOpen || guestCheckoutOpen || messageOpen) return;

    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
      openAuthModal();
      setPendingAuthOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pendingAuthOpen, bookingOpen, guestCheckoutOpen, messageOpen, openAuthModal]);

  if (loading) {
    return (
      <section className="booking-page">
        <PageLoader
          className="booking-page__loader"
          title={t("booking.pageTitle")}
          description={t("booking.pageSubtitle")}
          minHeight={420}
        />
      </section>
    );
  }

  if (!teacher) {
    return (
      <div className="booking-page">
        {pageError ? (
          <RecoverableErrorAlert
            error={pageError}
            onRetry={() => loadBookingPage()}
            retryLabel={t("common.retryLoadData")}
            forceRetry
          />
        ) : null}
        <div className="booking-page__empty">{t("booking.teacherNotFound")}</div>
      </div>
    );
  }

  return (
    <section className="booking-page">
      {pageError ? (
        <RecoverableErrorAlert
          error={pageError}
          onRetry={() => loadBookingPage()}
          retryLabel={t("common.retryLoadData")}
          forceRetry
        />
      ) : null}
      {accessNoticeState && (
        <AccessStateBanner
          state={accessNoticeState}
          onLogin={openAuthModal}
          onRecover={() => openRecoverModal(user?.email)}
          onRecheck={
            accessNoticeState === "paid_but_restricted"
              ? () => {
                  void repairAccessNotice();
                }
              : recheckAccessNotice
          }
          onCompleteProfile={() => navigate("/profile")}
        />
      )}
      <div className="booking-page__hero">
        <div className="booking-page__hero-shade" />
        <div className="booking-page__hero-content">
          <div className="booking-page__actions">
            <Button variant="contained" onClick={handleBook}>
              {user?.role === "student"
                ? t("booking.bookLesson")
                : t("booking.bookTrialLesson")}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate("/contact")}
              className="booking-page__question"
            >
              {t("booking.askQuestion")}
            </Button>
          </div>

          <div className="booking-page__header">
            <h1>{t("booking.pageTitle")}</h1>
            <p>{t("booking.pageSubtitle")}</p>
            <Button
              className="booking-page__teacher-link"
              variant="outlined"
              onClick={() => navigate("/about-teacher")}
            >
              {t("booking.aboutTeacher")}
            </Button>
          </div>

          <div className="booking-page__benefits">
            <article className="booking-page__benefit-card">
              <h3>{t("booking.benefit1Title")}</h3>
              <p>{t("booking.benefit1Text")}</p>
            </article>
            <article className="booking-page__benefit-card">
              <h3>{t("booking.benefit2Title")}</h3>
              <p>{t("booking.benefit2Text")}</p>
            </article>
            <article className="booking-page__benefit-card">
              <h3>{t("booking.benefit3Title")}</h3>
              <p>{t("booking.benefit3Text")}</p>
            </article>
          </div>
        </div>
      </div>

      <Dialog
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        fullWidth
        maxWidth="md"
        className="ui-dialog ui-dialog--wide booking-dialog"
        disableRestoreFocus
      >
        <DialogTitleWithClose
          title={t("booking.dialogTitle")}
          onClose={() => setBookingOpen(false)}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent className="booking-calendar">
          <div className="booking-calendar__legend">
            <span>
              <i className="booking-calendar__legend-dot booking-calendar__legend-dot--active" />
              {t("booking.availableDates")}
            </span>
            <span>
              <i className="booking-calendar__legend-dot" />
              {t("booking.noDateSlots")}
            </span>
          </div>
          {availability.length === 0 && (
            <div className="booking-calendar__empty">
              {t("booking.noTeacherSlots")}
            </div>
          )}
          <div className="booking-calendar__section">
            <div className="booking-calendar__section-title">
              <h4>{t("booking.dateTitle")}</h4>
              <span>
                {t("booking.dateSubtitle")}
              </span>
            </div>
            <div className="booking-calendar__grid">
              {calendarDays.map((day) => {
                const isAvailable = availableDateSet.has(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    className={`booking-calendar__day ${
                      selectedDate === day.value ? "is-active" : ""
                    } ${isAvailable ? "is-available" : "is-muted"} ${
                      day.isWeekend ? "is-weekend" : ""
                    }`}
                    onClick={() => {
                      setSelectedDate(day.value);
                      setSelectedSlotId(null);
                    }}
                  >
                    <span className="booking-calendar__weekday">
                      {day.weekday}
                    </span>
                    <span className="booking-calendar__daynum">{day.label}</span>
                    {day.isToday && (
                      <span className="booking-calendar__today">
                        {t("booking.today")}
                      </span>
                    )}
                    {isAvailable && <span className="booking-calendar__dot" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="booking-calendar__section">
            <div className="booking-calendar__section-title">
              <h4>{t("booking.timeTitle")}</h4>
              <span>
                {selectedDate ? formatLongDate(selectedDate) : ""}
              </span>
            </div>
            {(slotsByDate[selectedDate] ?? []).length === 0 ? (
              <div className="booking-calendar__empty">
                {t("booking.noSlotsForDate")}
              </div>
            ) : (
              <div className="booking-calendar__times">
                {(slotsByDate[selectedDate] ?? []).map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    className={`booking-calendar__time ${
                      selectedSlotId === slot.id ? "is-active" : ""
                    }`}
                    onClick={() => setSelectedSlotId(slot.id)}
                  >
                    <span className="booking-calendar__time-range">
                      {slot.startTime} – {slot.endTime}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="booking-calendar__section">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={bookingAcceptTerms}
                    onChange={(e) => setBookingAcceptTerms(e.target.checked)}
                  />
                }
                label={t("legal.acceptTermsBooking")}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={bookingAcceptPrivacy}
                    onChange={(e) => setBookingAcceptPrivacy(e.target.checked)}
                  />
                }
                label={t("legal.acceptPrivacy")}
              />
            </div>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBookingOpen(false)}
            color="inherit"
            sx={mobileDialogActionSx}
            aria-label={isMobile ? t("common.cancel") : undefined}
          >
            {isMobile ? (
              <CloseRoundedIcon fontSize="small" />
            ) : (
              t("common.cancel")
            )}
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmBooking}
            disabled={!selectedSlotId || bookingSaving}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? t("booking.confirmBooking") : undefined}
          >
            {bookingSaving ? (
              <CircularProgress size={18} color="inherit" />
            ) : isMobile ? (
              <EventAvailableRoundedIcon fontSize="small" />
            ) : (
              t("booking.confirmBooking")
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={guestCheckoutOpen}
        onClose={() => setGuestCheckoutOpen(false)}
        maxWidth="xs"
        fullWidth
        className="ui-dialog ui-dialog--compact booking-dialog"
        disableRestoreFocus
      >
        <DialogTitleWithClose
          title={t("booking.checkoutTitle")}
          onClose={() => setGuestCheckoutOpen(false)}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent sx={stackedDialogContentSx}>
          <Typography color="text.secondary">
            {t("booking.checkoutDescription")}
          </Typography>
          <TextField
            label="Email"
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label={t("common.firstName")}
            value={guestFirstName}
            onChange={(e) => setGuestFirstName(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label={t("common.lastName")}
            value={guestLastName}
            onChange={(e) => setGuestLastName(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label={t("common.phone")}
            value={formatRuPhoneInput(guestPhone)}
            onChange={(e) => setGuestPhone(formatRuPhoneInput(e.target.value))}
            placeholder={PHONE_MASK_TEMPLATE}
            inputProps={{ inputMode: "tel" }}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setGuestCheckoutOpen(false)}
            color="inherit"
            sx={mobileDialogActionSx}
            aria-label={isMobile ? t("common.cancel") : undefined}
          >
            {isMobile ? (
              <CloseRoundedIcon fontSize="small" />
            ) : (
              t("common.cancel")
            )}
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleGuestCheckout()}
            disabled={bookingSaving}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? t("booking.bookTrialAndContinue") : undefined}
          >
            {bookingSaving ? (
              <CircularProgress size={18} color="inherit" />
            ) : isMobile ? (
              <EventAvailableRoundedIcon fontSize="small" />
            ) : (
              t("booking.bookTrialAndContinue")
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        fullWidth
        maxWidth="xs"
        className="ui-dialog ui-dialog--compact booking-dialog"
        disableRestoreFocus
      >
        <DialogTitleWithClose
          title={t("booking.attentionTitle")}
          onClose={() => setMessageOpen(false)}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent>{messageText}</DialogContent>
        <DialogActions>
          <Button
            onClick={() => setMessageOpen(false)}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? t("common.close") : undefined}
          >
            {isMobile ? (
              <CloseRoundedIcon fontSize="small" />
            ) : (
              t("common.close")
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
