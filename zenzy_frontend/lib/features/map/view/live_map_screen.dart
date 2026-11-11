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
import 'create_live_pin_screen.dart' show pinTypes, postLivePin;
import 'map_screen.dart' show openMarker;
import 'widgets/friend_marker.dart' show PinPointer;
import 'widgets/zenzy_map.dart';

enum LiveMapState { explore, create, pinLive, loading, connectionLost }

const _skeleton = Color(0xFFD8DDE5);
const _skeletonSoft = Color(0xFFE8EBF0);
const _softColor = Color(0x171E254B); // rgba(30,37,75,0.09)
const _sheetSoft = Color(0xFFF7F8FC);
final _cardShadow = zShadow(_softColor, 18, 6);

class _FlowFriendPin extends StatelessWidget {
  const _FlowFriendPin(this.avatar, this.label);
  final String avatar, label;
  @override
  Widget build(BuildContext context) => Col([
        Bx(
          w: 48,
          h: 48,
          circle: true,
          bg: Z.white,
          border: Z.rose,
          bw: 3,
          shadow: zShadow(_softColor, 9, 6),
          align: Alignment.center,
          child: Img(avatar, w: 40, h: 40),
        ),
        Bx(
          r: 12,
          bg: Z.white,
          pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: T(label, 10, Z.indigo, w: medium),
        ),
      ], gap: 5, cross: CrossAxisAlignment.center);
}

class _FlowEventPin extends StatelessWidget {
  const _FlowEventPin(this.icon, this.rose, {this.onTap});
  final String icon;
  final bool rose;
  final VoidCallback? onTap;

  static const icons = {
    'coffee': 'flow/pin_coffee',
    'bag': 'flow/pin_bag',
    'fire': 'flow/pin_fire',
    'basketball': 'flow/basketball',
    'soccer': 'flow/pin_fire',
  };

  @override
  Widget build(BuildContext context) => Bx(
        onTap: onTap,
        child: Col([
          Bx(
            w: 44,
            h: 44,
            circle: true,
            bg: rose ? Z.rose : Z.indigo,
            border: Z.white,
            bw: 2,
            shadow: zShadow(_softColor, 9, 6),
            align: Alignment.center,
            child: Svg(icons[icon] ?? 'flow/pin_bag'),
          ),
          PinPointer(rose ? 'flow/pointer_rose' : 'flow/pointer_indigo', w: 10, h: 7, inset: 0.67),
        ], cross: CrossAxisAlignment.center),
      );
}

class _FlowChip extends StatelessWidget {
  const _FlowChip(this.icon, this.label, {this.selected = false});
  final String icon, label;
  final bool selected;
  @override
  Widget build(BuildContext context) => Bx(
        circle: true,
        bg: selected ? Z.indigo : Z.white,
        shadow: _cardShadow,
        pad: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Rw([Svg(icon), T(label, 12, selected ? Z.white : Z.indigo, w: semiBold)], gap: 6),
      );
}

class _Bar extends StatelessWidget {
  const _Bar(this.w, this.h, [this.color = _skeleton]);
  final double w, h;
  final Color color;
  @override
  Widget build(BuildContext context) => Bx(w: w, h: h, r: 6, bg: color);
}

/// Luồng "live pin": 01 Explore your live map · 02/03 sheet Create Live Pin · 04 Your pin is live,
/// cùng hai trạng thái Loading và Connection lost nằm trên cùng bản đồ.
class LiveMapScreen extends StatefulWidget {
  const LiveMapScreen({super.key, required this.initial, this.pin});
  final LiveMapState initial;

  /// Pin vừa đăng từ màn 14 (nếu có).
  final LivePin? pin;

  @override
  State<LiveMapScreen> createState() => _LiveMapScreenState();
}

