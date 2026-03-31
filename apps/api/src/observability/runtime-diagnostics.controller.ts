import { Controller, Get } from "@nestjs/common";
import { RuntimeDiagnosticsService } from "./runtime-diagnostics.service";

@Controller("runtime")
export class RuntimeDiagnosticsController {
  constructor(
    private readonly runtimeDiagnosticsService: RuntimeDiagnosticsService
  ) {}

  @Get("version")
  getVersion() {
    const snapshot = this.runtimeDiagnosticsService.snapshot();
    return {
      service: snapshot.service,
      appEnv: snapshot.appEnv,
      releaseVersion: snapshot.releaseVersion,
      uptimeSec: snapshot.uptimeSec,
      timestamp: snapshot.timestamp,
    };
  }

  @Get("diagnostics")
  getDiagnostics() {
    return this.runtimeDiagnosticsService.snapshot();
  }
}
