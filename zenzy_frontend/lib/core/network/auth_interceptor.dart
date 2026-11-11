import 'package:dio/dio.dart';

import '../../services/secure_storage_service.dart';

/// Tự động đính kèm Bearer JWT (nếu đã đăng nhập) vào mọi request.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._storage);
  final SecureStorageService _storage;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _storage.readToken();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }
}
