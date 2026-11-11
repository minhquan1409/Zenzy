import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../model/shop_model.dart';
import '../repository/shop_repository.dart';

/// Header chung của My shop / Create shop.
class ShopHeader extends StatelessWidget {
  const ShopHeader(this.title, {super.key, this.trailing, this.onTrailing});
  final String title;
  final String? trailing;
  final VoidCallback? onTrailing;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 64,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Rw([
            Bx(
              w: 34,
              h: 34,
              r: 100,
              bg: Z.white,
              border: Z.border,
              align: Alignment.center,
              onTap: () => goBack(context),
              child: const Svg('shop/arrow_left'),
            ),
            Expanded(child: T(title, 22, Z.navy, w: bold, ls: -0.5)),
            if (trailing != null) Bx(onTap: onTrailing, child: T(trailing!, 13, Z.purple, w: semiBold)),
          ], gap: 14, fill: true),
        ),
      );
}

/// My shop
class MyShopScreen extends StatelessWidget {
  const MyShopScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: Z.canvas,
      child: Loader<ShopModel>(
        load: context.read<ShopRepository>().fetchMyShop,
        initial: SampleData.instance.shop,
        builder: (context, vm) {
          final s = vm.data;
          return Col([
            const StatusBarSpace(),
            Scroll(
              child: Col([
                ShopHeader('My shop', trailing: 'Edit shop', onTrailing: () => context.push(Routes.createShop)),
                SizedBox(
                  height: 180,
                  width: double.infinity,
                  child: Stack(children: [
                    Positioned.fill(child: Img(s.cover)),
                    const Positioned(
                      left: 24,
                      bottom: 14,
                      child: Bx(
                        circle: true,
                        bg: Z.white,
                        pad: EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                        child: Rw([Svg('shop/store'), T('YOUR SHOP', 10, Z.purple, w: semiBold)], gap: 5),
                      ),
                    ),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
                  child: Col([
                    Col([
                      T(s.name, 24, Z.navy, w: bold, ls: -0.8),
                      Rw([
                        const Svg('shop/map_pin'),
                        Expanded(child: T(s.fullAddress, 12, Z.secondary, lh: 1.5)),
                      ], gap: 8, cross: CrossAxisAlignment.start, fill: true),
                      Rw([const Svg('shop/clock'), T(s.hoursText, 12, Z.secondary)], gap: 8),
                      const Bx(
                        w: double.infinity,
                        h: 50,
                        r: 16,
                        bg: Z.coral,
                        child: Rw([Svg('shop/plus'), SizedBox(width: 83, child: T('POST', 14, Z.white, w: bold))],
                            gap: 8, fill: true, main: MainAxisAlignment.center),
                      ),
                    ], gap: 12, fill: true),
                    Col([
                      const Rw([T('Made for your mood', 18, Z.navy), T('Prices in VND', 11, Z.secondary)],
                          fill: true, main: MainAxisAlignment.spaceBetween),
                      for (final m in s.menu)
                        Col([
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            child: Rw([
                              Img(m.photo ?? '', w: 64, h: 72, r: 16),
                              Expanded(
                                child: Col([
                                  T(m.name, 13, Z.navy, w: semiBold),
                                  T(m.desc, 11, Z.secondary, lh: 1.4),
                                  T('${m.price} ₫', 13, Z.navy, w: medium),
                                ], gap: 5),
                              ),
                            ], gap: 12, fill: true),
                          ),
                          const HLine(Z.border),
                        ], fill: true),
                    ], gap: 4, fill: true),
                    Col([
                      const Rw([T('Latest updates', 18, Z.navy), T('0 posts', 11, Z.secondary)],
                          fill: true, main: MainAxisAlignment.spaceBetween),
                      const Bx(
                        w: double.infinity,
                        r: 16,
                        bg: Z.white,
                        border: Z.lavender,
                        pad: EdgeInsets.all(24),
                        child: Col([
                          Bx(w: 48, h: 48, r: 16, bg: Z.lavender, align: Alignment.center, child: Svg('shop/images')),
                          T('Your first update starts here', 15, Z.navy, w: semiBold, align: TextAlign.center),
                          T('Share photos of your space, a new drink, or a little behind the scenes. Your updates will appear here.',
                              12, Z.secondary, lh: 1.5, align: TextAlign.center),
                        ], gap: 12, cross: CrossAxisAlignment.center, fill: true),
                      ),
                    ], gap: 12, fill: true),
                  ], gap: 24, fill: true),
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
