import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../model/map_data.dart';

/// Pin và thẻ hoạt động trên bản đồ; đăng live pin.
class MapRepository {
  MapRepository(this._api);
  final ApiClient _api;

  /// [view] = "main" (Home Map) hoặc "flow" (bản đồ luồng live pin).
  Future<MapData> fetchMap(String view) async =>
      MapData.fromJson(asMap(await _api.get(ApiEndpoints.mapPins, query: {'view': view})));

  /// Đăng pin lên máy chủ (cần đăng nhập). Trả về pin đã lưu.
  Future<LivePin> createPin({
    required String type,
    required String title,
    required String description,
    required bool everyone,
  }) async {
    final json = await _api.post(ApiEndpoints.pins, {
      'type': type,
      'title': title,
      'description': description,
      'audience': everyone ? 'everyone' : 'close_friends',
    });
    return LivePin.fromJson(asMap(json));
  }
}
