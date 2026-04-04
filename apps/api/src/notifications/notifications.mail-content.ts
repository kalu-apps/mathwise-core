import type { ApiAppEnv } from "../config/runtime.config";
import type { NotificationTemplate } from "./notifications.types";

type NotificationMailContentInput = {
  template: NotificationTemplate;
  payload: Record<string, unknown>;
  appEnv: ApiAppEnv;
  subjectPrefix: string;
  appendStageFooter: boolean;
};

export type NotificationMailContent = {
  subject: string;
  text: string;
  html: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pickString = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const pickAmount = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toLocaleString("ru-RU")} ₽`;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
};

const withPrefix = (subjectPrefix: string, subject: string) => {
  const normalizedPrefix = subjectPrefix.trim();
  if (!normalizedPrefix) return subject;
  return `${normalizedPrefix} ${subject}`.trim();
};

const maybeStageFooter = (appEnv: ApiAppEnv, appendStageFooter: boolean) => {
  if (!appendStageFooter) {
    return { text: "", html: "" };
  }
  const marker = appEnv === "stage" ? "stage" : appEnv;
  return {
    text: `\n\n---\nЭто системное письмо из окружения ${marker}.`,
    html: `<p style="margin:16px 0 0;font-size:12px;color:#6b7280">Это системное письмо из окружения ${escapeHtml(
      marker
    )}.</p>`,
  };
};

const wrapHtml = (title: string, body: string, footerHtml: string) => `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
    <h2 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h2>
    ${body}
    <p style="margin:16px 0 0;font-size:13px;color:#4b5563">Если это были не вы — просто проигнорируйте письмо.</p>
    ${footerHtml}
  </div>
`;

export const buildNotificationMailContent = (
  input: NotificationMailContentInput
): NotificationMailContent => {
  const footer = maybeStageFooter(input.appEnv, input.appendStageFooter);

  switch (input.template) {
    case "login_hint": {
      const code = pickString(input.payload, "code");
      const subject = withPrefix(input.subjectPrefix, "Код для входа в Mathwise");
      const text = code
        ? `Ваш код для входа в Mathwise: ${code}\nКод действителен ограниченное время.${footer.text}`
        : `Вход в Mathwise был запрошен для этого email. Если это были не вы, просто игнорируйте письмо.${footer.text}`;
      const html = code
        ? wrapHtml(
            "Код для входа",
            `<p style="margin:0 0 10px">Ваш код для входа в Mathwise:</p><p style="margin:0 0 10px;font-size:28px;font-weight:700;letter-spacing:4px">${escapeHtml(
              code
            )}</p><p style="margin:0">Код действителен ограниченное время.</p>`,
            footer.html
          )
        : wrapHtml(
            "Вход в Mathwise",
            "<p style=\"margin:0\">Запрошен вход в аккаунт Mathwise. Если это были не вы, просто игнорируйте письмо.</p>",
            footer.html
          );
      return { subject, text, html };
    }
    case "recovery_requested": {
      const code = pickString(input.payload, "recoveryCode");
      const subject = withPrefix(
        input.subjectPrefix,
        "Код восстановления доступа в Mathwise"
      );
      const text = code
        ? `Ваш код восстановления: ${code}\nВведите его в форме восстановления пароля.${footer.text}`
        : `Запрошено восстановление доступа к аккаунту Mathwise.${footer.text}`;
      const html = code
        ? wrapHtml(
            "Код восстановления",
            `<p style="margin:0 0 10px">Используйте этот код для восстановления доступа:</p><p style="margin:0 0 10px;font-size:28px;font-weight:700;letter-spacing:4px">${escapeHtml(
              code
            )}</p>`,
            footer.html
          )
        : wrapHtml(
            "Восстановление доступа",
            "<p style=\"margin:0\">Мы получили запрос на восстановление доступа к вашему аккаунту Mathwise.</p>",
            footer.html
          );
      return { subject, text, html };
    }
    case "registration": {
      const subject = withPrefix(input.subjectPrefix, "Добро пожаловать в Mathwise");
      const text = `Регистрация прошла успешно. Ваш аккаунт готов к работе.${footer.text}`;
      const html = wrapHtml(
        "Добро пожаловать в Mathwise",
        "<p style=\"margin:0\">Регистрация прошла успешно. Ваш аккаунт готов к работе.</p>",
        footer.html
      );
      return { subject, text, html };
    }
    case "purchase_confirmed": {
      const amount = pickAmount(input.payload, "amount");
      const subject = withPrefix(input.subjectPrefix, "Оплата курса подтверждена");
      const amountLine = amount ? `\nСумма: ${amount}` : "";
      const text = `Платеж успешно подтвержден.${amountLine}${footer.text}`;
      const html = wrapHtml(
        "Оплата курса подтверждена",
        `<p style="margin:0">Платеж успешно подтвержден.${
          amount ? ` Сумма: <strong>${escapeHtml(amount)}</strong>.` : ""
        }</p>`,
        footer.html
      );
      return { subject, text, html };
    }
    case "purchase_access_granted": {
      const subject = withPrefix(input.subjectPrefix, "Доступ к курсу открыт");
      const text = `Покупка обработана успешно. Доступ к материалам курса уже открыт.${footer.text}`;
      const html = wrapHtml(
        "Доступ к курсу открыт",
        "<p style=\"margin:0\">Покупка обработана успешно. Доступ к материалам курса уже открыт.</p>",
        footer.html
      );
      return { subject, text, html };
    }
    default: {
      const subject = withPrefix(input.subjectPrefix, "Уведомление Mathwise");
      const text = `У вас новое уведомление в Mathwise.${footer.text}`;
      const html = wrapHtml(
        "Уведомление",
        "<p style=\"margin:0\">У вас новое уведомление в Mathwise.</p>",
        footer.html
      );
      return { subject, text, html };
    }
  }
};
