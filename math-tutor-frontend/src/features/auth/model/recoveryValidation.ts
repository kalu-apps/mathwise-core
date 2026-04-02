export type RecoveryResetValidationMessages = {
  tokenRequired: string;
  tokenInvalidFormat: string;
  passwordRequired: string;
  passwordTooShort: string;
};

export type RecoveryResetValidationResult = {
  tokenError: string | null;
  passwordError: string | null;
};

const RECOVERY_CODE_PATTERN = /^\d{6}$/;

export const validateRecoveryResetFields = (
  token: string,
  password: string,
  messages: RecoveryResetValidationMessages,
  minPasswordLength = 10
): RecoveryResetValidationResult => {
  const normalizedToken = token.trim();
  const normalizedPassword = password.trim();

  let tokenError: string | null = null;
  let passwordError: string | null = null;

  if (!normalizedToken) {
    tokenError = messages.tokenRequired;
  } else if (!RECOVERY_CODE_PATTERN.test(normalizedToken)) {
    tokenError = messages.tokenInvalidFormat;
  }

  if (!normalizedPassword) {
    passwordError = messages.passwordRequired;
  } else if (normalizedPassword.length < minPasswordLength) {
    passwordError = messages.passwordTooShort;
  }

  return { tokenError, passwordError };
};
