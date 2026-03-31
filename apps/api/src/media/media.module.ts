import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { MediaController } from "./media.controller";
import { MediaRepository } from "./media.repository";
import { MediaService } from "./media.service";
import { MediaStorageService } from "./media.storage";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [MediaController],
  providers: [MediaRepository, MediaStorageService, MediaService],
  exports: [MediaService, MediaStorageService],
})
export class MediaModule {}
