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

const SURNAME_ENDINGS = [
  "ов",
  "ова",
  "ев",
  "ева",
  "ин",
  "ина",
  "ын",
  "ына",
  "ский",
  "ская",
  "цкий",
  "цкая",
  "ко",
  "юк",
  "ич",
];

const isLikelySurnameToken = (value: string) => {
  const token = toTitleToken(value).toLocaleLowerCase("ru-RU");
  if (!token) return false;
  return SURNAME_ENDINGS.some((ending) => token.endsWith(ending));
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

export const formatUserPrimaryName = (source: UserDisplaySource) => {
  const firstName = normalizeWhitespace(source.firstName ?? "");
  if (firstName) {
    return firstName;
  }
  return formatUserShortName(source);
};

export const formatUserBadgeName = (source: UserDisplaySource) => {
  const firstName = toTitleToken(source.firstName ?? "");
  const lastName = toTitleToken(source.lastName ?? "");
  if (firstName && lastName) {
    // Some profiles still have swapped first/last names in persisted data.
    // For the header badge we must always prefer the given name.
    if (isLikelySurnameToken(firstName) && !isLikelySurnameToken(lastName)) {
      return lastName;
    }
    return firstName;
  }
  if (firstName) return firstName;
  if (lastName) return lastName;
  return formatUserPrimaryName(source);
};

export const getUserAvatarInitial = (source: UserDisplaySource) => {
  const displayName = formatUserShortName(source).replace(".", "");
  return toUpperInitial(displayName) || "П";
};
