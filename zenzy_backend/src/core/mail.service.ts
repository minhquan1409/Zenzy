import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfig } from './config';

/**
 * Outgoing e-mail over SMTP (password-reset codes). Works with any SMTP provider: Gmail with an
 * app password, Amazon SES SMTP, Brevo, Mailgun... When SMTP is not configured, `configured` is false
 * and callers decide what to do (development logs the code instead of sending it).
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transport: Transporter | null;

  constructor(private readonly config: AppConfig) {
    const { smtpHost, smtpPort, smtpUser, smtpPass } = config;
    this.transport = smtpHost
      ? createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
        })
      : null;
  }

  get configured(): boolean {
    return this.transport !== null;
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    if (!this.transport) throw new Error('SMTP is not configured');
    await this.transport.sendMail({ from: this.config.mailFrom, to, subject, text, html });
    this.log.log(`Sent "${subject}" to ${to.replace(/^(.).*(@.*)$/, '$1***$2')}`);
  }

  /** The 6-digit password-reset code (UC: forgot password). */
  async sendPasswordResetCode(to: string, code: string, minutes: number): Promise<void> {
    const subject = `${code} là mã đặt lại mật khẩu Zenzy của bạn`;
    const text =
      `Mã đặt lại mật khẩu Zenzy của bạn là: ${code}\n\n` +
      `Mã có hiệu lực trong ${minutes} phút. Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.\n\n` +
      `Your Zenzy password reset code is ${code}. It expires in ${minutes} minutes.`;
    const html =
      `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1E1B4B">` +
      `<h2 style="margin:0 0 12px;color:#FF6B6B">Zenzy</h2>` +
      `<p>Mã đặt lại mật khẩu của bạn là:</p>` +
      `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p>` +
      `<p style="color:#6B7280">Mã có hiệu lực trong ${minutes} phút. Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.</p>` +
      `</div>`;
    await this.send(to, subject, text, html);
  }

  /** The 6-digit code that confirms the e-mail of a new account. */
  async sendSignupCode(to: string, code: string, minutes: number): Promise<void> {
    const subject = `${code} là mã xác minh tài khoản Zenzy của bạn`;
    const text =
      `Mã xác minh email Zenzy của bạn là: ${code}\n\n` +
      `Nhập mã này trong ứng dụng để hoàn tất tạo tài khoản. Mã có hiệu lực trong ${minutes} phút. ` +
      `Nếu bạn không đăng ký Zenzy, hãy bỏ qua email này.\n\n` +
      `Your Zenzy verification code is ${code}. It expires in ${minutes} minutes.`;
    const html =
      `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1E1B4B">` +
      `<h2 style="margin:0 0 12px;color:#FF6B6B">Zenzy</h2>` +
      `<p>Mã xác minh email của bạn là:</p>` +
      `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p>` +
      `<p style="color:#6B7280">Nhập mã này trong ứng dụng để hoàn tất tạo tài khoản. Mã có hiệu lực trong ${minutes} phút. ` +
      `Nếu bạn không đăng ký Zenzy, hãy bỏ qua email này.</p>` +
      `</div>`;
    await this.send(to, subject, text, html);
  }

  /** Security alert to the administrator (plain text; every value is shown as data). */
  async sendAdminAlert(to: string, subject: string, lines: string[]): Promise<void> {
    const text = lines.join('\n');
    const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    const html =
      `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1E1B4B">` +
      `<h2 style="margin:0 0 12px;color:#FF6B6B">Zenzy security alert</h2>` +
      lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join('') +
      `</div>`;
    await this.send(to, `[Zenzy] ${subject}`, text, html);
  }
}
