import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, oid, parse, Roles, zId } from '../common/http';
import { IdempotencyService } from '../core/support.services';
import { UserDoc } from '../core/types';
import { ModerationService } from './moderation.service';

const zReason = z.string().trim().min(1).max(500);

@Controller()
export class ReportsController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** 201 for a new report, 200 when the caller had already reported the item (no duplicate is created). */
  @Post('reports')
  async report(
    @CurrentUser() user: UserDoc,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') key?: string,
  ) {
    const dto = parse(
      z.object({
        target_type: z.enum(['POST', 'EVENT', 'SHOP', 'USER']),
        target_id: zId,
        reason: z.enum(['SPAM', 'SCAM', 'HARASSMENT', 'ILLEGAL', 'SENSITIVE', 'OTHER']),
        note: z.string().trim().max(500).default(''),
      }),
      body,
    );
    const result = await this.idempotency.run(user._id, 'POST /reports', key, () => this.moderation.report(user, dto));
    res.status(result.created ? 201 : 200);
    return result;
  }
}

/** Every route here needs the ADMIN role; anyone else gets 403 (spec 5.3.1). */
@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('reports')
  reports(@Query() query: unknown) {
    const dto = parse(z.object({ status: z.enum(['OPEN', 'RESOLVED']).default('OPEN'), cursor: z.string().optional() }), query);
    return this.moderation.queue(dto.status, dto.cursor);
  }

  @Patch('reports/:report_id')
  resolve(@CurrentUser() admin: UserDoc, @Param('report_id') reportId: string, @Body() body: unknown) {
    const dto = parse(z.object({ action: z.enum(['DISMISS', 'REMOVE', 'REMOVE_WARN', 'REMOVE_SUSPEND']), reason: zReason }), body);
    return this.moderation.resolve(admin, oid(reportId), dto.action, dto.reason);
  }

  @Get('shops')
  shops(@Query() query: unknown) {
    const dto = parse(z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING') }), query);
    return this.moderation.shops(dto.status);
  }

  @Patch('shops/:shop_id')
  reviewShop(@CurrentUser() admin: UserDoc, @Param('shop_id') shopId: string, @Body() body: unknown) {
    const dto = parse(z.object({ decision: z.enum(['APPROVE', 'REJECT']), reason: zReason.optional() }), body);
    return this.moderation.reviewShop(admin, oid(shopId), dto.decision, dto.reason ?? null);
  }

  @Get('users')
  users(@Query() query: unknown) {
    const dto = parse(z.object({ q: z.string().trim().max(30).default('') }), query);
    return this.moderation.users(dto.q);
  }

  @Patch('users/:user_id/status')
  setStatus(@CurrentUser() admin: UserDoc, @Param('user_id') userId: string, @Body() body: unknown) {
    const dto = parse(z.object({ status: z.enum(['SUSPENDED', 'ACTIVE']), reason: zReason }), body);
    return this.moderation.setUserStatus(admin, oid(userId), dto.status, dto.reason);
  }
}
