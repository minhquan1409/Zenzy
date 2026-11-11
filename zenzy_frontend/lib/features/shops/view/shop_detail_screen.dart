import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../model/menu_item_model.dart';
import '../model/shop_model.dart';
import '../repository/shop_repository.dart';

class RoundIconButton extends StatelessWidget {
  const RoundIconButton(this.icon, {super.key, this.onTap});
  final String icon;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) =>
      Bx(w: 34, h: 34, circle: true, bg: Z.white, align: Alignment.center, onTap: onTap, child: Svg(icon));
}

class BannerBadge extends StatelessWidget {
  const BannerBadge(this.icon, this.label, {super.key});
  final String icon;
  final String label;
  @override
  Widget build(BuildContext context) => Bx(
        circle: true,
        bg: Z.white,
        pad: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Rw([Svg(icon), T(label, 9, Z.purple, ls: 0.7)], gap: 5),
      );
}

class _MenuItem extends StatelessWidget {
  const _MenuItem(this.m);
  final MenuItemModel m;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 80,
        child: Rw([
          Bx(r: 16, border: Z.lavender, child: Img(m.photo ?? '', w: 64, h: 64, r: 16)),
          Expanded(
            child: Col([
              T(m.name, 13, Z.navy, w: semiBold),
              T(m.desc, 10, Z.secondary),
              Rw([
                T('${m.salePrice ?? m.price} ₫', 12, Z.navy),
                if (m.salePrice != null) T('${m.price} ₫', 10, Z.secondary, strike: true),
              ], gap: 8),
            ], gap: 5),
          ),
        ], gap: 12, fill: true),
      );
}

/// 08 · Shop & Flash Deals
class ShopDetailScreen extends StatelessWidget {
  const ShopDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    final cardShadow = zShadow(const Color(0x0A000000), 18, 6);
    return Screen(
      bg: Z.canvas,
      child: Loader<ShopModel>(
        load: () => context.read<ShopRepository>().fetchShop(id),
        initial: SampleData.instance.shop,
        builder: (context, vm) {
          final s = vm.data;
          return Col([
            const StatusBarSpace(),
            Scroll(
              child: Col([
                SizedBox(
                  height: 156,
                  width: double.infinity,
                  child: Stack(clipBehavior: Clip.hardEdge, children: [
                    Positioned.fill(child: Img(s.cover)),
                    Positioned(left: 24, top: 16, child: RoundIconButton('s08/arrow_left', onTap: () => goBack(context))),
                    const Positioned(left: 344, top: 16, child: RoundIconButton('s08/bookmark')),
                    Positioned(left: 24, top: 118, child: BannerBadge('s08/sparkles', s.badge)),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
                  child: Col([
                    Col([
                      T(s.name, 24, Z.navy, w: bold, ls: -0.8),
                      Rw([
                        const Svg('s08/map_pin'),
                        T(s.address, 11, Z.secondary),
                        T(s.distanceText, 11, Z.purple, w: semiBold),
                      ], gap: 5),
                      Rw([
                        const Svg('s08/star'),
                        T(s.ratingText, 11, Z.navy, w: semiBold),
                        const T('·', 11, Z.secondary),
                        T(s.openText, 11, Z.secondary),
                      ], gap: 9),
                    ], gap: 7),
                    Bx(
                      w: double.infinity,
                      r: 16,
                      bg: Z.white,
                      border: Z.lavender,
                      shadow: cardShadow,
                      pad: const EdgeInsets.all(13),
                      child: Rw([
                        const Bx(w: 32, h: 38, r: 11, bg: Z.lavender, align: Alignment.center, child: Svg('s08/zap')),
                        Expanded(
                          child: Col([
                            T(s.featuredTitle, 13, Z.navy, lh: 1.35),
                            T(s.featuredSubtitle, 10, Z.secondary),
                          ], gap: 5),
                        ),
                      ], gap: 10, fill: true),
                    ),
                    Col([
                      const Rw([T('Made for your mood', 18, Z.navy), T('Prices in VND', 10, Z.secondary)],
                          fill: true, main: MainAxisAlignment.spaceBetween),
                      Rw([
                        for (final (i, c) in s.categories.indexed)
                          Bx(
                            r: 100,
                            bg: i == 0 ? Z.coral : Z.white,
                            border: i == 0 ? Z.coral : Z.lavender,
                            pad: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                            child: T(c, 11, i == 0 ? Z.white : Z.secondary, w: medium),
                          ),
                      ], gap: 8),
                      Col([
                        for (final (i, m) in s.menu.indexed) ...[
                          if (i > 0) const HLine(Z.line2),
                          if (m.section != null) T(m.section!, 9, Z.secondary, ls: 1),
                          _MenuItem(m),
                        ],
                      ], gap: 2, fill: true),
                    ], gap: 10, fill: true),
                    Col([
                      const Rw([T('Latest news', 18, Z.navy), T('Updated today', 10, Z.secondary)],
                          fill: true, main: MainAxisAlignment.spaceBetween),
                      for (final n in s.news)
                        Bx(
                          w: double.infinity,
                          r: 16,
                          bg: Z.white,
                          border: Z.lavender,
                          shadow: cardShadow,
                          clip: true,
                          child: Col([
                            Img(n.image, w: double.infinity, h: 168),
                            Padding(
                              padding: const EdgeInsets.all(12),
                              child: Col([
                                Rw([T(n.author, 11, Z.purple, w: semiBold), T(n.timeText, 10, Z.secondary)],
                                    fill: true, main: MainAxisAlignment.spaceBetween),
                                T(n.title, 13, Z.navy, w: semiBold),
                                T(n.body, 11, Z.secondary, lh: 1.4),
                              ], gap: 8, fill: true),
                            ),
                          ], gap: 10, fill: true),
                        ),
                    ], gap: 10, fill: true),
                  ], gap: 14, fill: true),
                ),
                const NavBarSpace(),
              ], fill: true),
            ),
          ], max: true, fill: true);
        },
      ),
    );
  }
}
