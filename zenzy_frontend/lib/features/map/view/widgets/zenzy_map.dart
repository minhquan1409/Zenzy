import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../../core/config/env.dart';
import '../../../../core/design/design.dart';
import '../../../../core/widgets/toast.dart';

/// Một widget gắn vào điểm địa lý trên bản đồ; di chuyển theo bản đồ khi kéo/zoom.
class MapPin {
  const MapPin({required this.lat, required this.lng, required this.child, this.anchor = const Offset(0.5, 1), this.dx = 0, this.dy = 0});
  final double lat;
  final double lng;
  final Widget child;

  /// Điểm của widget đặt đúng vào toạ độ, theo tỉ lệ kích thước widget (0.5, 1 = giữa cạnh đáy).
  final Offset anchor;

  /// Dịch thêm (px thiết kế).
  final double dx;
  final double dy;
}

/// Điều khiển nút "định vị lại bản thân".
class LocateController extends ChangeNotifier {
  /// Xin quyền vị trí (lần đầu), hiện chấm vị trí và đưa camera về chỗ người dùng.
  void locate() => notifyListeners();
}

/// Web Mercator: toạ độ → pixel thế giới (ô 512px như MapLibre) ở mức [zoom].
Offset _project(double lat, double lng, double zoom) {
  final world = 512 * math.pow(2, zoom).toDouble();
  final x = (lng + 180) / 360 * world;
  final s = math.sin(lat * math.pi / 180).clamp(-0.9999, 0.9999);
  final y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * world;
  return Offset(x, y);
}

/// Bản đồ thật (MapLibre + tile OpenFreeMap, không cần API key) kèm các [pins]. Lấp đầy khung cha.
class ZenzyMap extends StatefulWidget {
  const ZenzyMap({super.key, required this.pins, this.locate, this.attributionBottom = 96});
  final List<MapPin> pins;
  final LocateController? locate;

  /// Khoảng cách từ đáy tới nút attribution (px thiết kế), để không bị thẻ/nav che.
  final double attributionBottom;

  @override
  State<ZenzyMap> createState() => _ZenzyMapState();
}

class _ZenzyMapState extends State<ZenzyMap> {
  static const _home = CameraPosition(target: LatLng(Env.homeLat, Env.homeLng), zoom: Env.homeZoom);
  final _camera = ValueNotifier<CameraPosition>(_home);
  MapLibreMapController? _controller;
  bool _showMyLocation = false;

  @override
  void initState() {
    super.initState();
    widget.locate?.addListener(_locate);
  }

  @override
  void didUpdateWidget(ZenzyMap old) {
    super.didUpdateWidget(old);
    if (old.locate != widget.locate) {
      old.locate?.removeListener(_locate);
      widget.locate?.addListener(_locate);
    }
  }

  @override
  void dispose() {
    widget.locate?.removeListener(_locate);
    _camera.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (!mounted) return;
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        showToast(context, 'Location permission is needed to find you.');
        return;
      }
      if (!_showMyLocation) setState(() => _showMyLocation = true);
      final position = await Geolocator.getLastKnownPosition() ??
          await Geolocator.getCurrentPosition(timeLimit: const Duration(seconds: 10));
      await _controller?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(position.latitude, position.longitude), Env.locateZoom),
        duration: const Duration(milliseconds: 600),
      );
    } catch (_) {
      if (mounted) showToast(context, "Couldn't get your location. Is GPS on?");
    }
  }

  @override
  Widget build(BuildContext context) {
    final scale = DesignScale.of(context).scale;
    return LayoutBuilder(builder: (context, box) {
      final center = Offset(box.maxWidth / 2, box.maxHeight / 2);
      return ClipRect(
        child: Stack(clipBehavior: Clip.hardEdge, children: [
          Positioned.fill(
            child: Unscaled(
              child: MapLibreMap(
                styleString: Env.mapStyle,
                initialCameraPosition: _home,
                trackCameraPosition: true,
                onMapCreated: (c) => _controller = c,
                onCameraMove: (position) => _camera.value = position,
                onCameraIdle: () {
                  final position = _controller?.cameraPosition;
                  if (position != null) _camera.value = position;
                },
                rotateGesturesEnabled: false,
                tiltGesturesEnabled: false,
                compassEnabled: false,
                logoEnabled: false,
                myLocationEnabled: _showMyLocation,
                myLocationRenderMode: _showMyLocation ? MyLocationRenderMode.compass : MyLocationRenderMode.normal,
                attributionButtonPosition: AttributionButtonPosition.bottomLeft,
                attributionButtonMargins: math.Point(12 * scale, widget.attributionBottom * scale),
              ),
            ),
          ),
          ValueListenableBuilder<CameraPosition>(
            valueListenable: _camera,
            builder: (context, camera, _) {
              final origin = _project(camera.target.latitude, camera.target.longitude, camera.zoom);
              return Stack(clipBehavior: Clip.none, children: [
                for (final pin in widget.pins)
                  () {
                    final p = center + (_project(pin.lat, pin.lng, camera.zoom) - origin) / scale;
                    return Positioned(
                      left: p.dx + pin.dx,
                      top: p.dy + pin.dy,
                      child: FractionalTranslation(translation: Offset(-pin.anchor.dx, -pin.anchor.dy), child: pin.child),
                    );
                  }(),
              ]);
            },
          ),
        ]),
      );
    });
  }
}

/// Nút tròn trắng "định vị lại bản thân", giống Google Maps.
class LocateButton extends StatelessWidget {
  const LocateButton({super.key, required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Bx(
        w: 44,
        h: 44,
        circle: true,
        bg: Z.white,
        shadow: zShadow(const Color(0x1F000000), 8, 4),
        align: Alignment.center,
        onTap: onTap,
        child: const Svg('s04/locate_fixed', w: 22, h: 22),
      );
}
