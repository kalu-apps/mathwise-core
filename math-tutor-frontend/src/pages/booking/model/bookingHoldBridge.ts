export const mapBookingHoldResolutionMessage = (
  codeOrAction: string | undefined
): string | null => {
  const normalized = (codeOrAction ?? "").trim();
  if (!normalized) return null;
  switch (normalized) {
    case "slot_hold_expired":
    case "slot_hold_inactive":
    case "hold_expired":
    case "hold_released":
      return "Время удержания слота истекло. Выберите новый слот.";
    case "slot_hold_consumed":
    case "hold_consumed":
      return "Этот slot hold уже использован. Выберите новое время.";
    case "login_required_existing_account":
    case "identity_conflict_auth_required":
      return "Пользователь с этим email уже существует. Авторизуйтесь и подтвердите запись.";
    default:
      return null;
  }
};
