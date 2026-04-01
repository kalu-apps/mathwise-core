import { Injectable, type NestMiddleware } from "@nestjs/common";
import { StageAccessService } from "./stage-access.service";

const STAGE_ACCESS_PUBLIC_PREFIX = "/api/stage-access/";

type MiddlewareRequest = {
  method: string;
  path?: string;
  originalUrl?: string;
  headers: {
    cookie?: string;
  };
};

type MiddlewareResponse = {
  status: (code: number) => {
    json: (payload: Record<string, unknown>) => void;
  };
};

type MiddlewareNext = () => void;

@Injectable()
export class StageAccessGateMiddleware implements NestMiddleware {
  constructor(private readonly stageAccessService: StageAccessService) {}

  use(req: MiddlewareRequest, res: MiddlewareResponse, next: MiddlewareNext) {
    if (!this.stageAccessService.isEnabled()) {
      next();
      return;
    }

    const path = req.path || req.originalUrl || "";
    if (req.method === "OPTIONS") {
      next();
      return;
    }
    if (!path.startsWith("/api/")) {
      next();
      return;
    }
    if (path.startsWith(STAGE_ACCESS_PUBLIC_PREFIX)) {
      next();
      return;
    }

    const status = this.stageAccessService.getStatus(req.headers.cookie);
    if (status.granted) {
      next();
      return;
    }

    res.status(401).json({
      error: "Stage access required.",
      code: "stage_access_required",
      marker: "STAGE_ONLY_REMOVE_BEFORE_PROD",
    });
  }
}
