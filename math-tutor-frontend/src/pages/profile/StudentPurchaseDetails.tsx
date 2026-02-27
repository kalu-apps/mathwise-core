import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Divider,
} from "@mui/material";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  attachCheckoutPurchase,
  getPurchases,
  payBnplInstallment,
  payBnplRemaining,
} from "@/entities/purchase/model/storage";
import type { Purchase } from "@/entities/purchase/model/types";
import { selectPurchaseFinancialView } from "@/entities/purchase/model/selectors";
import {
  cancelPaymentAttempt,
  confirmPaymentAttemptPaid,
  loadPaymentAttemptsForPurchase,
  retryPaymentAttempt,
  selectCheckoutPaymentView,
  selectPaymentAttemptsHistory,
  type PaymentAttempt,
} from "@/entities/purchase/model/paymentAttempts";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { PageLoader } from "@/shared/ui/loading";
import { useRecoverAccessNotice } from "@/features/auth/model/useRecoverAccessNotice";
import { AccessStateBanner } from "@/shared/ui/AccessStateBanner";
import { BackNavButton } from "@/shared/ui/BackNavButton";

const statusLabelMap: Record<string, string> = {
  ok: "Платежи в норме",
  upcoming: "Скоро платеж",
  grace: "Льготный период",
  restricted: "Ограничен новый контент",
  suspended: "Доступ приостановлен",
};

const statusClassMap: Record<string, string> = {
  ok: "ui-status-chip--paid",
  upcoming: "ui-status-chip--scheduled",
  grace: "ui-status-chip--warning",
  restricted: "ui-status-chip--warning",
  suspended: "ui-status-chip--danger",
};

const attemptStatusLabelMap: Record<string, string> = {
  initiated: "Создана",
  pending: "В обработке",
  succeeded: "Успешно",
  failed: "Ошибка",
  canceled: "Отменена",
  expired: "Истекла",
};

const attemptStatusClassMap: Record<string, string> = {
  initiated: "ui-status-chip--scheduled",
  pending: "ui-status-chip--scheduled",
  succeeded: "ui-status-chip--paid",
  failed: "ui-status-chip--danger",
  canceled: "ui-status-chip--warning",
  expired: "ui-status-chip--warning",
};