class _LiveMapScreenState extends State<LiveMapScreen> {
  late LiveMapState _state = widget.initial;
  late LivePin _pin = widget.pin ??
      LivePin(
        title: 'Need +2 for basketball',
        placeTime: 'Riverside Courts · Today, 5:30 PM',
        audienceText: 'Everyone nearby · Live until 7:30 PM',
      );
  final _locate = LocateController();

  @override
  void dispose() {
    _locate.dispose();
    super.dispose();
  }

  void _set(LiveMapState s) => setState(() => _state = s);

  List<MapPin> _pins(List<MapMarker> markers) {
    final (lat, lng) = SampleData.instance.newPinLocation;
    return [
      if (_state != LiveMapState.loading)
        for (final m in markers)
          m.kind == 'friend'
              // Neo vào đáy vòng avatar (nhãn nằm bên dưới).
              ? MapPin(lat: m.lat, lng: m.lng, anchor: const Offset(0.5, 0), dy: -48, child: _FlowFriendPin(m.avatar ?? '', m.label ?? ''))
              : MapPin(
                  lat: m.lat,
                  lng: m.lng,
                  child: _FlowEventPin(m.icon ?? '', m.color == 'coral', onTap: () => openMarker(context, m)),
                ),
      if (_state == LiveMapState.pinLive) ...[
        MapPin(lat: lat, lng: lng, anchor: const Offset(0.5, 0.5), dy: -22, child: const IgnorePointer(child: Svg('flow/new_pin_halo'))),
        MapPin(lat: lat, lng: lng, child: const _FlowEventPin('basketball', true)),
        MapPin(
          lat: lat,
          lng: lng,
          anchor: Offset.zero,
          dx: -22,
          dy: -66,
          child: const Bx(
            r: 6,
            bg: Z.indigo,
            pad: EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            child: T('NEW', 8, Z.white, w: semiBold),
          ),
        ),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final navHeight = 67 + MediaQuery.paddingOf(context).bottom;
    return PopScope(
      canPop: _state != LiveMapState.create,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _set(LiveMapState.explore);
      },
      child: Screen(
        bg: const Color(0xFFE4E9F2),
        font: rubik,
        child: Loader<MapData>(
          load: () => context.read<MapRepository>().fetchMap('flow'),
          initial: SampleData.instance.map('flow'),
          builder: (context, vm) {
            final data = vm.data;
            return Stack(children: [
              Positioned.fill(child: ZenzyMap(locate: _locate, attributionBottom: navHeight + 8, pins: _pins(data.pins))),
              const Positioned(left: 0, right: 0, top: 0, child: _MapControls()),
              if (_state == LiveMapState.loading) ...[
                const Positioned(left: 48, top: 201, child: _SkeletonMarker()),
                const Positioned(left: 261, top: 278, child: _SkeletonMarker()),
                Positioned(
                  left: 89,
                  top: 381,
                  child: Bx(
                    circle: true,
                    bg: Z.white,
                    pad: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    onTap: () => _set(LiveMapState.explore),
                    child: const Rw([
                      Bx(w: 15, h: 15, align: Alignment.center, child: Svg('flow/loader_circle')),
                      T('Finding your neighborhood…', 11, Z.indigo),
                    ], gap: 8),
                  ),
                ),
              ],
              if (_state == LiveMapState.pinLive)
                Positioned(
                  left: 16,
                  top: 302,
                  width: 370,
                  child: Bx(
                    r: 18,
                    bg: Z.white,
                    shadow: _cardShadow,
                    pad: const EdgeInsets.all(14),
                    onTap: () => _set(LiveMapState.explore),
                    child: const Rw([
                      Bx(w: 36, h: 36, circle: true, bg: Color(0xFFFFECEE), align: Alignment.center, child: Svg('flow/check')),
                      Col([
                        T('Your pin is live!', 14, Z.ink, w: bold),
                        T('Your neighborhood can see it now.', 11, Z.slate),
                      ], gap: 4),
                    ], gap: 12, fill: true),
                  ),
                ),
              // Nội dung neo đáy: thẻ hoạt động / nút +, rồi thanh điều hướng.
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Col([
                  if (_state == LiveMapState.explore || _state == LiveMapState.pinLive)
                    Align(
                      alignment: Alignment.centerRight,
                      child: Padding(
                        padding: const EdgeInsets.only(right: 22, bottom: 12),
                        child: LocateButton(onTap: _locate.locate),
                      ),
                    ),
                  switch (_state) {
                    LiveMapState.loading => const _LoadingSheet(),
                    LiveMapState.pinLive => Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        child: Rw([
                          Bx(
                            margin: const EdgeInsets.only(bottom: 22),
                            w: 300,
                            r: 20,
                            bg: Z.white,
                            shadow: _cardShadow,
                            pad: const EdgeInsets.all(16),
                            child: Col([
                              Rw([
                                Flexible(child: T(_pin.title, 14, Z.ink, w: bold, maxLines: 1)),
                                const T('LIVE', 9, Z.rose, w: semiBold),
                              ], fill: true, main: MainAxisAlignment.spaceBetween),
                              Rw([const Svg('flow/summary_pin'), Flexible(child: T(_pin.placeTime, 10, Z.slate, maxLines: 1))], gap: 5),
                              T(_pin.audienceText, 10, Z.slate),
                            ], gap: 9, fill: true),
                          ),
                          _Fab(() => _set(LiveMapState.create)),
                        ], fill: true, main: MainAxisAlignment.spaceBetween, cross: CrossAxisAlignment.end),
                      ),
                    _ => Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Col([
                          Bx(
                            w: double.infinity,
                            h: 64,
                            r: 20,
                            bg: Z.white,
                            shadow: _cardShadow,
                            pad: const EdgeInsets.all(12),
                            child: Rw([
                              Img(data.activity.avatar, w: 40, h: 40),
                              Expanded(
                                child: Col([
                                  T(data.activity.title, 12, Z.indigo, w: bold, maxLines: 1),
                                  T(data.activity.subtitle, 10, Z.slate, maxLines: 1),
                                ], gap: 4),
                              ),
                              Bx(
                                r: 12,
                                bg: const Color(0xFFF9E795),
                                pad: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                onTap: () => context.push(Routes.event(data.activity.eventId)),
                                child: const T('Join', 12, Z.ink, w: semiBold),
                              ),
                            ], gap: 10, fill: true),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(top: 14, bottom: 16),
                            child: _Fab(() => _set(LiveMapState.create)),
                          ),
                        ], cross: CrossAxisAlignment.end, fill: true),
                      ),
                  },
                  const _FlowNav(),
                ], fill: true),
              ),
              if (_state == LiveMapState.create) ...[
                Positioned.fill(child: Bx(bg: const Color(0x4D121D3C), onTap: () => _set(LiveMapState.explore))),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: _CreatePinSheet(
                    onClose: () => _set(LiveMapState.explore),
                    onPosted: (pin) => setState(() {
                      _pin = pin;
                      _state = LiveMapState.pinLive;
                    }),
                  ),
                ),
              ],
              if (_state == LiveMapState.connectionLost) ...[
                Positioned.fill(child: Bx(bg: const Color(0x70152142), onTap: () {})),
                Center(
                  child: Bx(
                    w: 346,
                    h: 338,
                    r: 28,
                    bg: Z.white,
                    shadow: _cardShadow,
                    pad: const EdgeInsets.all(24),
                    child: Col([
                      const Bx(w: 64, h: 64, r: 22, bg: Color(0xFFFFECEE), align: Alignment.center, child: Svg('flow/triangle_alert')),
                      const Col([
                        T('Connection Lost', 27, Z.ink, w: extraBold, align: TextAlign.center, font: gabarito),
                        T('Unable to sync your live GPS location. Please check your network.', 14, Z.slate,
                            lh: 1.6, align: TextAlign.center),
                      ], gap: 10, cross: CrossAxisAlignment.center, fill: true),
                      Bx(
                        w: double.infinity,
                        h: 52,
                        r: 16,
                        bg: Z.rose,
                        onTap: () {
                          vm.refresh();
                          _set(LiveMapState.loading);
                        },
                        child: const Rw([
                          Bx(w: 20, h: 20, align: Alignment.center, child: Svg('flow/refresh_cw')),
                          T('Retry Connection', 15, Z.white, w: semiBold),
                        ], gap: 8, fill: true, main: MainAxisAlignment.center),
                      ),
                    ], gap: 18, cross: CrossAxisAlignment.center, fill: true),
                  ),
                ),
              ],
            ]);
          },
        ),
      ),
    );
  }
}

