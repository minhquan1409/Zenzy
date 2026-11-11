import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/constants/storage_keys.dart';

/// Tier 1: lưu JWT. Có cache trong bộ nhớ để không đọc đĩa ở mỗi request.
class SecureStorageService {
  final _storage = const FlutterSecureStorage();
  String? _token;
  bool _loaded = false;

  Future<String?> readToken() async {
    if (!_loaded) {
      try {
        _token = await _storage.read(key: StorageKeys.accessToken);
      } catch (_) {
        _token = null;
      }
      _loaded = true;
    }
    return _token;
  }

  Future<void> writeToken(String? token) async {
    _token = token;
    _loaded = true;
    try {
      if (token == null) {
        await _storage.delete(key: StorageKeys.accessToken);
      } else {
        await _storage.write(key: StorageKeys.accessToken, value: token);
      }
    } catch (_) {}
  }
}
