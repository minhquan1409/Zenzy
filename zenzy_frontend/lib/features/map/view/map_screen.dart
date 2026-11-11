import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../model/map_data.dart';
import '../model/map_marker.dart';
import '../repository/map_repository.dart';
import 'widgets/event_marker.dart';
import 'widgets/friend_marker.dart';
import 'widgets/zenzy_map.dart';

/// Mở màn hình mà pin trỏ tới (cửa hàng hoặc sự kiện).
void openMarker(BuildContext context, MapMarker m) {
  if (m.targetType == 'shop') context.push(Routes.shop(m.targetId));
  if (m.targetType == 'event') context.push(Routes.event(m.targetId));
}

class _MapChip extends StatelessWidget {
  const _MapChip(this.icon, this.label, this.onTap, {this.selected = false});
  final String icon, label;
  final VoidCallback onTap;
  final bool selected;
  @override
  Widget build(BuildContext context) => Bx(
        circle: true,
        bg: selected ? Z.coral : Z.white,
        shadow: selected ? zShadow(alpha(Z.coral, 0.15), 4, 4) : zShadow(const Color(0x12000000), 6, 4),
        pad: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        onTap: onTap,
        child: Rw([Svg(icon), T(label, 13, selected ? Z.white : Z.navy, w: semiBold)], gap: 6),
      );
}

/// 03 · Home Map
class MapScreen extends StatefulWidget {
  const MapScreen({super.key});
  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _locate = LocateController();

  @override
  void dispose() {
    _locate.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final navHeight = 64 + MediaQuery.paddingOf(context).bottom;
    return Screen(
      bg: const Color(0xFFE4E9F2),
      child: Loader<MapData>(
        load: () => context.read<MapRepository>().fetchMap('main'),
        initial: SampleData.instance.map('main'),
        builder: (context, vm) {
          final data = vm.data;
          return Stack(children: [
            Positioned.fill(
              child: ZenzyMap(
                locate: _locate,
                attributionBottom: navHeight + 8,
                pins: [
                  for (final m in data.pins)
                    MapPin(
                      lat: m.lat,
                      lng: m.lng,
                      child: m.kind == 'friend'
                          ? FriendMarker(m.avatar ?? '')
                          : EventMarker(m, onTap: () => openMarker(context, m)),
                    ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              child: Col([
                const StatusBarSpace(),
                Bx(
                  margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  w: double.infinity,
                  h: 54,
                  circle: true,
                  bg: Z.white,
                  shadow: zShadow(const Color(0x1F000000), 8, 6),
                  pad: const EdgeInsets.symmetric(horizontal: 16),
                  child: Rw([
                    const Svg('s03/search'),
                    const Expanded(child: T('Search places, events, friends...', 14, Z.secondary, maxLines: 1)),
                    Bx(
                      w: 38,
                      h: 38,
                      circle: true,
                      bg: Z.lavender,
                      align: Alignment.center,
                      onTap: () => context.push(Routes.nearbyLoading),
                      child: const Svg('s03/sliders_horizontal'),
                    ),
                  ], gap: 12, fill: true),
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 16, top: 12),
                  child: Rw([
                    _MapChip('s03/users', 'Friends', () => context.push(Routes.nearbyLoading), selected: true),
                    _MapChip('s03/calendar_check', 'Events', () => context.push(Routes.event(data.activity.eventId))),
                    _MapChip('s03/store', 'Shops', () => context.push(Routes.shop())),
                  ], gap: 8),
                ),
              ], fill: true),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Col([
                Align(
                  alignment: Alignment.centerRight,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 16, bottom: 12),
                    child: LocateButton(onTap: _locate.locate),
                  ),
                ),
                Bx(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  w: double.infinity,
                  r: 16,
                  bg: Z.white,
                  shadow: zShadow(const Color(0x12000000), 8, 6),
                  pad: const EdgeInsets.all(12),
                  child: Rw([
                    Img(data.activity.avatar, w: 40, h: 40, circle: true),
                    Expanded(
                      child: Col([
                        T(data.activity.title, 13, Z.navy, w: bold, maxLines: 1),
                        T(data.activity.subtitle, 11, Z.secondary, maxLines: 1),
                      ], gap: 2),
                    ),
                    Bx(
                      r: 12,
                      bg: Z.coral,
                      pad: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      onTap: () => context.push(Routes.event(data.activity.eventId)),
                      child: const T('Join', 12, Z.white, w: bold),
                    ),
                  ], gap: 12, fill: true),
                ),
                gapH(92),
                const ZenzyBottomNav(ZTab.map),
              ], fill: true),
            ),
          ]);
        },
      ),
    );
  }
}
