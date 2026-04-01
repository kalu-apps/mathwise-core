import crypto from "node:crypto";
import { HttpException, Injectable } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { CapabilitiesService } from "../capabilities/capabilities.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { ensureId } from "../purchases/purchases.helpers";
import { RedisService } from "../redis/redis.service";
import type { WorkbookLaunchResponseDto } from "./workbook.types";

type LaunchArtifactPayload = {
  artifactId: string;
  userId: string;
  role: "student" | "teacher";
  issuedAt: string;
  expiresAt: string;
  from?: string;
};

const nowMs = () => Date.now();
const nowIso = () => new Date().toISOString();

const toBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

@Injectable()
export class WorkbookService {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly redisService: RedisService,
    private readonly capabilitiesService: CapabilitiesService
  ) {}

  async createLaunch(
    actorUser: AuthUserDto,
    payload?: { from?: string }
  ): Promise<WorkbookLaunchResponseDto> {
    this.assertWorkbookRuntimeEnabled();
    await this.assertWorkbookAccess(actorUser);

    const issuedAt = nowIso();
    const expiresAt = new Date(
      nowMs() + this.runtimeConfig.workbookLaunchTtlSec * 1000
    ).toISOString();
    const artifactId = ensureId("workbook_launch");
    const artifactKey = this.getArtifactKey(artifactId);
    const artifactPayload: LaunchArtifactPayload = {
      artifactId,
      userId: actorUser.id,
      role: actorUser.role,
      issuedAt,
      expiresAt,
      from: this.normalizeFrom(payload?.from),
    };

    await this.redisService.set(
      artifactKey,
      JSON.stringify(artifactPayload),
      this.runtimeConfig.workbookLaunchTtlSec
    );

    return {
      artifactId,
      launchUrl: `/api/workbook/launch/${encodeURIComponent(artifactId)}`,
      expiresAt,
    };
  }

  async consumeLaunch(
    actorUser: AuthUserDto,
    artifactIdRaw: string
  ): Promise<string> {
    this.assertWorkbookRuntimeEnabled();
    const artifactId = artifactIdRaw.trim();
    if (!artifactId) {
      throw new HttpException(
        { error: "artifactId обязателен.", code: "validation_failed" },
        400
      );
    }

    const artifactKey = this.getArtifactKey(artifactId);
    const stored = await this.redisService.get(artifactKey);
    if (!stored) {
      throw new HttpException(
        {
          error: "Ссылка запуска истекла. Запросите новую.",
          code: "workbook_launch_expired",
        },
        410
      );
    }

    let artifact: LaunchArtifactPayload;
    try {
      artifact = JSON.parse(stored) as LaunchArtifactPayload;
    } catch {
      throw new HttpException(
        {
          error: "Некорректный launch-артефакт.",
          code: "workbook_launch_invalid",
        },
        409
      );
    }

    if (artifact.userId !== actorUser.id) {
      throw new HttpException(
        {
          error: "Недостаточно прав для запуска рабочей тетради.",
          code: "workbook_access_denied",
        },
        403
      );
    }

    const secondsUntilExpire = Math.max(
      1,
      Math.floor((Date.parse(artifact.expiresAt) - nowMs()) / 1000)
    );
    const replayKey = this.getReplayKey(artifactId);
    const acquiredReplayKey = await this.redisService.setIfAbsent(
      replayKey,
      actorUser.id,
      secondsUntilExpire
    );
    if (!acquiredReplayKey) {
      throw new HttpException(
        {
          error: "Launch-артефакт уже использован.",
          code: "workbook_launch_replayed",
        },
        409
      );
    }

    await this.redisService.del(artifactKey);

    const launchToken = this.createLaunchToken({
      sub: actorUser.id,
      role: actorUser.role,
      artifactId: artifact.artifactId,
      issuedAt: artifact.issuedAt,
      expiresAt: artifact.expiresAt,
      from: artifact.from,
    });

    const target = new URL(
      "/workbook",
      this.runtimeConfig.workbookBoardBaseUrl
    );
    target.searchParams.set("mwLaunch", launchToken);
    if (artifact.from) {
      target.searchParams.set("from", artifact.from);
    }
    return target.toString();
  }

  private assertWorkbookRuntimeEnabled() {
    if (!this.runtimeConfig.workbookLaunchEnabled) {
      throw new HttpException(
        {
          error: "Запуск рабочей тетради отключен в текущем runtime.",
          code: "board_launch_unavailable",
        },
        503
      );
    }
    if (!this.runtimeConfig.workbookBoardBaseUrl) {
      throw new HttpException(
        {
          error:
            "Запуск рабочей тетради недоступен: не задан WORKBOOK_BOARD_BASE_URL.",
          code: "board_launch_unavailable",
        },
        503
      );
    }
  }

  private async assertWorkbookAccess(actorUser: AuthUserDto) {
    if (actorUser.role === "teacher") return;
    const capabilities =
      await this.capabilitiesService.getCapabilitiesForUser(actorUser);
    if (!capabilities.canAccessWorkbook) {
      throw new HttpException(
        {
          error:
            "Рабочая тетрадь доступна только при активной premium-возможности.",
          code: "workbook_access_denied",
        },
        403
      );
    }
  }

  private createLaunchToken(payload: {
    sub: string;
    role: string;
    artifactId: string;
    issuedAt: string;
    expiresAt: string;
    from?: string;
  }) {
    const body = toBase64Url(JSON.stringify(payload));
    const signature = crypto
      .createHmac("sha256", this.runtimeConfig.workbookLaunchSecret)
      .update(body)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    return `${body}.${signature}`;
  }

  private normalizeFrom(value: string | undefined) {
    const from = value?.trim();
    if (!from) return undefined;
    if (!from.startsWith("/")) return undefined;
    return from;
  }

  private getArtifactKey(artifactId: string) {
    return `workbook:launch:${artifactId}`;
  }

  private getReplayKey(artifactId: string) {
    return `workbook:launch:replay:${artifactId}`;
  }
}
