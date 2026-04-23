import { Pool } from "pg";

type TablePresenceRow = {
  chatTable: string | null;
  mediaTable: string | null;
};

type MessageSummaryRow = {
  totalMessages: string;
  messagesWithAttachments: string;
  totalAttachmentItems: string;
  messagesWithDataUrlAttachments: string;
};

type AttachmentSummaryRow = {
  totalAttachmentRows: string;
  dataUrlRows: string;
  httpUrlRows: string;
  mediaObjectIdRows: string;
  noMediaObjectIdRows: string;
  mediaIdWithDataUrlRows: string;
  mediaIdWithoutUrlRows: string;
  brokenRows: string;
  dataUrlTotalChars: string;
  estimatedBinaryBytesFromDataUrl: string;
  maxUrlChars: string;
};

type TopDataUrlRow = {
  messageId: string;
  threadId: string;
  createdAt: string;
  senderId: string;
  attachmentId: string;
  attachmentName: string;
  mimeType: string;
  urlChars: string;
  urlPrefix: string;
};

type TableSizeRow = {
  chatMessagesHeapSize: string;
  chatMessagesTotalSize: string;
};

type MediaTableSizeRow = {
  mediaObjectsHeapSize: string;
  mediaObjectsTotalSize: string;
};

type MediaLinkSummaryRow = {
  distinctMediaIdsInChat: string;
  mediaIdsFoundInMediaObjects: string;
  mediaIdsMissingInMediaObjects: string;
};

type MediaStateRow = {
  state: string;
  count: string;
};

type MissingMediaIdRow = {
  mediaObjectId: string;
};

const nf = new Intl.NumberFormat("ru-RU");

const toSafeNumber = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
};

const requireDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return databaseUrl;
  throw new Error(
    "DATABASE_URL is not set. Export DATABASE_URL and rerun audit."
  );
};

const ATTACHMENTS_ARRAY_SQL = `CASE
  WHEN jsonb_typeof(COALESCE(m.attachments_json, '[]'::jsonb)) = 'array'
    THEN COALESCE(m.attachments_json, '[]'::jsonb)
  ELSE '[]'::jsonb
END`;

