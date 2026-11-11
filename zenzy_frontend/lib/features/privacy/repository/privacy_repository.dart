import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../map/model/map_data.dart' show asMap;
import '../model/privacy_settings.dart';

class PrivacyRepository {
  PrivacyRepository(this._api);
  final ApiClient _api;

  Future<PrivacySettings> fetch() async => PrivacySettings.fromJson(asMap(await _api.get(ApiEndpoints.privacy)));

  /// Lưu cài đặt (cần đăng nhập).
  Future<PrivacySettings> save(PrivacySettings settings) async =>
      PrivacySettings.fromJson(asMap(await _api.put(ApiEndpoints.privacy, settings.toJson())));
}
