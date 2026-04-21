import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MediaModule } from "../media/media.module";
import { NewsController } from "./news.controller";
import { NewsRepository } from "./news.repository";
import { NewsService } from "./news.service";

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [NewsController],
  providers: [NewsService, NewsRepository],
})
export class NewsModule {}