class _MapControls extends StatelessWidget {
  const _MapControls();
  @override
  Widget build(BuildContext context) => Col([
        const StatusBarSpace(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Col([
            Bx(
              w: double.infinity,
              h: 54,
              r: 27,
              bg: Z.white,
              shadow: _cardShadow,
              pad: const EdgeInsets.symmetric(horizontal: 16),
              child: const Rw([
                Svg('flow/search'),
                Expanded(child: T('Search places, events, friends...', 13, Z.slate, maxLines: 1)),
                Svg('flow/sliders'),
              ], gap: 12, fill: true),
            ),
            const Rw([
              _FlowChip('flow/chip_friends', 'Friends', selected: true),
              _FlowChip('flow/chip_events', 'Events'),
              _FlowChip('flow/chip_shops', 'Shops'),
            ], gap: 8),
          ], gap: 12, fill: true),
        ),
      ], fill: true);
}

/// Thanh điều hướng của luồng live pin: Home · Feed · Message · Alerts · Profile.
class _FlowNav extends StatelessWidget {
  const _FlowNav();
  @override
  Widget build(BuildContext context) {
    Widget item(String icon, String label, bool selected, VoidCallback onTap) => Bx(
          w: 66,
          onTap: onTap,
          child: Col([Svg(icon), T(label, 10, selected ? Z.rose : Z.indigo, w: selected ? bold : medium)],
              gap: 4, cross: CrossAxisAlignment.center),
        );
    return ColoredBox(
      color: Z.white,
      child: Col([
        const HLine(Z.line),
        SizedBox(
          height: 66,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 7, 12, 0),
            child: Rw([
              item('flow/nav_home', 'Home', true, () {}),
              item('flow/nav_feed', 'Feed', false, () => context.go(Routes.feed)),
              item('flow/nav_message', 'Message', false, () => context.go(Routes.messages)),
              item('flow/nav_alerts', 'Alerts', false, () => context.push(Routes.notifications)),
              item('flow/nav_profile', 'Profile', false, () => context.go(Routes.profile)),
            ], fill: true, main: MainAxisAlignment.spaceBetween),
          ),
        ),
        const NavBarSpace(),
      ], fill: true),
    );
  }
}

