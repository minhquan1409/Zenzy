import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/widgets/main_scaffold.dart';

enum NearbyState { loading, ghost, error }

const _skeleton = Color(0xFFE6E8EF);
const _skeletonSoft = Color(0xFFEFF0F5);
const _soft = Color(0x0812122B);

/// Đặt [child] vào khung (x, y, w, h), canh giữa và xoay [deg] độ; con có thể tràn khung.
class _Rot extends StatelessWidget {
  const _Rot(this.x, this.y, this.w, this.h, this.deg, this.child);
  final double x, y, w, h, deg;
  final Widget child;
  @override
  Widget build(BuildContext context) => Positioned(
        left: x,
        top: y,
        width: w,
        height: h,
        child: OverflowBox(
          minWidth: 0,
          minHeight: 0,
          maxWidth: double.infinity,
          maxHeight: double.infinity,
          child: Transform.rotate(angle: deg * math.pi / 180, child: child),
        ),
      );
}

/// Thẻ bản đồ khu phố minh hoạ dùng chung cho 3 trạng thái Nearby (354 × 236).
class _NeighborhoodMap extends StatelessWidget {
  const _NeighborhoodMap({
    required this.bg,
    required this.border,
    required this.park,
    required this.street,
    required this.centerline,
    required this.radius,
    required this.halo,
    this.shadow = false,
    this.labels,
  });
  final Color bg, border, park, street, centerline;
  final String radius, halo;
  final bool shadow;

  /// Màu chữ "Riverside"; null = không vẽ nhãn.
  final Color? labels;

  @override
  Widget build(BuildContext context) => Bx(
        w: double.infinity,
        h: 236,
        r: 16,
        bg: bg,
        border: border,
        clip: true,
        shadow: shadow ? zShadow(_soft, 12, 4) : null,
        child: Stack(clipBehavior: Clip.hardEdge, children: [
          _Rot(239, -61.17, 158.247, 146.691, -18, Bx(w: 130, h: 112, r: 26, bg: park)),
          _Rot(-21, 141.65, 142.74, 114.456, -15, Bx(w: 125, h: 85, r: 22, bg: park)),
          for (final top in const [2.86, 90.86, 156.86]) _Rot(-21, top, 406.673, 75.003, -9, Bx(w: 410, h: 11, bg: street)),
          for (final left in const [81.0, 231.0]) _Rot(left, -32.91, 62.927, 297.352, -10, Bx(w: 11, h: 300, bg: street)),
          for (final top in const [7.86, 95.86, 161.86]) _Rot(-21, top, 405.109, 65.126, -9, Bx(w: 410, h: 1, bg: centerline)),
          if (labels != null) ...[
            const Positioned(left: 17, top: 22, child: T('THẢO ĐIỀN', 10, Z.secondary, w: semiBold, ls: 1.5)),
            const _Rot(32, 134.8, 47.154, 18.061, -9, T('Xuân Thủy', 9, Z.secondary, maxLines: 1)),
            Positioned(left: 277, top: 42, child: T('Riverside', 9, labels!)),
          ],
          Positioned(left: 103, top: 45, child: Img(radius, w: 146, h: 146)),
          Positioned(left: 136, top: 78, child: Svg(halo)),
        ]),
      );
}

class _AreaLabel extends StatelessWidget {
  const _AreaLabel([this.size = 13]);
  final double size;
  @override
  Widget build(BuildContext context) =>
      Rw([const Svg('s04/map_pin'), T('Thảo Điền, HCMC', size, Z.navy, w: semiBold), const Svg('s04/chevron_down')], gap: 5);
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.icon, this.label, this.bg, this.border);
  final String icon, label;
  final Color bg, border;
  @override
  Widget build(BuildContext context) => Bx(
        r: 100,
        bg: bg,
        border: border,
        pad: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        child: Rw([Svg(icon), T(label, 11, Z.purple, w: semiBold)], gap: 5),
      );
}

class _CoralButton extends StatelessWidget {
  const _CoralButton(this.icon, this.label, this.onTap, {this.shadow = false});
  final String icon, label;
  final VoidCallback onTap;
  final bool shadow;
  @override
  Widget build(BuildContext context) => Bx(
        w: double.infinity,
        h: 50,
        r: 16,
        bg: Z.coral,
        shadow: shadow ? zShadow(alpha(Z.coral, 0.25), 12, 4) : null,
        onTap: onTap,
        child: Rw([Svg(icon), T(label, 14, Z.white, w: semiBold)], gap: 9, fill: true, main: MainAxisAlignment.center),
      );
}

/// 04 · Nearby — Loading, 05 · Ghost Mode, 06 · Connection Error
class NearbyScreen extends StatelessWidget {
  const NearbyScreen(this.state, {super.key});
  final NearbyState state;

