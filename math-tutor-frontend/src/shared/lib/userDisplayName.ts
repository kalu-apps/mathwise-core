type UserDisplaySource = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const toTitleToken = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  const [head] = normalized.split(" ");
  return head || "";
};

const getEmailLocalPart = (email?: string | null) => {
  if (!email) return "";
  const [local] = email.trim().toLowerCase().split("@");
  return (local || "").trim();
};

const toUpperInitial = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized[0]?.toLocaleUpperCase("ru-RU") ?? "";
};

export const formatUserShortName = (source: UserDisplaySource) => {
  const firstName = toTitleToken(source.firstName ?? "");
  const lastName = toTitleToken(source.lastName ?? "");
  const localPart = getEmailLocalPart(source.email);

  if (firstName && lastName) {
    return `${firstName} ${toUpperInitial(lastName)}.`;
  }
  if (firstName) {
    return firstName;
  }
  if (localPart) {
    return localPart;
  }
  return "Профиль";
};

export const getUserAvatarInitial = (source: UserDisplaySource) => {
  const displayName = formatUserShortName(source).replace(".", "");
  return toUpperInitial(displayName) || "П";
};
