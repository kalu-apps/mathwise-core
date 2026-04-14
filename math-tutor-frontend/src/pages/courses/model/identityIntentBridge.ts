export const mapIdentityIntentStatusMessage = (state: string): string => {
  switch (state) {
    case "verified":
      return "Identity подтвержден. Можно переходить к оплате.";
    case "pending":
      return "Введите код из письма, чтобы подтвердить identity перед checkout.";
    case "expired":
      return "Сессия подтверждения истекла. Запросите новый код.";
    case "consumed":
      return "Эта сессия уже использована. Запросите новый код для следующего checkout.";
    case "conflict":
      return "Identity в конфликте с существующим аккаунтом. Войдите в кабинет и повторите покупку.";
    default:
      return "Не удалось определить состояние проверки identity.";
  }
};

export const normalizeIdentityIntentCode = (value: string) =>
  value.replace(/\D+/g, "").slice(0, 6);
