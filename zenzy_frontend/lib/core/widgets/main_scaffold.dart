import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../design/design.dart';
import '../router/route_names.dart';

enum ZTab { map, feed, chat, profile }

void goTab(BuildContext context, ZTab tab) => context.go(switch (tab) {
      ZTab.map => Routes.home,
      ZTab.feed => Routes.feed,
      ZTab.chat => Routes.messages,
      ZTab.profile => Routes.profile,
    });

void openCreatePin(BuildContext context) => context.push(Routes.createPin);

/// Quay lại màn trước; nếu không còn màn nào thì về Home Map.
void goBack(BuildContext context) => context.canPop() ? context.pop() : context.go(Routes.home);

/// Thanh điều hướng chính: Map · Feed · + · Chat · Profile. [selected] null = không tab nào sáng.
class ZenzyBottomNav extends StatelessWidget {
  const ZenzyBottomNav(this.selected, {super.key});
  final ZTab? selected;

  @override
  Widget build(BuildContext context) {
    Widget item(String icon, String label, ZTab tab) {
      final color = selected == tab ? Z.coral : Z.secondary;
      return Bx(
        w: 56,
        onTap: () => goTab(context, tab),
        child: Col([Svg(icon, tint: color), T(label, 10, color, w: semiBold)], gap: 4, cross: CrossAxisAlignment.center),
      );
    }

    return ColoredBox(
      color: Z.white,
      child: Col([
        const HLine(Z.lavender),
        SizedBox(
          height: 63,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Rw([
              item('s03/house', 'Map', ZTab.map),
              item('s03/newspaper', 'Feed', ZTab.feed),
              Bx(
                w: 48,
                h: 48,
                circle: true,
                bg: Z.coral,
                shadow: zShadow(alpha(Z.coral, 0.25), 6, 4),
                align: Alignment.center,
                onTap: () => openCreatePin(context),
                child: const Svg('s03/plus'),
              ),
              item('s03/message_circle', 'Chat', ZTab.chat),
              item('s03/user', 'Profile', ZTab.profile),
            ], fill: true, main: MainAxisAlignment.spaceBetween),
          ),
        ),
        const NavBarSpace(),
      ], fill: true),
    );
  }
}

/// Khung màn hình: nền + nội dung chiếm hết chiều cao.
class Screen extends StatelessWidget {
  const Screen({super.key, required this.bg, required this.child, this.font});
  final Color bg;
  final Widget child;
  final String? font;

  @override
  Widget build(BuildContext context) {
    Widget c = ColoredBox(color: bg, child: SizedBox.expand(child: child));
    if (font != null) c = DefaultTextStyle.merge(style: TextStyle(fontFamily: font), child: c);
    return c;
  }
}

/// Vùng cuộn dọc chiếm phần còn lại của cột.
class Scroll extends StatelessWidget {
  const Scroll({super.key, required this.child, this.pad});
  final Widget child;
  final EdgeInsetsGeometry? pad;
  @override
  Widget build(BuildContext context) => Expanded(
        child: SingleChildScrollView(
          padding: pad,
          physics: const ClampingScrollPhysics(),
          child: SizedBox(width: double.infinity, child: child),
        ),
      );
}
