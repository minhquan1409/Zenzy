import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService, GoogleVerifier } from './auth.service';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';

/** COMP-01: register, login (password and Google), tokens, password reset, admin login. */
@Module({
  controllers: [AuthController, SecurityController],
  providers: [GoogleVerifier, AuthService, SecurityService],
  exports: [AuthService],
})
export class AuthModule {}
