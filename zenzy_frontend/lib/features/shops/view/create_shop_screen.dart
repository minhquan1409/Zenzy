import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/error/app_exception.dart';
import '../../../core/router/route_names.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../../../core/widgets/toast.dart';
import '../model/menu_item_model.dart';
import '../repository/shop_repository.dart';
import 'my_shop_screen.dart' show ShopHeader;

class _Drink {
  _Drink(String name, String price)
      : name = TextEditingController(text: name),
        price = TextEditingController(text: price);
  final TextEditingController name;
  final TextEditingController price;
  void dispose() {
    name.dispose();
    price.dispose();
  }
}

/// Create shop
class CreateShopScreen extends StatefulWidget {
  const CreateShopScreen({super.key});
  @override
  State<CreateShopScreen> createState() => _CreateShopScreenState();
}

class _CreateShopScreenState extends State<CreateShopScreen> {
  late final _shop = SampleData.instance.shop;
  late final _name = TextEditingController(text: _shop.name);
  late final _address = TextEditingController(text: _shop.fullAddress);
  late final _opening = TextEditingController(text: _shop.opening);
  late final _closing = TextEditingController(text: _shop.closing);
  late final List<_Drink> _drinks = [for (final m in _shop.menu) _Drink(m.name, m.price)];
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _address, _opening, _closing]) {
      c.dispose();
    }
    for (final d in _drinks) {
      d.dispose();
    }
    super.dispose();
  }

  Future<void> _create() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await context.read<ShopRepository>().saveShop(
        name: _name.text.trim(),
        address: _address.text.trim(),
        opening: _opening.text.trim(),
        closing: _closing.text.trim(),
        menu: [for (final d in _drinks) MenuItemModel(name: d.name.text.trim(), price: d.price.text.trim())],
      );
    } on AppException catch (e) {
      // Khách / mất mạng: vẫn đi tiếp theo luồng thiết kế, cửa hàng hiển thị là dữ liệu mẫu.
      if (mounted && !e.isNetwork && e.statusCode != 401) {
        showToast(context, e.message);
        setState(() => _busy = false);
        return;
      }
    }
    if (!mounted) return;
    context.pushReplacement(Routes.myShop);
  }

  Widget _label(String text) => T(text, 13, Z.navy, w: semiBold);

  Widget _input(TextEditingController controller, {double minHeight = 48, String? icon, String? suffix, bool singleLine = true}) => Bx(
        w: double.infinity,
        minH: minHeight,
        r: 12,
        bg: Z.white,
        border: Z.border,
        pad: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Rw([
          if (icon != null) Svg(icon),
          Expanded(
            child: ZField(
              controller: controller,
              placeholder: '',
              style: zStyle(14, Z.navy, lh: 1.45),
              placeholderColor: Z.secondary,
              singleLine: singleLine,
            ),
          ),
          if (suffix != null) T(suffix, 12, Z.secondary),
        ], gap: 8, fill: true),
      );

  Widget _drink(_Drink d) => Bx(
        w: double.infinity,
        r: 16,
        bg: Z.white,
        border: Z.border,
        pad: const EdgeInsets.all(14),
        child: Col([
          Col([_label('Drink name'), _input(d.name)], gap: 8, fill: true),
          Rw([
            Expanded(child: Col([_label('Price'), _input(d.price, suffix: 'VND')], gap: 8)),
            Bx(
              w: 40,
              h: 48,
              align: Alignment.center,
              onTap: () => setState(() {
                _drinks.remove(d);
                d.dispose();
              }),
              child: const Svg('cshop/trash_2'),
            ),
          ], gap: 14, cross: CrossAxisAlignment.end, fill: true),
        ], gap: 12, fill: true),
      );

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: Z.canvas,
      child: ImePadding(
        child: Col([
          const StatusBarSpace(),
          Scroll(
            child: Col([
              const ShopHeader('Create shop'),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                child: Col([
                  const T('Give your shop a home on Zenzy. Share your drinks and keep your neighborhood in the loop.', 14, Z.secondary,
                      lh: 1.5),
                  Col([
                    _label('Cover photo'),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: SizedBox(
                        height: 150,
                        width: double.infinity,
                        child: Stack(children: [
                          Positioned.fill(child: Img(_shop.cover)),
                          const Positioned(
                            right: 12,
                            bottom: 12,
                            child: Bx(
                              circle: true,
                              bg: Z.white,
                              pad: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              child: Rw([Svg('cshop/camera'), T('Change cover', 12, Z.navy, w: semiBold)], gap: 6),
                            ),
                          ),
                        ]),
                      ),
                    ),
                    const T('JPG or PNG · Up to 10 MB', 11, Z.secondary),
                  ], gap: 8, fill: true),
                  Col([
                    const T('Shop details', 18, Z.navy, w: semiBold),
                    Col([_label('Shop name'), _input(_name)], gap: 8, fill: true),
                    Col([
                      _label('Address'),
                      _input(_address, minHeight: 66, icon: 'cshop/map_pin', singleLine: false),
                    ], gap: 8, fill: true),
                    Col([
                      Rw([
                        Expanded(child: Col([_label('Opening time'), _input(_opening, icon: 'cshop/clock')], gap: 8)),
                        Expanded(child: Col([_label('Closing time'), _input(_closing, icon: 'cshop/clock')], gap: 8)),
                      ], gap: 12, cross: CrossAxisAlignment.start, fill: true),
                      const T('These hours apply every day.', 12, Z.secondary),
                    ], gap: 8, fill: true),
                  ], gap: 16, fill: true),
                  Col([
                    Rw([
                      const T('Drink menu', 18, Z.navy, w: semiBold),
                      T('${_drinks.length} drinks', 12, Z.secondary),
                    ], fill: true, main: MainAxisAlignment.spaceBetween),
                    const T('Show what you serve. All prices are in VND.', 12, Z.secondary, lh: 1.5),
                    for (final d in _drinks) _drink(d),
                    Bx(
                      w: double.infinity,
                      h: 50,
                      r: 16,
                      bg: Z.white,
                      border: Z.border,
                      onTap: () => setState(() => _drinks.add(_Drink('', ''))),
                      child: const Rw([Svg('cshop/plus'), T('Add drink', 14, Z.purple, w: bold)],
                          gap: 8, fill: true, main: MainAxisAlignment.center),
                    ),
                  ], gap: 12, fill: true),
                ], gap: 24, fill: true),
              ),
            ], fill: true),
          ),
          ColoredBox(
            color: Z.white,
            child: Col([
              const HLine(Z.border),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                child: Col([
                  const T('Your shop and menu will be visible on Zenzy.', 12, Z.secondary, align: TextAlign.center),
                  Bx(
                    w: double.infinity,
                    h: 50,
                    r: 16,
                    bg: Z.coral,
                    align: Alignment.center,
                    opacity: _busy ? 0.7 : 1,
                    onTap: _create,
                    child: const T('Create shop', 14, Z.white, w: bold),
                  ),
                ], gap: 10, cross: CrossAxisAlignment.center, fill: true),
              ),
              const NavBarSpace(top: 10),
            ], fill: true),
          ),
        ], max: true, fill: true),
      ),
    );
  }
}