class _Fab extends StatelessWidget {
  const _Fab(this.onTap);
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Bx(
        w: 56,
        h: 56,
        circle: true,
        bg: Z.rose,
        shadow: _cardShadow,
        align: Alignment.center,
        onTap: onTap,
        child: const Svg('flow/fab_plus'),
      );
}

class _SkeletonMarker extends StatelessWidget {
  const _SkeletonMarker();
  @override
  Widget build(BuildContext context) => Bx(
        w: 80,
        h: 75,
        r: 20,
        bg: Z.white,
        shadow: _cardShadow,
        pad: const EdgeInsets.all(8),
        child: const Col([Bx(w: 42, h: 42, circle: true, bg: _skeleton), _Bar(64, 9)], gap: 8, cross: CrossAxisAlignment.center),
      );
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard({required this.media});
  final bool media;
  @override
  Widget build(BuildContext context) => Bx(
        w: double.infinity,
        r: 20,
        bg: Z.white,
        border: Z.line,
        pad: const EdgeInsets.all(14),
        child: Col([
          const Rw([
            Bx(w: 36, h: 36, circle: true, bg: _skeleton),
            Expanded(child: Col([_Bar(112, 10), _Bar(148, 7, _skeletonSoft)], gap: 7)),
            _Bar(20, 6),
          ], gap: 10, fill: true),
          const Col([_Bar(290, 9), _Bar(216, 9, _skeletonSoft)], gap: 7),
          if (media) const _Bar(314, 28, _skeletonSoft),
          const Rw([_Bar(36, 8), _Bar(36, 8), _Bar(36, 8)], gap: 12),
        ], gap: 10, fill: true),
      );
}