async function main() {
  const databaseUrl = requireDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const presence = await pool.query<TablePresenceRow>(
      `
        SELECT
          to_regclass('public.chat_messages')::text AS "chatTable",
          to_regclass('public.media_objects')::text AS "mediaTable"
      `
    );
    const tables = presence.rows[0];

    if (!tables?.chatTable) {
      // eslint-disable-next-line no-console
      console.log("[chat-media-audit] table public.chat_messages not found");
      return;
    }

    const messageSummary = await pool.query<MessageSummaryRow>(
      `
        WITH normalized AS (
          SELECT
            CASE
              WHEN jsonb_typeof(COALESCE(attachments_json, '[]'::jsonb)) = 'array'
                THEN COALESCE(attachments_json, '[]'::jsonb)
              ELSE '[]'::jsonb
            END AS attachments
          FROM chat_messages
        )
        SELECT
          COUNT(*)::text AS "totalMessages",
          COUNT(*) FILTER (WHERE jsonb_array_length(attachments) > 0)::text AS "messagesWithAttachments",
          COALESCE(SUM(jsonb_array_length(attachments)), 0)::text AS "totalAttachmentItems",
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM jsonb_array_elements(attachments) AS attachment
              WHERE COALESCE(attachment->>'url', '') ~ '^data:'
            )
          )::text AS "messagesWithDataUrlAttachments"
        FROM normalized
      `
    );

    const attachmentSummary = await pool.query<AttachmentSummaryRow>(
      `
        WITH attachments AS (
          SELECT
            m.id AS message_id,
            m.thread_id,
            m.created_at,
            m.sender_id,
            m.deleted_for_all,
            a AS attachment
          FROM chat_messages m
          CROSS JOIN LATERAL jsonb_array_elements(${ATTACHMENTS_ARRAY_SQL}) AS a
        ),
        classified AS (
          SELECT
            message_id,
            thread_id,
            created_at,
            sender_id,
            deleted_for_all,
            COALESCE(attachment->>'id', '') AS attachment_id,
            COALESCE(attachment->>'name', '') AS attachment_name,
            LOWER(COALESCE(attachment->>'mimeType', '')) AS mime_type,
            COALESCE(attachment->>'url', '') AS url,
            COALESCE(attachment->>'mediaObjectId', '') AS media_object_id,
            LENGTH(COALESCE(attachment->>'url', '')) AS url_chars,
            CASE
              WHEN COALESCE(attachment->>'url', '') ~ '^data:' THEN TRUE
              ELSE FALSE
            END AS is_data_url,
            CASE
              WHEN COALESCE(attachment->>'url', '') ~ '^https?://' THEN TRUE
              ELSE FALSE
            END AS is_http_url
          FROM attachments
        )
        SELECT
          COUNT(*)::text AS "totalAttachmentRows",
          COUNT(*) FILTER (WHERE is_data_url)::text AS "dataUrlRows",
          COUNT(*) FILTER (WHERE is_http_url)::text AS "httpUrlRows",
          COUNT(*) FILTER (WHERE media_object_id <> '')::text AS "mediaObjectIdRows",
          COUNT(*) FILTER (WHERE media_object_id = '')::text AS "noMediaObjectIdRows",
          COUNT(*) FILTER (WHERE media_object_id <> '' AND is_data_url)::text AS "mediaIdWithDataUrlRows",
          COUNT(*) FILTER (WHERE media_object_id <> '' AND url = '')::text AS "mediaIdWithoutUrlRows",
          COUNT(*) FILTER (WHERE media_object_id = '' AND url = '')::text AS "brokenRows",
          COALESCE(SUM(url_chars) FILTER (WHERE is_data_url), 0)::text AS "dataUrlTotalChars",
          COALESCE(SUM(
            (LENGTH(regexp_replace(url, '^data:[^,]*,', '')) * 3) / 4
          ) FILTER (WHERE is_data_url), 0)::text AS "estimatedBinaryBytesFromDataUrl",
          COALESCE(MAX(url_chars), 0)::text AS "maxUrlChars"
        FROM classified
      `
    );

    const topDataUrlRows = await pool.query<TopDataUrlRow>(
      `
        WITH attachments AS (
          SELECT
            m.id AS message_id,
            m.thread_id,
            m.created_at,
            m.sender_id,
            a AS attachment
          FROM chat_messages m
          CROSS JOIN LATERAL jsonb_array_elements(${ATTACHMENTS_ARRAY_SQL}) AS a
        )
        SELECT
          message_id AS "messageId",
          thread_id AS "threadId",
          created_at AS "createdAt",
          sender_id AS "senderId",
          COALESCE(attachment->>'id', '') AS "attachmentId",
          COALESCE(attachment->>'name', '') AS "attachmentName",
          LOWER(COALESCE(attachment->>'mimeType', '')) AS "mimeType",
          LENGTH(COALESCE(attachment->>'url', ''))::text AS "urlChars",
          LEFT(COALESCE(attachment->>'url', ''), 96) AS "urlPrefix"
        FROM attachments
        WHERE COALESCE(attachment->>'url', '') ~ '^data:'
        ORDER BY LENGTH(COALESCE(attachment->>'url', '')) DESC
        LIMIT 10
      `
    );

    const tableSize = await pool.query<TableSizeRow>(
      `
        SELECT
          pg_size_pretty(pg_relation_size('public.chat_messages'::regclass)) AS "chatMessagesHeapSize",
          pg_size_pretty(pg_total_relation_size('public.chat_messages'::regclass)) AS "chatMessagesTotalSize"
      `
    );

    const messageStats = messageSummary.rows[0];
    const attachmentStats = attachmentSummary.rows[0];
    const chatSize = tableSize.rows[0];

    // eslint-disable-next-line no-console
    console.log("[chat-media-audit] message-summary");
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          totalMessages: nf.format(toSafeNumber(messageStats?.totalMessages)),
          messagesWithAttachments: nf.format(
            toSafeNumber(messageStats?.messagesWithAttachments)
          ),
          totalAttachmentItems: nf.format(
            toSafeNumber(messageStats?.totalAttachmentItems)
          ),
          messagesWithDataUrlAttachments: nf.format(
            toSafeNumber(messageStats?.messagesWithDataUrlAttachments)
          ),
          chatMessagesHeapSize: chatSize?.chatMessagesHeapSize,
          chatMessagesTotalSize: chatSize?.chatMessagesTotalSize,
        },
        null,
        2
      )
    );

    // eslint-disable-next-line no-console
    console.log("[chat-media-audit] attachment-summary");
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          totalAttachmentRows: nf.format(
            toSafeNumber(attachmentStats?.totalAttachmentRows)
          ),
          dataUrlRows: nf.format(toSafeNumber(attachmentStats?.dataUrlRows)),
          httpUrlRows: nf.format(toSafeNumber(attachmentStats?.httpUrlRows)),
          mediaObjectIdRows: nf.format(
            toSafeNumber(attachmentStats?.mediaObjectIdRows)
          ),
          noMediaObjectIdRows: nf.format(
            toSafeNumber(attachmentStats?.noMediaObjectIdRows)
          ),
          mediaIdWithDataUrlRows: nf.format(
            toSafeNumber(attachmentStats?.mediaIdWithDataUrlRows)
          ),
          mediaIdWithoutUrlRows: nf.format(
            toSafeNumber(attachmentStats?.mediaIdWithoutUrlRows)
          ),
          brokenRows: nf.format(toSafeNumber(attachmentStats?.brokenRows)),
          dataUrlTotalChars: nf.format(
            toSafeNumber(attachmentStats?.dataUrlTotalChars)
          ),
          estimatedBinaryBytesFromDataUrl: formatBytes(
            toSafeNumber(attachmentStats?.estimatedBinaryBytesFromDataUrl)
          ),
          maxUrlChars: nf.format(toSafeNumber(attachmentStats?.maxUrlChars)),
        },
        null,
        2
      )
    );

    if (topDataUrlRows.rows.length > 0) {
      // eslint-disable-next-line no-console
      console.log("[chat-media-audit] top-data-url-attachments");
      // eslint-disable-next-line no-console
      console.table(
        topDataUrlRows.rows.map((row) => ({
          messageId: row.messageId,
          threadId: row.threadId,
          createdAt: row.createdAt,
          senderId: row.senderId,
          attachmentId: row.attachmentId,
          attachmentName: row.attachmentName,
          mimeType: row.mimeType,
          urlChars: nf.format(toSafeNumber(row.urlChars)),
          urlPrefix: row.urlPrefix,
        }))
      );
    }

    if (tables.mediaTable) {
      const mediaSizes = await pool.query<MediaTableSizeRow>(
        `
          SELECT
            pg_size_pretty(pg_relation_size('public.media_objects'::regclass)) AS "mediaObjectsHeapSize",
            pg_size_pretty(pg_total_relation_size('public.media_objects'::regclass)) AS "mediaObjectsTotalSize"
        `
      );

      const mediaLinkSummary = await pool.query<MediaLinkSummaryRow>(
        `
          WITH chat_media_ids AS (
            SELECT DISTINCT COALESCE(a->>'mediaObjectId', '') AS media_object_id
            FROM chat_messages m
            CROSS JOIN LATERAL jsonb_array_elements(${ATTACHMENTS_ARRAY_SQL}) AS a
            WHERE COALESCE(a->>'mediaObjectId', '') <> ''
          )
          SELECT
            COUNT(*)::text AS "distinctMediaIdsInChat",
            COUNT(*) FILTER (WHERE mo.id IS NOT NULL)::text AS "mediaIdsFoundInMediaObjects",
            COUNT(*) FILTER (WHERE mo.id IS NULL)::text AS "mediaIdsMissingInMediaObjects"
          FROM chat_media_ids cm
          LEFT JOIN media_objects mo
            ON mo.id = cm.media_object_id
        `
      );

      const mediaStateSummary = await pool.query<MediaStateRow>(
        `
          WITH chat_media_ids AS (
            SELECT DISTINCT COALESCE(a->>'mediaObjectId', '') AS media_object_id
            FROM chat_messages m
            CROSS JOIN LATERAL jsonb_array_elements(${ATTACHMENTS_ARRAY_SQL}) AS a
            WHERE COALESCE(a->>'mediaObjectId', '') <> ''
          )
          SELECT
            mo.state AS state,
            COUNT(*)::text AS count
          FROM chat_media_ids cm
          JOIN media_objects mo
            ON mo.id = cm.media_object_id
          GROUP BY mo.state
          ORDER BY COUNT(*) DESC, mo.state ASC
        `
      );

      const missingMediaIds = await pool.query<MissingMediaIdRow>(
        `
          WITH chat_media_ids AS (
            SELECT DISTINCT COALESCE(a->>'mediaObjectId', '') AS media_object_id
            FROM chat_messages m
            CROSS JOIN LATERAL jsonb_array_elements(${ATTACHMENTS_ARRAY_SQL}) AS a
            WHERE COALESCE(a->>'mediaObjectId', '') <> ''
          )
          SELECT cm.media_object_id AS "mediaObjectId"
          FROM chat_media_ids cm
          LEFT JOIN media_objects mo
            ON mo.id = cm.media_object_id
          WHERE mo.id IS NULL
          ORDER BY cm.media_object_id ASC
          LIMIT 20
        `
      );

      // eslint-disable-next-line no-console
      console.log("[chat-media-audit] media-link-summary");
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            distinctMediaIdsInChat: nf.format(
              toSafeNumber(mediaLinkSummary.rows[0]?.distinctMediaIdsInChat)
            ),
            mediaIdsFoundInMediaObjects: nf.format(
              toSafeNumber(mediaLinkSummary.rows[0]?.mediaIdsFoundInMediaObjects)
            ),
            mediaIdsMissingInMediaObjects: nf.format(
              toSafeNumber(mediaLinkSummary.rows[0]?.mediaIdsMissingInMediaObjects)
            ),
            mediaObjectsHeapSize: mediaSizes.rows[0]?.mediaObjectsHeapSize,
            mediaObjectsTotalSize: mediaSizes.rows[0]?.mediaObjectsTotalSize,
          },
          null,
          2
        )
      );

      if (mediaStateSummary.rows.length > 0) {
        // eslint-disable-next-line no-console
        console.log("[chat-media-audit] media-state-distribution");
        // eslint-disable-next-line no-console
        console.table(
          mediaStateSummary.rows.map((row) => ({
            state: row.state,
            count: nf.format(toSafeNumber(row.count)),
          }))
        );
      }

      if (missingMediaIds.rows.length > 0) {
        // eslint-disable-next-line no-console
        console.log("[chat-media-audit] missing-media-object-ids-sample");
        // eslint-disable-next-line no-console
        console.table(missingMediaIds.rows);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[chat-media-audit] failed", error);
  process.exitCode = 1;
});

