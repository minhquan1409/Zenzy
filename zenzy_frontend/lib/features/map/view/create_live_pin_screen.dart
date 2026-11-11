import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../model/map_data.dart';
import '../repository/map_repository.dart';

const pinTypes = ['Event', 'Sports', 'Study', 'Deal'];

/// Đăng pin lên máy chủ. Khách hoặc mất mạng thì trả về pin dựng tại chỗ để luồng UI vẫn chạy.
Future<LivePin> postLivePin(
  BuildContext context, {
  required int type,
  required String title,
  required String description,
  required bool everyone,
}) async {
  try {
    return await context
        .read<MapRepository>()
        .createPin(type: pinTypes[type].toLowerCase(), title: title, description: description, everyone: everyone);
  } catch (_) {
    return LivePin(
      title: title,
      placeTime: 'Riverside Courts · Today, 5:30 PM',
      audienceText: '${everyone ? 'Everyone nearby' : 'Close Friends'} · Live until 7:30 PM',
    );
  }
}

/// 14 · Create Live Pin
class CreateLivePinScreen extends StatefulWidget {
  const CreateLivePinScreen({super.key});
  @override
  State<CreateLivePinScreen> createState() => _CreateLivePinScreenState();
}

class _CreateLivePinScreenState extends State<CreateLivePinScreen> {
  static const _soft = Color(0xFFF7F8FC);
  int _type = 0;
  bool _everyone = true;
  bool _busy = false;
  final _title = TextEditingController(text: 'Need +2 for basketball');
  final _desc = TextEditingController(text: 'Casual pick-up game, friendly vibes. Bring a black/white shirt if possible!');

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _post() async {
    if (_busy) return;
    setState(() => _busy = true);
    final pin = await postLivePin(context,
        type: _type, title: _title.text.trim(), description: _desc.text.trim(), everyone: _everyone);
    if (mounted) context.go(Routes.livePin, extra: pin);
  }

  Widget _label(String text) => T(text, 13, Z.navy, w: bold);

  Widget _visibility(String label, bool selected, VoidCallback onTap) => Expanded(
        child: Bx(
          r: 12,
          bg: selected ? const Color(0xFFFFECEC) : null,
          border: selected ? Z.coral : Z.line,
          bw: selected ? 1.5 : 1,
          pad: const EdgeInsets.all(12),
          onTap: onTap,
          child: Rw([
            Svg(selected ? 's14/radio_on' : 's14/radio_off'),
            Flexible(child: T(label, 13, selected ? Z.navy : Z.purple, w: selected ? bold : medium, maxLines: 1)),
          ], gap: 8, fill: true),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final field = zStyle(14, Z.secondary);
    return Stack(children: [
      const Positioned.fill(child: Img('s14_map_bg')),
      // Lớp phủ tối: navy ~45% (ước lượng theo ảnh render của Figma).
      Positioned.fill(child: Bx(bg: alpha(Z.navy, 0.45), onTap: () => goBack(context))),
      const Positioned(left: 0, right: 0, top: 0, child: StatusBarSpace(darkIcons: false)),
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: ImePadding(
          child: Bx(
            w: double.infinity,
            br: const BorderRadius.vertical(top: Radius.circular(32)),
            bg: Z.white,
            shadow: zShadow(const Color(0x2412122B), 12, -8),
            pad: const EdgeInsets.fromLTRB(24, 16, 24, 24),
            onTap: () {},
            child: Col([
              const Center(child: Bx(w: 40, h: 4, r: 2, bg: Z.line)),
              Rw([
                const T('Create Live Pin', 20, Z.navy, w: extraBold),
                Bx(
                  w: 32,
                  h: 32,
                  circle: true,
                  bg: _soft,
                  align: Alignment.center,
                  onTap: () => goBack(context),
                  child: const Svg('s14/x_circle'),
                ),
              ], fill: true, main: MainAxisAlignment.spaceBetween),
              Bx(
                w: double.infinity,
                r: 16,
                bg: _soft,
                pad: const EdgeInsets.all(4),
                child: Rw([
                  for (final (i, label) in pinTypes.indexed)
                    Expanded(
                      child: Bx(
                        h: 36,
                        r: 8,
                        bg: i == _type ? Z.coral : Z.lavender,
                        align: Alignment.center,
                        onTap: () => setState(() => _type = i),
                        child: T(label, 12, i == _type ? Z.white : Z.navy, w: bold),
                      ),
                    ),
                ], gap: 4, fill: true),
              ),
              Col([
                Col([
                  _label('Pin Title'),
                  Bx(
                    w: double.infinity,
                    h: 44,
                    r: 16,
                    border: Z.line,
                    pad: const EdgeInsets.symmetric(horizontal: 16),
                    align: Alignment.centerLeft,
                    child: ZField(controller: _title, placeholder: 'Give your pin a title', style: field, placeholderColor: Z.secondary),
                  ),
                ], gap: 6, fill: true),
                Rw([
                  Expanded(
                    child: Col([
                      _label('Time'),
                      const Bx(
                        w: double.infinity,
                        h: 44,
                        r: 12,
                        border: Z.line,
                        pad: EdgeInsets.symmetric(horizontal: 16),
                        child: Rw([Svg('s14/clock'), Expanded(child: T('5:30 PM (Today)', 14, Z.navy, maxLines: 1))],
                            gap: 8, fill: true),
                      ),
                    ], gap: 6),
                  ),
                  Expanded(
                    child: Col([
                      _label('Location'),
                      const Bx(
                        w: double.infinity,
                        h: 44,
                        r: 12,
                        bg: _soft,
                        border: Z.line,
                        pad: EdgeInsets.symmetric(horizontal: 16),
                        child: Rw([
                          Svg('s14/map_pin'),
                          Expanded(child: T('Riverside Courts', 14, Z.navy, w: medium, maxLines: 1)),
                        ], gap: 8, fill: true),
                      ),
                    ], gap: 6),
                  ),
                ], gap: 12, cross: CrossAxisAlignment.start, fill: true),
                Col([
                  _label('Description'),
                  Bx(
                    w: double.infinity,
                    h: 80,
                    r: 16,
                    border: Z.line,
                    pad: const EdgeInsets.all(16),
                    child: ZField(
                      controller: _desc,
                      placeholder: 'What’s the plan? Add a few friendly details…',
                      style: field,
                      placeholderColor: Z.secondary,
                      singleLine: false,
                    ),
                  ),
                ], gap: 6, fill: true),
              ], gap: 14, fill: true),
              Col([
                _label('Who can see this?'),
                Rw([
                  _visibility('Everyone nearby', _everyone, () => setState(() => _everyone = true)),
                  _visibility('Close Friends', !_everyone, () => setState(() => _everyone = false)),
                ], gap: 12, fill: true),
              ], gap: 8, fill: true),
              Bx(
                margin: const EdgeInsets.only(top: 8),
                w: double.infinity,
                h: 52,
                r: 16,
                bg: Z.coral,
                shadow: zShadow(alpha(Z.coral, 0.19), 8, 6),
                opacity: _busy ? 0.7 : 1,
                onTap: _post,
                child: const Rw([Svg('s14/map_pin_plus'), T('Post to Map', 16, Z.white, w: bold)],
                    gap: 8, fill: true, main: MainAxisAlignment.center),
              ),
              const NavBarSpace(),
            ], gap: 20, fill: true),
          ),
        ),
      ),
    ]);
  }
}