class _LoadingSheet extends StatelessWidget {
  const _LoadingSheet();
  @override
  Widget build(BuildContext context) => const Bx(
        w: double.infinity,
        h: 352,
        br: BorderRadius.vertical(top: Radius.circular(28)),
        bg: _sheetSoft,
        clip: true,
        pad: EdgeInsets.fromLTRB(24, 18, 24, 0),
        child: SingleChildScrollView(
          physics: NeverScrollableScrollPhysics(),
          child: Col([
            Rw([T('Around you', 20, Z.ink, w: bold, font: gabarito), _Bar(46, 10)],
                fill: true, main: MainAxisAlignment.spaceBetween, cross: CrossAxisAlignment.start),
            _SkeletonCard(media: true),
            _SkeletonCard(media: false),
          ], gap: 12, fill: true),
        ),
      );
}

/// Sheet Create Live Pin của luồng live pin (frame 02 = form trống, 03 = form đã điền).
class _CreatePinSheet extends StatefulWidget {
  const _CreatePinSheet({required this.onClose, required this.onPosted});
  final VoidCallback onClose;
  final ValueChanged<LivePin> onPosted;
  @override
  State<_CreatePinSheet> createState() => _CreatePinSheetState();
}

class _CreatePinSheetState extends State<_CreatePinSheet> {
  int _type = 1;
  bool _everyone = true;
  bool _busy = false;
  final _title = TextEditingController();
  final _desc = TextEditingController();

