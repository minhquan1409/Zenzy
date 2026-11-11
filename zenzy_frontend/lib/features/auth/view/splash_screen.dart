import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/widgets/main_scaffold.dart';

/// 01 · Splash
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: Z.navy,
      child: ClipRect(
        child: Stack(children: [
          // Các quầng sáng mờ, xuất từ Figma (đã cắt theo frame).
          const Positioned(left: 0, top: 30, child: Img('s01_glow_coral_px', w: 340, h: 480, fit: BoxFit.fill)),
          const Positioned(right: 0, bottom: 40, child: Img('s01_glow_gold_px', w: 360, h: 570, fit: BoxFit.fill)),
          Align(
            alignment: Alignment.center,
            child: Transform.translate(
              offset: const Offset(0, -100),
              child: const Img('s01_glow_navy_px', w: 402, h: 410, fit: BoxFit.fill),
            ),
          ),
          Col([
            Col([
              const StatusBarSpace(darkIcons: false),
              gapH(120),
              Bx(
                w: 96,
                h: 96,
                r: 32,
                bg: Z.white,
                shadow: zShadow(const Color(0x142F3C7E), 10, 10),
                align: Alignment.center,
                child: const Bx(w: 76, h: 76, r: 24, bg: Z.coral, align: Alignment.center, child: Svg('s01/map_pin')),
              ),
              gapH(24),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 40),
                child: Col([
                  T('Zenzy', 48, Z.white, w: extraBold),
                  Opacity(
                    opacity: 0.9,
                    child: SizedBox(
                      width: double.infinity,
                      child: T("A living map for what's happening right now.", 18, Z.white,
                          w: medium, lh: 1.4, align: TextAlign.center),
                    ),
                  ),
                ], gap: 12, cross: CrossAxisAlignment.center, fill: true),
              ),
            ], cross: CrossAxisAlignment.center, fill: true),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Col([
                Bx(
                  w: double.infinity,
                  h: 52,
                  r: 16,
                  bg: Z.coral,
                  align: Alignment.center,
                  onTap: () => context.push(Routes.register),
                  child: const T('Get Started', 16, Z.white, w: semiBold),
                ),
                Bx(
                  opacity: 0.8,
                  onTap: () => context.push(Routes.login),
                  child: const T('I already have an account', 14, Z.white, w: semiBold, underline: true),
                ),
                const NavBarSpace(top: 10),
              ], gap: 20, cross: CrossAxisAlignment.center, fill: true),
            ),
          ], max: true, main: MainAxisAlignment.spaceBetween, fill: true),
        ]),
      ),
    );
  }
}
