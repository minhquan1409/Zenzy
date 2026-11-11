import 'package:flutter/widgets.dart';

import '../../../../core/design/design.dart';
import '../../model/map_marker.dart';
import 'friend_marker.dart';

/// Pin sự kiện / địa điểm trên Home Map: icon trong bong bóng màu, có mũi nhọn.
class EventMarker extends StatelessWidget {
  const EventMarker(this.marker, {super.key, this.onTap});
  final MapMarker marker;
  final VoidCallback? onTap;

  static const _icons = {
    'soccer': 's03/circle_x',
    'coffee': 's03/coffee',
    'bag': 's03/shopping_bag',
    'fire': 'flow/pin_fire',
    'basketball': 'flow/basketball',
  };

  @override
  Widget build(BuildContext context) {
    final coral = marker.color == 'coral';
    return Bx(
      onTap: onTap,
      child: Col([
        Bx(
          w: 42,
          h: 42,
          circle: true,
          bg: coral ? Z.coral : Z.navy,
          border: Z.white,
          bw: 2,
          shadow: zShadow(pinShadow, 4, 4),
          align: Alignment.center,
          child: Svg(_icons[marker.icon] ?? 's03/shopping_bag'),
        ),
        PinPointer(coral ? 's03/pointer1' : 's03/pointer2'),
      ], cross: CrossAxisAlignment.center),
    );
  }
}
