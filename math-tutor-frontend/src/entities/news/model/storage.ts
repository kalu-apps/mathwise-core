import { api } from "@/shared/api/client";
import { writeStorage } from "@/shared/lib/localDb";
import type {
  CreateNewsPostPayload,
  NewsPost,
  UpdateNewsPostPayload,
} from "@/entities/news/model/types";

export const NEWS_FEED_UPDATED_STORAGE_KEY = "news-feed-updated";
const NEWS_FEED_UPDATED_TTL_MS = 24 * 60 * 60 * 1000;

const notifyNewsUpdate = () => {
  if (typeof window === "undefined") return;
  try {
    writeStorage(NEWS_FEED_UPDATED_STORAGE_KEY, Date.now(), {
      ttlMs: NEWS_FEED_UPDATED_TTL_MS,
    });
  } catch {
    // ignore
  }
};

export async function getNewsFeed(): Promise<NewsPost[]> {
  return api.get<NewsPost[]>("/news");
}

export async function createNewsPost(
  payload: CreateNewsPostPayload
): Promise<NewsPost> {
  const created = await api.post<NewsPost>("/news", payload);
  notifyNewsUpdate();
  return created;
}

export async function updateNewsPost(
  newsId: string,
  payload: UpdateNewsPostPayload,
  actorId: string
): Promise<NewsPost> {
  const query = `?actorId=${encodeURIComponent(actorId)}`;
  const updated = await api.put<NewsPost>(
    `/news/${encodeURIComponent(newsId)}${query}`,
    payload
  );
  notifyNewsUpdate();
  return updated;
}

export async function deleteNewsPost(
  newsId: string,
  actorId: string
): Promise<{ id: string }> {
  const query = `?actorId=${encodeURIComponent(actorId)}`;
  const deleted = await api.del<{ id: string }>(
    `/news/${encodeURIComponent(newsId)}${query}`
  );
  notifyNewsUpdate();
  return deleted;
}
