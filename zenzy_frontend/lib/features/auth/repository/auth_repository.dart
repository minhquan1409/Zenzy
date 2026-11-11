import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../../services/secure_storage_service.dart';
import '../../map/model/map_data.dart' show asMap;
import '../model/user_model.dart';

/// Đăng ký, đăng nhập và hồ sơ của người dùng hiện tại.
class AuthRepository {
  AuthRepository(this._api, this._storage);
  final ApiClient _api;
  final SecureStorageService _storage;

  Future<bool> get isLoggedIn async => (await _storage.readToken()) != null;

  Future<UserModel> login({required String email, required String password}) async {
    final json = await _api.post(ApiEndpoints.login, {'email': email, 'password': password});
    return _save(json);
  }

  Future<UserModel> register({
    required String fullName,
    required String email,
    required String password,
    String? dateOfBirth,
  }) async {
    final json = await _api.post(ApiEndpoints.register, {
      'full_name': fullName,
      'email': email,
      'password': password,
      if (dateOfBirth != null && dateOfBirth.isNotEmpty) 'date_of_birth': dateOfBirth,
    });
    return _save(json);
  }

  Future<void> logout() => _storage.writeToken(null);

  Future<ProfileModel> fetchProfile() async => ProfileModel.fromJson(asMap(await _api.get(ApiEndpoints.profile)));

  Future<UserModel> _save(dynamic json) async {
    final tokens = AuthTokens.fromJson(asMap(json));
    await _storage.writeToken(tokens.accessToken);
    return tokens.user;
  }
}
