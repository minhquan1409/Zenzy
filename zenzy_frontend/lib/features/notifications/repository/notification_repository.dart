import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../map/model/map_data.dart' show asList;
import '../model/notification_model.dart';

class NotificationRepository {
  NotificationRepository(this._api);
  final ApiClient _api;

  Future<List<NotificationModel>> fetch() async =>
      [for (final n in asList(await _api.get(ApiEndpoints.notifications))) NotificationModel.fromJson(n)];
}
