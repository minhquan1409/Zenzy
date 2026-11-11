import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../../../core/widgets/toast.dart';
import '../repository/auth_repository.dart';
import 'login_screen.dart';

/// Register
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _dob = TextEditingController();
  bool _hidden = true;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _email, _password, _dob]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _register() async {
    if (_busy) return;
    final name = _name.text.trim();
    final email = _email.text.trim();
    final password = _password.text;
    final empty = name.isEmpty && email.isEmpty && password.isEmpty;
    if (!empty && password.length < 8) {
      showToast(context, 'Use at least 8 characters.');
      return;
    }
    setState(() => _busy = true);
    final repo = context.read<AuthRepository>();
    // Bỏ trống toàn bộ = vào xem thử với tư cách khách.
    await submitAuth(
      context,
      empty ? null : () => repo.register(fullName: name, email: email, password: password, dateOfBirth: _dob.text.trim()),
    );
    if (mounted) setState(() => _busy = false);
  }

  Widget _input(String icon, String placeholder, TextEditingController controller,
      {Widget? trailing, bool obscure = false, TextInputType? keyboard}) {
    return AuthCard(blur: 12, gap: 10, children: [
      Svg(icon),
      Expanded(
        child: ZField(
          controller: controller,
          placeholder: placeholder,
          style: zStyle(15, Z.navy),
          placeholderColor: Z.purple,
          obscure: obscure,
          keyboard: keyboard,
        ),
      ),
      if (trailing != null) trailing,
    ]);
  }

  @override
  Widget build(BuildContext context) {
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
                          shadow: zShadow(const Color(0x142F3C7E), 20, 10),
                          align: Alignment.center,
                          child: const Svg('reg/map_pin'),
                        ),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 24),
                          child: Col([
                            T('Create your account', 32, Z.navy, w: extraBold, align: TextAlign.center),
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
                          blur: 12,
                          gap: 12,
                          onTap: () => submitAuth(context, null),
                          children: const [Svg('reg/social'), T('Continue with Google', 16, Z.navy, w: semiBold)],
                        ),
                        const OrDivider(vertical: 12),
                        Col([
                          _input('reg/user_round', 'Full name', _name),
                          _input('reg/mail', 'Email or phone number', _email, keyboard: TextInputType.emailAddress),
                          Col([
                            _input('reg/lock', 'Password', _password,
                                obscure: _hidden,
                                trailing: Bx(onTap: () => setState(() => _hidden = !_hidden), child: const Svg('reg/eye'))),
                            const T('Use at least 8 characters.', 12, Z.purple),
                          ], gap: 8, fill: true),
                          Col([
                            const T('Date of birth', 14, Z.navy, w: semiBold),
                            _input('reg/calendar_days', 'DD / MM / YYYY', _dob, keyboard: TextInputType.datetime),
                          ], gap: 8, fill: true),
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
                        shadow: zShadow(alpha(Z.coral, 0.2), 24, 10),
                        align: Alignment.center,
                        opacity: _busy ? 0.7 : 1,
                        onTap: _register,
                        child: const T('Register', 16, Z.white, w: semiBold),
                      ),
                      Bx(
                        w: double.infinity,
                        onTap: () => context.push(Routes.login),
                        child: T.rich([
                          span('Already have an account? '),
                          span('Log In', color: Z.coral, w: semiBold, underline: true),
                        ], 14, Z.purple, align: TextAlign.center),
                      ),
                      const TermsText(linkColor: Z.coral),
                      const NavBarSpace(top: 4),
                    ], gap: 12, cross: CrossAxisAlignment.center, fill: true),
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
