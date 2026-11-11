import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../../../../core/design/design.dart';

const pinShadow = Color(0x262F3C7E);

/// Mũi nhọn dưới pin (SVG gốc hướng lên, xoay 180° như trong Figma).
class PinPointer extends StatelessWidget {
  const PinPointer(this.svg, {super.key, this.w = 8, this.h = 6, this.inset = 0.54});
  final String svg;
  final double w, h, inset;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: w,
        height: h,
        child: Transform.rotate(
          angle: math.pi,
          child: Align(alignment: Alignment.topLeft, child: Padding(padding: EdgeInsets.only(left: inset), child: Svg(svg))),
        ),
      );
}

/// Pin bạn bè trên Home Map: avatar trong vòng coral, có chấm chưa đọc và mũi nhọn.
class FriendMarker extends StatelessWidget {
  const FriendMarker(this.avatar, {super.key});
  final String avatar;

  @override
  Widget build(BuildContext context) => Stack(clipBehavior: Clip.none, children: [
        Col([
          Bx(
            w: 48,
            h: 48,
            circle: true,
            bg: Z.white,
            border: Z.coral,
            bw: 3,
            shadow: zShadow(pinShadow, 4, 4),
            align: Alignment.center,
            child: Img(avatar, w: 40, h: 40, circle: true),
          ),
          const PinPointer('s03/pointer', w: 10, h: 6, inset: 0.67),
        ], cross: CrossAxisAlignment.center),
        const Positioned(right: 2, top: 2, child: Svg('s03/unread_pip')),
      ]);
}
