import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { SessionStore } from "./session.store";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, SessionStore],
  exports: [AuthService, AuthRepository, SessionStore],
})
export class AuthModule {}
