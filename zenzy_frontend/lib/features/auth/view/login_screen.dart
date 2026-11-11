import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/design/design.dart';
import '../../../core/error/app_exception.dart';
import '../../../core/router/route_names.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../../../core/widgets/toast.dart';
import '../repository/auth_repository.dart';

/// Thẻ trắng dùng cho ô nhập / nút trên các màn đăng nhập.
class AuthCard extends StatelessWidget {
  const AuthCard({super.key, required this.children, this.center = false, this.blur = 6, this.gap = 0, this.onTap});
  final List<Widget> children;
  final bool center;
  final double blur;
  final double gap;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Bx(
        w: double.infinity,
        h: 52,
        r: 16,
        bg: Z.white,
        border: Z.lavender,
        shadow: zShadow(const Color(0x0A1A1B2F), blur, 4),
        pad: EdgeInsets.symmetric(horizontal: center ? 24 : 16),
        onTap: onTap,
        child: Rw(children, gap: gap, fill: true, main: center ? MainAxisAlignment.center : MainAxisAlignment.start),
      );
}

class OrDivider extends StatelessWidget {
  const OrDivider({super.key, this.vertical = 16});
  final double vertical;
  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.symmetric(vertical: vertical),
        child: const Rw([
          Expanded(child: HLine(Z.lavender)),
          T('or', 14, Z.purple, w: medium),
          Expanded(child: HLine(Z.lavender)),
        ], gap: 12, fill: true),
      );
}

class TermsText extends StatelessWidget {
  const TermsText({super.key, this.linkColor = Z.rose});
  final Color linkColor;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: T.rich([
          span('By continuing, you agree to Zenzy’s '),
          span('Terms of Service', color: linkColor, w: semiBold, underline: true),
          span(' and '),
          span('Privacy Policy', color: linkColor, w: semiBold, underline: true),
        ], 12, Z.purple, lh: 1.4, align: TextAlign.center),
      );
}

/// Chạy lời gọi đăng nhập/đăng ký rồi vào Home Map.
/// Không tới được máy chủ thì vẫn vào app ở chế độ khách (dữ liệu mẫu) và báo cho người dùng.
Future<void> submitAuth(BuildContext context, Future<void> Function()? call) async {
  if (call != null) {
    try {
      await call();
    } on AppException catch (e) {
      if (!context.mounted) return;
      if (!e.isNetwork) {
        showToast(context, e.message);
        return;
      }
      showToast(context, 'Không kết nối được máy chủ – đang dùng dữ liệu mẫu');
    }
  }
  if (context.mounted) context.go(Routes.home);
}

/// 02 · Login
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _hidden = true;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_busy) return;
    final email = _email.text.trim();
    final password = _password.text;
    setState(() => _busy = true);
    final repo = context.read<AuthRepository>();
    // Bỏ trống cả hai ô = vào xem thử với tư cách khách.
    await submitAuth(context, email.isEmpty && password.isEmpty ? null : () => repo.login(email: email, password: password));
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final field = zStyle(15, Z.navy);
    return Screen(
      bg: Z.canvas,
      child: ImePadding(
        child: LayoutBuilder(
          builder: (context, c) => SingleChildScrollView(
            physics: const ClampingScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: c.maxHeight),
              child: Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Col([
                  Col([
                    const StatusBarSpace(),
                    Padding(
                      padding: const EdgeInsets.only(top: 40, bottom: 20),
                      child: Col([
                        Bx(
                          w: 56,
                          h: 56,
                          r: 18,
                          bg: Z.coral,
                          shadow: zShadow(const Color(0x142F3C7E), 10, 10),
                          align: Alignment.center,
                          child: const Svg('s02/map_pin'),
                        ),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 40),
                          child: Col([
                            T('Welcome to Zenzy', 32, Z.navy, w: extraBold, maxLines: 1),
                            T('Connect with your local world in real time.', 15, Z.purple, align: TextAlign.center),
                          ], gap: 8, cross: CrossAxisAlignment.center, fill: true),
                        ),
                      ], gap: 16, cross: CrossAxisAlignment.center, fill: true),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Col([
                        AuthCard(
                          center: true,
                          gap: 12,
                          onTap: () => submitAuth(context, null),
                          children: const [Svg('s02/github'), T('Continue with Google', 16, Z.navy, w: semiBold)],
                        ),
                        const OrDivider(),
                        Col([
                          AuthCard(children: [
                            const Svg('s02/mail'),
                            Expanded(
                              child: ZField(
                                controller: _email,
                                placeholder: 'Email or phone number',
                                style: field,
                                placeholderColor: Z.purple,
                                keyboard: TextInputType.emailAddress,
                              ),
                            ),
                          ]),
                          AuthCard(children: [
                            const Svg('s02/lock'),
                            Expanded(
                              child: ZField(
                                controller: _password,
                                placeholder: 'Password',
                                style: field,
                                placeholderColor: Z.purple,
                                obscure: _hidden,
                              ),
                            ),
                            Bx(onTap: () => setState(() => _hidden = !_hidden), child: const Svg('s02/eye')),
                          ]),
                        ], gap: 12, fill: true),
                      ], gap: 12, fill: true),
                    ),
                  ], fill: true),
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Col([
                      Bx(
                        w: double.infinity,
                        h: 52,
                        r: 16,
                        bg: Z.coral,
                        shadow: zShadow(alpha(Z.coral, 0.2), 12, 10),
                        align: Alignment.center,
                        opacity: _busy ? 0.7 : 1,
                        onTap: _login,
                        child: const T('Log In', 16, Z.white, w: semiBold),
                      ),
                      const TermsText(),
                      const NavBarSpace(top: 10),
                    ], gap: 24, cross: CrossAxisAlignment.center, fill: true),
                  ),
                ], fill: true, main: MainAxisAlignment.spaceBetween),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
