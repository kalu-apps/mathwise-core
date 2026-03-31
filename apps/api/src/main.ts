import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getApiRuntimeConfig } from "./config/runtime.config";

async function bootstrap() {
  const runtimeConfig = getApiRuntimeConfig();
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.enableCors({
    origin: runtimeConfig.corsOrigin,
    credentials: runtimeConfig.corsOrigin !== "*",
  });

  await app.listen(runtimeConfig.port, runtimeConfig.host);
}

void bootstrap();