  @override
  Widget build(BuildContext context) {
    final ghost = state == NearbyState.ghost;
    final headerTop = state == NearbyState.loading ? 0.0 : 12.0;
    final contentTop = ghost ? 12.0 : 8.0;
    return Screen(
      bg: Z.canvas,
      child: Col([
        const StatusBarSpace(),
        SizedBox(
          height: 76,
          child: Padding(
            padding: EdgeInsets.fromLTRB(24, headerTop, 24, 12),
            child: Rw([
              Col([
                T('Nearby', 24, Z.navy, w: extraBold, ls: ghost ? -1 : 0),
                const T('Your people, a little closer.', 13, Z.secondary),
              ], gap: 4),
              Bx(
                w: 44,
                h: 44,
                r: 16,
                bg: ghost ? Z.white : Z.lavender,
                border: ghost ? Z.line : null,
                shadow: ghost ? zShadow(const Color(0x0A12122B), 12, 4) : null,
                align: Alignment.center,
                onTap: () => context.push(Routes.privacy),
                child: const Svg('s04/sliders_horizontal'),
              ),
            ], fill: true, main: MainAxisAlignment.spaceBetween),
          ),
        ),
        Scroll(
          pad: EdgeInsets.fromLTRB(24, contentTop, 24, 24),
          child: switch (state) {
            NearbyState.loading => _loading(context),
            NearbyState.ghost => _ghost(context),
            NearbyState.error => _error(context),
          },
        ),
        const ZenzyBottomNav(ZTab.map),
      ], max: true, fill: true),
    );
  }

