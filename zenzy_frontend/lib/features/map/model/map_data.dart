import 'map_marker.dart';

Map<String, dynamic> asMap(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Map<String, dynamic>> asList(dynamic v) => v is List ? [for (final e in v) asMap(e)] : [];

/// Thẻ hoạt động ở đáy bản đồ ("Chloe started ...").
class MapActivity {
  MapActivity({required this.avatar, required this.title, required this.subtitle, this.eventId});
  final String avatar;
  final String title;
  final String subtitle;
  final String? eventId;

  factory MapActivity.fromJson(Map<String, dynamic> j) => MapActivity(
        avatar: j['avatar'] ?? '',
        title: j['title'] ?? '',
        subtitle: j['subtitle'] ?? '',
        eventId: j['event_id']?.toString(),
      );
}

class MapData {
  MapData({required this.pins, required this.activity});
  final List<MapMarker> pins;
  final MapActivity activity;

  factory MapData.fromJson(Map<String, dynamic> j) => MapData(
        pins: [for (final p in asList(j['pins'])) MapMarker.fromJson(p)],
        activity: MapActivity.fromJson(asMap(j['activity'])),
      );
}

/// Pin người dùng vừa đăng.
class LivePin {
  LivePin({required this.title, required this.placeTime, required this.audienceText});
  final String title;
  final String placeTime;
  final String audienceText;

  factory LivePin.fromJson(Map<String, dynamic> j) => LivePin(
        title: j['title'] ?? '',
        placeTime: j['place_time'] ?? '',
        audienceText: j['audience_text'] ?? '',
      );
}
