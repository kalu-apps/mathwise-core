import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthController } from "./auth.controller";
import { AuthIdentityIntentRepository } from "./auth.identity-intent.repository";
import { AuthIdentityIntentService } from "./auth.identity-intent.service";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { SessionStore } from "./session.store";

@Module({
  imports: [NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    SessionStore,
    AuthIdentityIntentRepository,
    AuthIdentityIntentService,
  ],
  exports: [
    AuthService,
    AuthRepository,
    SessionStore,
    AuthIdentityIntentRepository,
    AuthIdentityIntentService,
  ],
})
export class AuthModule {}