  Widget _loading(BuildContext context) => Bx(
        // Chạm bất kỳ đâu để sang trạng thái tiếp theo, như prototype.
        onTap: () => context.push(Routes.nearbyGhost),
        child: Col([
          const SizedBox(
            height: 32,
            child: Rw([_AreaLabel(), _StatusPill('s04/radar', 'Locating…', Z.white, Z.line)],
                fill: true, main: MainAxisAlignment.spaceBetween),
          ),
          const Stack(children: [
            _NeighborhoodMap(
              bg: Color(0xFFF0F2F4),
              border: Z.line,
              park: _skeleton,
              street: Z.white,
              centerline: Color(0xFFE5E8EC),
              radius: 's04_location_radius',
              halo: 's04/location_halo',
            ),
            Positioned(left: 159, top: 100, child: Bx(w: 34, h: 34, circle: true, bg: _skeleton)),
            Positioned(left: 17, top: 17, child: Bx(w: 108, h: 13, r: 6, bg: _skeleton)),
            Positioned(
              left: 77,
              top: 185,
              child: Bx(
                r: 100,
                bg: Z.white,
                border: Z.line,
                pad: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Rw([Svg('s04/loader_circle'), T('Finding your location…', 11, Z.secondary, w: medium)], gap: 6),
              ),
            ),
            Positioned(
              left: 305,
              top: 183,
              child: Bx(w: 34, h: 34, r: 12, bg: Z.white, border: Z.line, align: Alignment.center, child: Svg('s04/locate_fixed')),
            ),
          ]),
          Col([
            const SizedBox(
              height: 28,
              child: Rw([T('Around you', 18, Z.navy, w: extraBold), Bx(w: 52, h: 10, r: 5, bg: _skeleton)],
                  fill: true, main: MainAxisAlignment.spaceBetween),
            ),
            Bx(
              w: double.infinity,
              r: 16,
              bg: Z.white,
              border: Z.line,
              clip: true,
              child: Col([
                for (final (i, (name, status)) in const [(128.0, 158.0), (98.0, 137.0), (128.0, 158.0)].indexed) ...[
                  if (i > 0) const HLine(Z.line),
                  SizedBox(
                    height: 69,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Rw([
                        const Svg('s04/avatar_skeleton'),
                        Expanded(
                          child: Col([
                            Bx(w: name, h: 11, r: 5, bg: _skeleton),
                            Bx(w: status, h: 8, r: 5, bg: _skeletonSoft),
                          ], gap: 9),
                        ),
                        const Bx(w: 32, h: 10, r: 5, bg: _skeletonSoft),
                      ], gap: 12, fill: true),
                    ),
                  ),
                ],
              ], fill: true),
            ),
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Rw([Svg('s04/sparkles'), T('Bringing your neighborhood to life…', 11, Z.secondary)],
                  gap: 6, fill: true, main: MainAxisAlignment.center),
            ),
          ], gap: 14, fill: true),
        ], gap: 16, fill: true),
      );

  Widget _ghost(BuildContext context) => Col([
        Bx(
          w: double.infinity,
          h: 56,
          r: 16,
          bg: Z.white,
          border: Z.line,
          shadow: zShadow(_soft, 12, 4),
          pad: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: const Rw([_AreaLabel(), _StatusPill('s05/ghost', 'Ghost mode on', Z.lavender, Z.lavender)],
              fill: true, main: MainAxisAlignment.spaceBetween),
        ),
        Stack(children: [
          const _NeighborhoodMap(
            bg: Z.white,
            border: Z.line,
            park: Z.lavender,
            street: Z.canvas,
            centerline: Z.line,
            radius: 's05_location_radius',
            halo: 's05/location_halo',
            shadow: true,
            labels: Z.purple,
          ),
          Positioned(
            left: 154,
            top: 95,
            child: Bx(
              w: 44,
              h: 44,
              circle: true,
              bg: Z.purple,
              border: Z.white,
              bw: 4,
              shadow: zShadow(const Color(0x1212122B), 16, 4),
              align: Alignment.center,
              child: const Svg('s05/ghost1'),
            ),
          ),
          Positioned(
            left: 15,
            top: 190,
            child: Bx(
              r: 100,
              bg: Z.white,
              border: Z.line,
              shadow: zShadow(_soft, 12, 4),
              pad: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              child: const Rw([Svg('s05/eye_off'), T('Your location is hidden', 10, Z.secondary, w: medium)], gap: 5),
            ),
          ),
          Positioned(
            left: 305,
            top: 183,
            child: Bx(
              w: 34,
              h: 34,
              r: 12,
              bg: Z.white,
              border: Z.line,
              shadow: zShadow(_soft, 12, 4),
              align: Alignment.center,
              child: const Svg('s05/locate_fixed'),
            ),
          ),
        ]),
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Col([
            const Svg('s05/ghost_illustration'),
            const T('A little quiet here', 24, Z.navy, w: extraBold, ls: -0.5, align: TextAlign.center),
            const SizedBox(
              width: 300,
              child: T('No nearby friends found. Turn off ghost mode to connect!', 14, Z.secondary, lh: 1.5, align: TextAlign.center),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Col([
                _CoralButton('s05/ghost2', 'Turn off ghost mode', () => context.push(Routes.nearbyError), shadow: true),
                const T('Only your chosen friends will see you.', 11, Z.secondary),
              ], gap: 10, cross: CrossAxisAlignment.center, fill: true),
            ),
          ], gap: 12, cross: CrossAxisAlignment.center, fill: true),
        ),
      ], gap: 16, fill: true);

  Widget _error(BuildContext context) => Col([
        const SizedBox(
          height: 32,
          child: Rw([_AreaLabel(12), _StatusPill('s06/users', 'Friends only', Z.white, Z.lavender)],
              fill: true, main: MainAxisAlignment.spaceBetween),
        ),
        Stack(children: [
          const _NeighborhoodMap(
            bg: Color(0xFFF0F2F4),
            border: Z.line2,
            park: Color(0xFFDFEBE3),
            street: Z.white,
            centerline: Color(0xFFE5E8EC),
            radius: 's06_location_radius',
            halo: 's06/location_halo',
            labels: Z.secondary,
          ),
          Positioned(
            left: 154,
            top: 95,
            child: Bx(
              w: 44,
              h: 44,
              circle: true,
              bg: const Color(0xFFA6A6B8),
              border: Z.white,
              bw: 4,
              shadow: zShadow(const Color(0x1233275C), 16, 4),
              align: Alignment.center,
              child: const Svg('s06/navigation'),
            ),
          ),
          const Positioned(
            left: 15,
            top: 190,
            child: Bx(
              r: 100,
              bg: Z.white,
              pad: EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              child: Rw([Svg('s06/clock_3'), T('Last updated at 9:38', 10, Z.secondary, w: medium)], gap: 5),
            ),
          ),
          const Positioned(
            left: 305,
            top: 183,
            child: Bx(w: 34, h: 34, r: 12, bg: Z.white, align: Alignment.center, child: Svg('s06/locate_fixed')),
          ),
        ]),
        Col([
          Bx(
            w: double.infinity,
            r: 16,
            bg: const Color(0xFFFFF0E4),
            pad: const EdgeInsets.all(14),
            onTap: () => context.push(Routes.liveLost),
            child: const Rw([
              Svg('s06/wifi_off'),
              Expanded(
                child: Col([
                  T("You're offline", 12, Z.secondary),
                  T('Check your Wi-Fi or mobile data.', 11, Z.secondary),
                ], gap: 3),
              ),
            ], gap: 10, fill: true),
          ),
          Bx(
            w: double.infinity,
            r: 16,
            bg: Z.white,
            border: Z.lavender,
            pad: const EdgeInsets.all(20),
            child: Col([
              const Col([
                T('Let’s reconnect', 20, Z.navy, ls: -0.4),
                T('We can’t refresh nearby friends right now. Your privacy settings are still safe.', 13, Z.secondary, lh: 1.5),
              ], gap: 8),
              _CoralButton('s06/refresh_cw', 'Retry connection', () => context.push(Routes.nearbyLoading)),
            ], gap: 14, fill: true),
          ),
          const T('Showing your last known location. No live updates.', 11, Z.secondary, align: TextAlign.center),
        ], gap: 16, cross: CrossAxisAlignment.center, fill: true),
      ], gap: 16, fill: true);
}
