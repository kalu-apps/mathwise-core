import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getApiRuntimeConfig } from "./config/runtime.config";

const asConfigured = (value: string) => (value ? "configured" : "missing");

const logStartupDiagnostics = (runtimeConfig: ReturnType<typeof getApiRuntimeConfig>) => {
  const payload = {
    event: "api_startup",
    service: "mathwise-api-pilot",
    appEnv: runtimeConfig.appEnv,
    releaseVersion: runtimeConfig.releaseVersion,
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    corsOrigin: runtimeConfig.corsOrigin,
    dependencies: {
      postgres: asConfigured(runtimeConfig.databaseUrl),
      redis: asConfigured(runtimeConfig.redisUrl),
      media: runtimeConfig.mediaStorageEnabled ? "enabled" : "disabled",
      s3: runtimeConfig.mediaStorageEnabled
        ? {
            endpointConfigured: asConfigured(runtimeConfig.s3Endpoint),
            bucketConfigured: asConfigured(runtimeConfig.s3Bucket),
          }
        : "disabled",
    },
    security: {
      authCookieSecure: runtimeConfig.authCookieSecure,
      authCookieHttpOnly: runtimeConfig.authCookieHttpOnly,
      authCookieSameSite: runtimeConfig.authCookieSameSite,
      authDebugTokens: runtimeConfig.authDebugTokens,
    },
    stageOnly: {
      stageSiteGateEnabled: runtimeConfig.stageSiteGateEnabled,
      stagePaymentConfirmEnabled: runtimeConfig.stagePaymentConfirmEnabled,
      marker: "STAGE_ONLY_REMOVE_BEFORE_PROD",
    },
    timestamp: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
};

async function bootstrap() {
  const runtimeConfig = getApiRuntimeConfig();
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.enableCors({
    origin: runtimeConfig.corsOrigin,
    credentials: runtimeConfig.corsOrigin !== "*",
  });

  logStartupDiagnostics(runtimeConfig);
  await app.listen(runtimeConfig.port, runtimeConfig.host);
}

void bootstrap();