  @override
  void initState() {
    super.initState();
    _title.addListener(_changed);
    _desc.addListener(_changed);
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  bool get _ready => _title.text.trim().isNotEmpty && _desc.text.trim().isNotEmpty;

  Future<void> _post() async {
    if (!_ready || _busy) return;
    _busy = true;
    final pin = await postLivePin(context,
        type: _type, title: _title.text.trim(), description: _desc.text.trim(), everyone: _everyone);
    if (mounted) widget.onPosted(pin);
  }

  Widget _label(String text) => T(text, 12, Z.ink, w: semiBold);

  Widget _box({required Widget child, double h = 46}) => Bx(
        w: double.infinity,
        h: h,
        r: 12,
        bg: Z.white,
        border: Z.line,
        pad: const EdgeInsets.all(12),
        align: h == 46 ? Alignment.centerLeft : Alignment.topLeft,
        child: child,
      );

  @override
  Widget build(BuildContext context) {
    final ready = _ready;
    final field = zStyle(13, Z.ink, lh: 1.45, font: rubik);
    return ImePadding(
      child: Bx(
        w: double.infinity,
        br: const BorderRadius.vertical(top: Radius.circular(32)),
        bg: Z.white,
        shadow: zShadow(const Color(0x2112122B), 24, -6),
        pad: const EdgeInsets.fromLTRB(24, 14, 24, 0),
        onTap: () {},
        child: Col([
          const Center(child: Bx(w: 40, h: 4, r: 2, bg: Z.line)),
          Rw([
            Col([
              const T('Create Live Pin', 24, Z.ink, w: extraBold, font: gabarito),
              T(ready ? 'Your next hangout, ready to go.' : 'From the + button to your neighborhood.', 11, Z.slate),
            ], gap: 4),
            Bx(w: 32, h: 32, circle: true, bg: _sheetSoft, align: Alignment.center, onTap: widget.onClose, child: const Svg('flow/sheet_x')),
          ], fill: true, main: MainAxisAlignment.spaceBetween),
          Bx(
            w: double.infinity,
            r: 12,
            bg: _sheetSoft,
            pad: const EdgeInsets.all(4),
            child: Rw([
              for (final (i, label) in pinTypes.indexed)
                Expanded(
                  child: Bx(
                    h: 35,
                    r: 8,
                    bg: i == _type ? Z.rose : _sheetSoft,
                    align: Alignment.center,
                    onTap: () => setState(() => _type = i),
                    child: T(label, 12, i == _type ? Z.white : Z.slate, w: semiBold),
                  ),
                ),
            ], gap: 4, fill: true),
          ),
          Col([
            Col([
              _label('Pin Title'),
              _box(child: ZField(controller: _title, placeholder: 'Give your pin a title', style: field, placeholderColor: Z.mist)),
            ], gap: 7, fill: true),
            Rw([
              Expanded(
                child: Col([
                  _label('Time'),
                  _box(
                    child: const Rw([
                      Svg('flow/sheet_clock'),
                      Expanded(child: T('5:30 PM (Today)', 13, Z.ink, lh: 1.45, maxLines: 1)),
                    ], gap: 8, fill: true),
                  ),
                ], gap: 7),
              ),
              Expanded(
                child: Col([
                  _label('Location'),
                  _box(
                    child: const Rw([
                      Svg('flow/sheet_pin'),
                      Expanded(child: T('Riverside Courts', 13, Z.ink, lh: 1.45, maxLines: 1)),
                    ], gap: 8, fill: true),
                  ),
                ], gap: 7),
              ),
            ], gap: 12, cross: CrossAxisAlignment.start, fill: true),
            Col([
              _label('Description'),
              _box(
                h: 78,
                child: ZField(
                  controller: _desc,
                  placeholder: 'What’s the plan? Add a few friendly details…',
                  style: field,
                  placeholderColor: Z.mist,
                  singleLine: false,
                ),
              ),
            ], gap: 7, fill: true),
          ], gap: 12, fill: true),
          Col([
            _label('Who can see this?'),
            Rw([
              for (final (label, value) in const [('Everyone nearby', true), ('Close Friends', false)])
                Expanded(
                  child: Bx(
                    h: 42,
                    r: 12,
                    bg: _everyone == value ? const Color(0xFFFFECEE) : Z.white,
                    border: _everyone == value ? Z.rose : Z.line,
                    pad: const EdgeInsets.symmetric(horizontal: 10),
                    onTap: () => setState(() => _everyone = value),
                    child: Rw([
                      if (_everyone == value) const Svg('flow/sheet_radio') else const Bx(w: 16, h: 16, circle: true, border: Z.mist, bw: 1.5),
                      Flexible(
                        child: T(label, 11, _everyone == value ? Z.ink : Z.slate,
                            w: _everyone == value ? semiBold : normal, maxLines: 1),
                      ),
                    ], gap: 7, fill: true),
                  ),
                ),
            ], gap: 10, fill: true),
          ], gap: 8, fill: true),
          Col([
            Bx(
              w: double.infinity,
              h: 52,
              r: 16,
              bg: ready ? Z.rose : _skeletonSoft,
              onTap: _post,
              child: Rw([
                Svg(ready ? 'flow/post_enabled' : 'flow/post_disabled'),
                T('Post to Map', 15, ready ? Z.white : Z.mist, w: semiBold),
              ], gap: 8, fill: true, main: MainAxisAlignment.center),
            ),
            T(ready ? 'Visible nearby · Live until 7:30 PM' : 'Add a title and description to post your pin.', 10, Z.slate,
                align: TextAlign.center),
          ], gap: 7, cross: CrossAxisAlignment.center, fill: true),
          const NavBarSpace(top: 20),
        ], gap: 16, fill: true),
      ),
    );
  }
}
