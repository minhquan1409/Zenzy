import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../map/model/map_data.dart' show asMap;
import '../model/event_model.dart';

class EventRepository {
  EventRepository(this._api);
  final ApiClient _api;

  Future<EventModel> fetchEvent(String id) async => EventModel.fromJson(asMap(await _api.get(ApiEndpoints.event(id))));

  /// RSVP (cần đăng nhập). Trả về sự kiện sau khi tham gia.
  Future<EventModel> join(String id) async => EventModel.fromJson(asMap(await _api.post(ApiEndpoints.joinEvent(id))));
}
