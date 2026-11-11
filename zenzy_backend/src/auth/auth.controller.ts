import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /v1/auth/register { full_name, email, password, date_of_birth? } */
  @Post('register')
  register(@Body() body: any) {
    return this.auth.register(body);
  }

  /** POST /v1/auth/login { email, password } */
  @Post('login')
  @HttpCode(200)
  login(@Body() body: any) {
    return this.auth.login(body);
  }
}
