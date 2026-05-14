import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { MediaModule } from "../media/media.module";
import { RedisModule } from "../redis/redis.module";
import { ChatController } from "./chat.controller";
import { ChatRepository } from "./chat.repository";
import { ChatRealtimeService } from "./chat.realtime";
import { ChatService } from "./chat.service";

@Module({
  imports: [AuthModule, CapabilitiesModule, MediaModule, RedisModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatRealtimeService],
})
export class ChatModule {}
