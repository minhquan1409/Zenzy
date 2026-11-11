/// Một pin trên bản đồ. [lat]/[lng] là điểm địa lý mà mũi pin chỉ vào.
class MapMarker {
  MapMarker({
    required this.id,
    required this.kind,
    required this.lat,
    required this.lng,
    this.avatar,
    this.label,
    this.icon,
    this.color = 'navy',
    this.targetType,
    this.targetId,
    this.isNew = false,
  });

  final String id;

  /// friend | place
  final String kind;
  final double lat;
  final double lng;
  final String? avatar;

  /// Nhãn dưới avatar ở bản đồ luồng live pin, ví dụ "Sarah · 120m".
  final String? label;

  /// coffee | bag | soccer | fire | basketball
  final String? icon;

  /// coral | navy
  final String color;

  /// shop | event
  final String? targetType;
  final String? targetId;
  final bool isNew;

  factory MapMarker.fromJson(Map<String, dynamic> j) => MapMarker(
        id: j['id'].toString(),
        kind: j['kind'] ?? 'place',
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
        avatar: j['avatar'],
        label: j['label'],
        icon: j['icon'],
        color: j['color'] ?? 'navy',
        targetType: j['target_type'],
        targetId: j['target_id']?.toString(),
        isNew: j['is_new'] == true,
      );
}
