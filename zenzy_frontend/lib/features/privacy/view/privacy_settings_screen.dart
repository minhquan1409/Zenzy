import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../../events/view/event_detail_screen.dart' show toneColors;
import '../model/privacy_settings.dart';
import '../repository/privacy_repository.dart';

const _shadowColor = Color(0x1233275C);

/// 07 · Location Privacy
class PrivacySettingsScreen extends StatelessWidget {
  const PrivacySettingsScreen({super.key});

  /// Lưu lên máy chủ; khách hoặc mất mạng thì chỉ đổi trên máy.
  Future<void> _save(BuildContext context, LoadViewModel<PrivacySettings> vm, PrivacySettings next) async {
    vm.update(next);
    try {
      await context.read<PrivacyRepository>().save(next);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: Z.canvas,
      child: Loader<PrivacySettings>(
        load: context.read<PrivacyRepository>().fetch,
        initial: SampleData.instance.privacy,
        builder: (context, vm) {
          final s = vm.data;
          final ghost = s.ghostMode;
          // Khi Ghost Mode bật, các mục bên dưới bị làm mờ như trong thiết kế.
          final dim = ghost ? 0.72 : 1.0;
          final dimCard = ghost ? 0.55 : 1.0;
          const options = [
            ('public', 's07/globe_2', 'Public'),
            ('friends', 's07/users1', 'Friends Only'),
            ('private', 's07/lock_keyhole', 'Private'),
          ];
          final current = options.firstWhere((o) => o.$1 == s.audience, orElse: () => options[1]);
          return Col([
            const StatusBarSpace(),
            SizedBox(
              height: 56,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Rw([
                  Bx(onTap: () => goBack(context), child: const Svg('s07/arrow_left')),
                  const T('Location Privacy', 22, Z.navy, ls: -0.6),
                ], gap: 17, fill: true),
              ),
            ),
            Scroll(
              pad: const EdgeInsets.fromLTRB(24, 12, 24, 14),
              child: Col([
                // Lời cam kết
                const Bx(
                  w: double.infinity,
                  r: 16,
                  bg: Z.navy,
                  pad: EdgeInsets.all(16),
                  child: Rw([
                    Bx(w: 42, h: 46, r: 14, bg: Z.purple, align: Alignment.center, child: Svg('s07/shield_check')),
                    Expanded(
                      child: Col([
                        T('Your location. Your rules.', 15, Z.white, w: semiBold),
                        T('Choose who gets a little closer.', 11, Z.secondary, lh: 1.5),
                      ], gap: 5),
                    ),
                  ], gap: 14, fill: true),
                ),
                // Ghost mode
                Bx(
                  w: double.infinity,
                  r: 16,
                  bg: Z.white,
                  border: ghost ? Z.purple : Z.line2,
                  bw: ghost ? 1.5 : 1,
                  shadow: zShadow(_shadowColor, 16, 4),
                  pad: const EdgeInsets.all(16),
                  child: Rw([
                    const Expanded(
                      child: Col([
                        T('Ghost Mode', 15, Z.navy, w: semiBold),
                        T('(Hide location completely)', 11, Z.secondary),
                      ], gap: 5),
                    ),
                    Bx(
                      onTap: () => _save(context, vm, s.copyWith(ghostMode: !ghost)),
                      child: Svg(ghost ? 's07/toggle_on' : 's07/toggle_off'),
                    ),
                  ], gap: 12, fill: true),
                ),
                // Ai xem được vị trí
                Opacity(
                  opacity: dim,
                  child: Col([
                    const T('Who can see my location', 13, Z.navy, w: semiBold),
                    Bx(
                      w: double.infinity,
                      h: 44,
                      r: 16,
                      bg: Z.white,
                      border: Z.line2,
                      opacity: dimCard,
                      pad: const EdgeInsets.symmetric(horizontal: 14),
                      child: Rw([
                        const Svg('s07/users'),
                        Expanded(child: T(current.$3, 13, Z.secondary, w: semiBold)),
                        const Svg('s07/chevron_up'),
                      ], gap: 10, fill: true),
                    ),
                    Bx(
                      w: double.infinity,
                      r: 16,
                      bg: Z.white,
                      border: Z.line2,
                      shadow: zShadow(_shadowColor, 16, 4),
                      opacity: dimCard,
                      pad: const EdgeInsets.all(4),
                      child: Col([
                        for (final o in options)
                          Bx(
                            w: double.infinity,
                            h: 32,
                            r: 8,
                            bg: o.$1 == s.audience ? const Color(0xFFF5F2FD) : Z.white,
                            opacity: o.$1 == s.audience ? 0.55 : 1,
                            pad: const EdgeInsets.symmetric(horizontal: 10),
                            onTap: ghost ? null : () => _save(context, vm, s.copyWith(audience: o.$1)),
                            child: Rw([
                              Svg(o.$2),
                              Expanded(
                                child: T(o.$3, 12, o.$1 == s.audience ? Z.secondary : Z.navy,
                                    w: o.$1 == s.audience ? semiBold : normal),
                              ),
                              if (o.$1 == s.audience) const Svg('s07/check'),
                            ], gap: 10, fill: true),
                          ),
                      ], fill: true),
                    ),
                  ], gap: 8, fill: true),
                ),
                // Bạn thân bị loại trừ
                Opacity(
                  opacity: dim,
                  child: Col([
                    const Rw([
                      T('Excluded close friends', 13, Z.navy, w: semiBold),
                      T('Edit list', 12, Z.coral, w: semiBold),
                    ], fill: true, main: MainAxisAlignment.spaceBetween),
                    const T('These friends won’t see your location.', 11, Z.secondary),
                    Bx(
                      w: double.infinity,
                      r: 16,
                      bg: Z.white,
                      border: Z.line2,
                      shadow: zShadow(_shadowColor, 16, 4),
                      pad: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      child: Col([
                        for (final (i, f) in s.excluded.indexed) ...[
                          SizedBox(
                            height: 46,
                            child: Rw([
                              Bx(
                                w: 32,
                                h: 32,
                                circle: true,
                                bg: toneColors(f.tone).$1,
                                align: Alignment.center,
                                child: T(f.initials, 12, toneColors(f.tone).$2, w: semiBold),
                              ),
                              Expanded(
                                child: Col([T(f.name, 12, Z.navy, w: semiBold), T(f.sub, 10, Z.secondary)], gap: 2),
                              ),
                              const Svg('s07/eye_off'),
                            ], gap: 10, fill: true),
                          ),
                          if (i < s.excluded.length - 1) const HLine(Z.line2),
                        ],
                      ], fill: true),
                    ),
                  ], gap: 10, fill: true),
                ),
                // Vị trí chính xác
                Bx(
                  w: double.infinity,
                  r: 16,
                  bg: Z.white,
                  border: Z.line2,
                  opacity: dim,
                  pad: const EdgeInsets.all(14),
                  child: Rw([
                    const Expanded(
                      child: Col([
                        T('Precise location', 13, Z.navy, w: semiBold),
                        T('Share an exact spot when visible.', 10, Z.secondary),
                      ], gap: 4),
                    ),
                    Bx(
                      onTap: ghost ? null : () => _save(context, vm, s.copyWith(precise: !s.precise)),
                      child: Svg(s.precise ? 's07/toggle_on' : 's07/toggle_off'),
                    ),
                  ], gap: 12, fill: true),
                ),
                const Rw([
                  Svg('s07/lock_keyhole1'),
                  T('Ghost Mode overrides all sharing settings.', 10, Z.secondary),
                ], gap: 5, fill: true, main: MainAxisAlignment.center),
              ], gap: 16, fill: true),
            ),
            const NavBarSpace(),
          ], max: true, fill: true);
        },
      ),
    );
  }
}