export default function StudentPurchaseDetails() {
  const { purchaseId } = useParams<{ purchaseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, openAuthModal, openRecoverModal } = useAuth();

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachInProgress, setAttachInProgress] = useState(false);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptActionLoadingId, setAttemptActionLoadingId] = useState<
    string | null
  >(null);
  const [installmentPaymentLoading, setInstallmentPaymentLoading] = useState(false);
  const [remainingPaymentLoading, setRemainingPaymentLoading] = useState(false);
  const [paymentAttempts, setPaymentAttempts] = useState<PaymentAttempt[]>([]);
  const {
    state: accessNoticeState,
    recheck: recheckAccessNotice,
    repair: repairAccessNotice,
  } = useRecoverAccessNotice({
    email: user?.email,
    role: user?.role,
  });

  const loadPurchase = useCallback(async () => {
    if (!user?.id || !purchaseId) {
      setPurchase(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const purchases = await getPurchases({ userId: user.id });
      const current = purchases.find((item) => item.id === purchaseId) ?? null;
      if (!current) {
        setError("Покупка не найдена или недоступна в вашем профиле.");
        setPurchase(null);
        return;
      }
      setPurchase(current);
      if (current) {
        setAttemptsLoading(true);
        const attempts = await loadPaymentAttemptsForPurchase({
          purchase: current,
          userId: user.id,
          email: user.email,
        });
        setPaymentAttempts(attempts);
      } else {
        setPaymentAttempts([]);
      }
    } catch {
      setError("Не удалось загрузить детали оплаты. Попробуйте еще раз.");
      setPurchase(null);
      setPaymentAttempts([]);
    } finally {
      setAttemptsLoading(false);
      setLoading(false);
    }
  }, [purchaseId, user?.email, user?.id]);

  useEffect(() => {
    void loadPurchase();
  }, [loadPurchase]);

  const financialView = useMemo(
    () => (purchase ? selectPurchaseFinancialView(purchase) : null),
    [purchase]
  );
  const paymentAttemptsHistory = useMemo(
    () => selectPaymentAttemptsHistory(paymentAttempts),
    [paymentAttempts]
  );
  const latestPaymentAttemptView = useMemo(
    () => selectCheckoutPaymentView(paymentAttempts),
    [paymentAttempts]
  );
  const canPayInstallment = useMemo(() => {
    if (!financialView || financialView.paymentMethod !== "bnpl") return false;
    const paidCount = financialView.paidCount ?? 0;
    const installmentsCount = financialView.installmentsCount ?? 0;
    return installmentsCount > 0 && paidCount < installmentsCount;
  }, [financialView]);
  const canPayRemaining = useMemo(() => {
    if (!financialView || financialView.paymentMethod !== "bnpl") return false;
    const outstanding = financialView.schedule
      .filter((item) => item.status !== "paid")
      .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
    return outstanding > 0;
  }, [financialView]);

  const handleAttachAndRecheck = useCallback(async () => {
    if (!purchase?.checkoutId) {
      await repairAccessNotice();
      await loadPurchase();
      return;
    }
    try {
      setAttachInProgress(true);
      await attachCheckoutPurchase(purchase.checkoutId);
      await repairAccessNotice();
      await loadPurchase();
    } finally {
      setAttachInProgress(false);
    }
  }, [loadPurchase, purchase?.checkoutId, repairAccessNotice]);

  const handleBack = useCallback(() => {
    const fromPath =
      typeof (location.state as { from?: string } | null)?.from === "string"
        ? (location.state as { from?: string }).from
        : null;
    if (fromPath) {
      navigate(fromPath);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/student/profile?tab=courses");
  }, [location.state, navigate]);

  const refreshAttempts = useCallback(async () => {
    if (!purchase || !user?.id) return;
    setAttemptsLoading(true);
    try {
      const attempts = await loadPaymentAttemptsForPurchase({
        purchase,
        userId: user.id,
        email: user.email,
      });
      setPaymentAttempts(attempts);
    } finally {
      setAttemptsLoading(false);
    }
  }, [purchase, user?.email, user?.id]);

  const runAttemptAction = useCallback(
    async (
      attemptId: string,
      action: "retry" | "cancel" | "confirm",
      options?: { openRedirect?: boolean }
    ) => {
      if (!purchase) return;
      try {
        setAttemptActionLoadingId(attemptId);
        if (action === "retry") {
          const status = await retryPaymentAttempt(attemptId);
          if (
            options?.openRedirect &&
            typeof status.payment.redirectUrl === "string" &&
            status.payment.redirectUrl
          ) {
            window.open(status.payment.redirectUrl, "_blank", "noopener,noreferrer");
          }
        } else if (action === "confirm") {
          await confirmPaymentAttemptPaid(attemptId);
        } else {
          await cancelPaymentAttempt(attemptId);
        }
        await Promise.all([refreshAttempts(), loadPurchase()]);
      } catch {
        setError("Не удалось выполнить действие по попытке оплаты.");
      } finally {
        setAttemptActionLoadingId(null);
      }
    },
    [loadPurchase, purchase, refreshAttempts]
  );

  const handlePayInstallment = useCallback(
    async (source: "purchase_details" = "purchase_details") => {
      if (!purchase) return;
      try {
        setInstallmentPaymentLoading(true);
        setError(null);
        const result = await payBnplInstallment(purchase.id, { source });
        if (
          result.payment.requiresConfirmation &&
          typeof result.payment.redirectUrl === "string" &&
          result.payment.redirectUrl
        ) {
          window.open(result.payment.redirectUrl, "_blank", "noopener,noreferrer");
        }
        await Promise.all([refreshAttempts(), loadPurchase()]);
      } catch {
        setError("Не удалось зафиксировать платеж. Попробуйте повторить действие.");
      } finally {
        setInstallmentPaymentLoading(false);
      }
    },
    [loadPurchase, purchase, refreshAttempts]
  );

  const handlePayRemaining = useCallback(async () => {
    if (!purchase) return;
    try {
      setRemainingPaymentLoading(true);
      setError(null);
      const result = await payBnplRemaining(purchase.id, {
        source: "purchase_details",
      });
      if (
        result.payment.requiresConfirmation &&
        typeof result.payment.redirectUrl === "string" &&
        result.payment.redirectUrl
      ) {
        window.open(result.payment.redirectUrl, "_blank", "noopener,noreferrer");
      }
      await Promise.all([refreshAttempts(), loadPurchase()]);
    } catch {
      setError("Не удалось провести оплату остатка. Попробуйте повторить действие.");
    } finally {
      setRemainingPaymentLoading(false);
    }
  }, [loadPurchase, purchase, refreshAttempts]);

  if (loading) {
    return (
      <section className="purchase-details-page">
        <PageLoader
          className="purchase-details-page__loader"
          title="Загрузка деталей оплаты..."
          description="Проверяем график платежей и текущий статус покупки."
          minHeight={320}
        />
      </section>
    );
  }

  return (
    <section className="purchase-details-page">
      <div className="purchase-details-page__top-nav">
        <BackNavButton
          onClick={handleBack}
          className="purchase-details-page__back-button"
          aria-label="Назад"
        />
      </div>
      <div className="purchase-details-page__header">
        <div>
          <h1>Детали оплаты</h1>
          <p>Полная информация о покупке и статусе доступа к курсу.</p>
        </div>
      </div>

      {error && (
        <RecoverableErrorAlert
          error={error}
          onRetry={() => loadPurchase()}
          retryLabel="Повторить загрузку"
          forceRetry
        />
      )}

      {accessNoticeState && (
        <AccessStateBanner
          state={accessNoticeState}
          onLogin={openAuthModal}
          onRecover={() => openRecoverModal(user?.email)}
          onRecheck={async () => {
            await recheckAccessNotice();
            await loadPurchase();
          }}
          onCompleteProfile={() => navigate("/student/profile")}
        />
      )}

      {!purchase || !financialView ? (
        <div className="purchase-details-page__empty">
          <p>Данные покупки недоступны.</p>
          <Button variant="contained" onClick={handleBack}>
            Вернуться в профиль
          </Button>
        </div>
      ) : (
        <div className="purchase-details-page__grid">
          <article className="purchase-details-page__card">
            <div className="purchase-details-page__card-head">
              <h2>
                <ReceiptLongRoundedIcon fontSize="small" />
                Сводка покупки
              </h2>
              <span className="purchase-details-page__purchase-id">
                ID: {purchase.id}
              </span>
            </div>
            <div className="purchase-details-page__rows">
              <div>
                <span>Курс</span>
                <strong>{purchase.courseSnapshot?.title ?? "Курс"}</strong>
              </div>
              <div>
                <span>Итоговая сумма</span>
                <strong>{purchase.price.toLocaleString("ru-RU")} ₽</strong>
              </div>
              <div>
                <span>Способ оплаты</span>
                <strong>
                  {financialView.paymentMethod === "bnpl"
                    ? `Оплата частями (${financialView.providerLabel ?? "провайдер оплаты частями"})`
                    : "Оплачено полностью"}
                </strong>
              </div>
              <div>
                <span>Статус</span>
                <Chip
                  size="small"
                  label={statusLabelMap[financialView.financialStatus] ?? "Статус"}
                  className={`ui-status-chip ${
                    statusClassMap[financialView.financialStatus] ??
                    "ui-status-chip--scheduled"
                  }`}
                />
              </div>
            </div>
            {financialView.paymentMethod === "bnpl" && (
              <>
                <Divider />
                <div className="purchase-details-page__rows">
                  <div>
                    <span>Оплачено взносов</span>
                    <strong>
                      {financialView.paidCount ?? 0}/{financialView.installmentsCount ?? 0}
                    </strong>
                  </div>
                  {financialView.nextPaymentDate ? (
                    <div>
                      <span>Следующий платеж</span>
                      <strong>
                        {new Date(financialView.nextPaymentDate).toLocaleDateString(
                          "ru-RU"
                        )}
                      </strong>
                    </div>
                  ) : null}
                </div>
              </>
            )}
            <Divider />
            <div className="purchase-details-page__attempts-head">
              <strong>История попыток оплаты</strong>
              <Button
                size="small"
                startIcon={<RefreshRoundedIcon />}
                onClick={() => void refreshAttempts()}
                disabled={attemptsLoading}
              >
                Обновить
              </Button>
            </div>
            {latestPaymentAttemptView ? (
              <Alert severity="info" className="ui-alert">
                {latestPaymentAttemptView.actionableMessage}
              </Alert>
            ) : null}
            {attemptsLoading ? (
              <div className="purchase-details-page__attempts-loading">
                <CircularProgress size={18} />
                <span>Обновляем статус попыток...</span>
              </div>
            ) : paymentAttemptsHistory.length === 0 ? (
              <p className="purchase-details-page__muted">
                Попытки оплаты пока не найдены.
              </p>
            ) : (
              <div className="purchase-details-page__attempts-list">
                {paymentAttemptsHistory.map((attempt, index) => {
                  const isLatest = index === 0;
                  const isPending =
                    attempt.status === "pending" || attempt.status === "initiated";
                  const attemptBusy = attemptActionLoadingId === attempt.id;
                  return (
                    <div
                      className="purchase-details-page__attempt-row"
                      key={attempt.id}
                    >
                      <div className="purchase-details-page__attempt-meta">
                        <span>
                          {new Date(attempt.createdAt).toLocaleString("ru-RU")}
                        </span>
                        <strong>
                          {attempt.method.toUpperCase()} • {attempt.provider}
                        </strong>
                      </div>
                      <Chip
                        size="small"
                        label={
                          attemptStatusLabelMap[attempt.status] ?? attempt.status
                        }
                        className={`ui-status-chip ${
                          attemptStatusClassMap[attempt.status] ??
                          "ui-status-chip--scheduled"
                        }`}
                      />
                      {isLatest ? (
                        <div className="purchase-details-page__attempt-actions">
                          {latestPaymentAttemptView?.requiresRedirect &&
                          latestPaymentAttemptView.redirectUrl ? (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<OpenInNewRoundedIcon />}
                              onClick={() =>
                                window.open(
                                  latestPaymentAttemptView.redirectUrl,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }
                              disabled={attemptBusy}
                            >
                              Продолжить оплату
                            </Button>
                          ) : null}
                          {isPending ? (
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<RefreshRoundedIcon />}
                              onClick={() =>
                                void runAttemptAction(attempt.id, "confirm")
                              }
                              disabled={attemptBusy}
                            >
                              Я оплатил
                            </Button>
                          ) : null}
                          {latestPaymentAttemptView?.canCancel && isPending ? (
                            <Button
                              size="small"
                              variant="text"
                              startIcon={<CancelRoundedIcon />}
                              onClick={() =>
                                void runAttemptAction(attempt.id, "cancel")
                              }
                              disabled={attemptBusy}
                            >
                              Отменить
                            </Button>
                          ) : null}
                          {latestPaymentAttemptView?.canRetry &&
                          attempt.status !== "succeeded" ? (
                            <Button
                              size="small"
                              variant="text"
                              startIcon={<RefreshRoundedIcon />}
                              onClick={() =>
                                void runAttemptAction(attempt.id, "retry", {
                                  openRedirect: true,
                                })
                              }
                              disabled={attemptBusy}
                            >
                              Повторить
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            {financialView.paymentMethod !== "bnpl" ? (
              <>
                <Divider />
                <div className="purchase-details-page__summary-actions">
                  <Button
                    variant="outlined"
                    startIcon={<SupportAgentRoundedIcon />}
                    onClick={() => navigate("/booking")}
                  >
                    Связаться с тех. поддержкой
                  </Button>
                  {purchase.checkoutId ? (
                    <Button
                      variant="contained"
                      startIcon={
                        attachInProgress ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <RefreshRoundedIcon />
                        )
                      }
                      onClick={() => void handleAttachAndRecheck()}
                      disabled={attachInProgress}
                    >
                      {attachInProgress ? "Синхронизация..." : "Проверить доступ"}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </article>

          {financialView.paymentMethod === "bnpl" ? (
            <article className="purchase-details-page__card">
              <div className="purchase-details-page__card-head">
                <h2>
                  <CalendarMonthRoundedIcon fontSize="small" />
                  График платежей
                </h2>
              </div>
              {financialView.schedule.length === 0 ? (
                <Alert severity="info" className="ui-alert">
                  Точный график пока недоступен. Детали синхронизируются с
                  провайдером оплаты.
                </Alert>
              ) : (
                <div className="purchase-details-page__schedule">
                  {financialView.schedule.map((item, index) => (
                    <div
                      className="purchase-details-page__schedule-row"
                      key={`${item.dueDate}-${index}`}
                    >
                      <span>
                        {new Date(item.dueDate).toLocaleDateString("ru-RU")}
                      </span>
                      <strong>{item.amount.toLocaleString("ru-RU")} ₽</strong>
                      <em
                        className={`ui-status-chip ${
                          item.status === "paid"
                            ? "ui-status-chip--paid"
                            : item.status === "due"
                              ? "ui-status-chip--scheduled"
                              : "ui-status-chip--warning"
                        }`}
                      >
                        {item.status === "paid"
                          ? "Оплачено"
                          : item.status === "due"
                            ? "К оплате"
                            : "Просрочен"}
                      </em>
                    </div>
                  ))}
                </div>
              )}
              <div className="purchase-details-page__bnpl-actions-inline">
                <Button
                  variant="contained"
                  startIcon={
                    installmentPaymentLoading ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <RefreshRoundedIcon />
                    )
                  }
                  onClick={() => void handlePayInstallment("purchase_details")}
                  disabled={!canPayInstallment || installmentPaymentLoading}
                >
                  {installmentPaymentLoading ? "Фиксируем..." : "Следующий взнос"}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={
                    remainingPaymentLoading ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <CalendarMonthRoundedIcon />
                    )
                  }
                  onClick={() => void handlePayRemaining()}
                  disabled={!canPayRemaining || remainingPaymentLoading}
                >
                  {remainingPaymentLoading ? "Фиксируем..." : "Весь остаток"}
                </Button>
              </div>
              <Alert severity="info" className="ui-alert">
                Логика оплаты как у сплит-провайдеров (Подели/Долями): можно оплатить
                ближайший взнос либо погасить весь остаток. Доступ обновляется сразу после
                подтверждения платежа.
              </Alert>
              <Button
                variant="outlined"
                startIcon={<SupportAgentRoundedIcon />}
                onClick={() => navigate("/booking")}
              >
                Связаться с тех. поддержкой
              </Button>
              {purchase.checkoutId ? (
                <Button
                  variant="contained"
                  startIcon={
                    attachInProgress ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <RefreshRoundedIcon />
                    )
                  }
                  onClick={() => void handleAttachAndRecheck()}
                  disabled={attachInProgress}
                >
                  {attachInProgress ? "Синхронизация..." : "Проверить доступ"}
                </Button>
              ) : null}
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}
