import { AUTH_STORAGE_KEY } from "@/features/auth/model/constants";
import { APP_DATA_UPDATED_STORAGE_KEY } from "@/shared/lib/dataUpdateBus";
import { NEWS_FEED_UPDATED_STORAGE_KEY } from "@/entities/news/model/storage";
import { OUTBOX_STORAGE_KEY } from "@/shared/lib/outbox";
import { removeStorage } from "@/shared/lib/localDb";
import { ASSESSMENTS_STORAGE_KEY } from "@/features/assessments/model/types";
import { ASSESSMENT_SESSION_STORAGE_KEY } from "@/features/assessments/model/storage";

const DEV_RESET_STORAGE_KEYS = [
  AUTH_STORAGE_KEY,
  APP_DATA_UPDATED_STORAGE_KEY,
  NEWS_FEED_UPDATED_STORAGE_KEY,
  OUTBOX_STORAGE_KEY,
  ASSESSMENTS_STORAGE_KEY,
  ASSESSMENT_SESSION_STORAGE_KEY,
] as const;

export const clearClientStateForDevReset = () => {
  DEV_RESET_STORAGE_KEYS.forEach((key) => removeStorage(key));
};
