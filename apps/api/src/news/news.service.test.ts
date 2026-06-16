import assert from "node:assert/strict";
import test from "node:test";
import { NewsService } from "./news.service";
import type { NewsPostDto } from "./news.types";

type InMemoryNewsRepository = {
  ensureSchema: () => Promise<void>;
  listAll: () => Promise<NewsPostDto[]>;
  findById: (id: string) => Promise<NewsPostDto | null>;
  insert: (post: NewsPostDto) => Promise<NewsPostDto>;
  update: (post: NewsPostDto) => Promise<NewsPostDto | null>;
  deleteById: (id: string) => Promise<boolean>;
  store: NewsPostDto[];
};

const createRepository = (seed: NewsPostDto[] = []): InMemoryNewsRepository => {
  const store = [...seed];
  return {
    store,
    ensureSchema: async () => undefined,
    listAll: async () => [...store],
    findById: async (id) => store.find((item) => item.id === id) ?? null,
    insert: async (post) => {
      store.unshift(post);
      return post;
    },
    update: async (post) => {
      const index = store.findIndex((item) => item.id === post.id);
      if (index < 0) return null;
      store[index] = post;
      return post;
    },
    deleteById: async (id) => {
      const index = store.findIndex((item) => item.id === id);
      if (index < 0) return false;
      store.splice(index, 1);
      return true;
    },
  };
};

const createMediaServiceMock = (options?: {
  onRelease?: (params: {
    objectIds: string[];
    reason?: string;
  }) => Promise<void> | void;
}) =>
  ({
    getRuntimeDownloadUrlByObjectId: async (objectId: string) => ({
      objectId,
      contentType: "image/png",
      downloadUrl: `https://example.test/media/${objectId}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    releaseMediaObjects: async (params: {
      objectIds: string[];
      reason?: string;
    }) => {
      await options?.onRelease?.(params);
    },
  }) as never;

test("news: student feed hides targeted course updates for other students", async () => {
  const repository = createRepository([
    {
      id: "news_1",
      authorId: "teacher_1",
      authorName: "Teacher One",
      title: "Public",
      content: "Visible for all",
      tone: "general",
      highlighted: false,
      visibility: "all",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
      targetUserIds: [],
    },
    {
      id: "news_2",
      authorId: "teacher_1",
      authorName: "Teacher One",
      title: "Targeted",
      content: "Only selected students",
      tone: "course_update",
      highlighted: true,
      visibility: "course_students",
      createdAt: "2026-04-03T00:00:01.000Z",
      updatedAt: "2026-04-03T00:00:01.000Z",
      targetUserIds: ["student_target"],
    },
  ]);
  const service = new NewsService(repository as never, createMediaServiceMock());

  const feed = await service.listForActor({
    id: "student_other",
    role: "student",
    email: "student@example.com",
    firstName: "Student",
    lastName: "Other",
  });

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, "news_1");
});

test("news: teacher can create and update own post", async () => {
  const repository = createRepository();
  const service = new NewsService(repository as never, createMediaServiceMock());
  const teacher = {
    id: "teacher_1",
    role: "teacher" as const,
    email: "teacher@example.com",
    firstName: "Teacher",
    lastName: "One",
  };

  const created = await service.create({
    actorUser: teacher,
    payload: {
      authorId: teacher.id,
      title: "New announcement",
      content: "Content",
      tone: "important",
      visibility: "all",
    },
  });

  assert.equal(created.authorId, teacher.id);
  assert.equal(repository.store.length, 1);

  const updated = await service.update({
    actorUser: teacher,
    newsId: created.id,
    actorId: teacher.id,
    payload: { title: "Updated title" },
  });

  assert.equal(updated.title, "Updated title");
});

test("news: update releases media detached from attachments", async () => {
  const teacher = {
    id: "teacher_1",
    role: "teacher" as const,
    email: "teacher@example.com",
    firstName: "Teacher",
    lastName: "One",
  };
  const repository = createRepository([
    {
      id: "news_1",
      authorId: teacher.id,
      authorName: "Teacher One",
      title: "Announcement",
      content: "Content",
      tone: "general",
      highlighted: false,
      visibility: "all",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
      targetUserIds: [],
      attachments: [
        {
          id: "attachment_old",
          kind: "image",
          mediaObjectId: "media_old",
        },
        {
          id: "attachment_keep",
          kind: "video",
          mediaObjectId: "media_keep",
        },
      ],
    },
  ]);
  const released: string[][] = [];
  const service = new NewsService(
    repository as never,
    createMediaServiceMock({
      onRelease: async (params) => {
        const saved = await repository.findById("news_1");
        assert.deepEqual(
          (saved?.attachments ?? []).map((attachment) => attachment.mediaObjectId),
          ["media_keep", "media_new"]
        );
        released.push(params.objectIds);
      },
    })
  );

  await service.update({
    actorUser: teacher,
    newsId: "news_1",
    actorId: teacher.id,
    payload: {
      attachments: [
        {
          id: "attachment_keep",
          kind: "video",
          mediaObjectId: "media_keep",
        },
        {
          id: "attachment_new",
          kind: "image",
          mediaObjectId: "media_new",
        },
      ],
    },
  });

  assert.equal(released.length, 1);
  assert.deepEqual(released[0], ["media_old"]);
});

test("news: delete releases attached media after removing post", async () => {
  const teacher = {
    id: "teacher_1",
    role: "teacher" as const,
    email: "teacher@example.com",
    firstName: "Teacher",
    lastName: "One",
  };
  const repository = createRepository([
    {
      id: "news_1",
      authorId: teacher.id,
      authorName: "Teacher One",
      title: "Announcement",
      content: "Content",
      tone: "general",
      highlighted: false,
      visibility: "all",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
      targetUserIds: [],
      attachments: [
        {
          id: "attachment_image",
          kind: "image",
          mediaObjectId: "media_image",
        },
        {
          id: "attachment_external",
          kind: "image",
          url: "https://example.test/external.png",
        },
      ],
    },
  ]);
  const released: string[][] = [];
  const service = new NewsService(
    repository as never,
    createMediaServiceMock({
      onRelease: (params) => {
        assert.equal(repository.store.length, 0);
        released.push(params.objectIds);
      },
    })
  );

  const deleted = await service.delete({
    actorUser: teacher,
    newsId: "news_1",
    actorId: teacher.id,
  });

  assert.deepEqual(deleted, { id: "news_1" });
  assert.equal(released.length, 1);
  assert.deepEqual(released[0], ["media_image"]);
});

test("news: student cannot create post", async () => {
  const repository = createRepository();
  const service = new NewsService(repository as never, createMediaServiceMock());

  await assert.rejects(
    () =>
      service.create({
        actorUser: {
          id: "student_1",
          role: "student",
          email: "student@example.com",
          firstName: "Student",
          lastName: "One",
        },
        payload: {
          title: "Nope",
          content: "Nope",
          tone: "general",
        },
      }),
    (error: unknown) => {
      if (!(error instanceof Error)) return false;
      return "getStatus" in error && typeof (error as { getStatus: () => number }).getStatus === "function"
        ? (error as { getStatus: () => number }).getStatus() === 403
        : false;
    }
  );
});
