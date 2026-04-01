import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ChatController } from "./chat.controller";
import { ChatRepository } from "./chat.repository";
import { ChatService } from "./chat.service";

@Module({
  imports: [AuthModule, CapabilitiesModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository],
})
export class ChatModule {}
