import 'package:dio/dio.dart';

import '../../services/secure_storage_service.dart';
import '../config/env.dart';
import '../error/app_exception.dart';
import 'auth_interceptor.dart';

/// HTTP client dùng chung. Mọi repository gọi API qua lớp này.
class ApiClient {
  ApiClient(SecureStorageService storage, {Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: Env.apiBaseUrl,
              connectTimeout: const Duration(seconds: 4),
              receiveTimeout: const Duration(seconds: 8),
              sendTimeout: const Duration(seconds: 8),
              headers: {'Accept': 'application/json'},
            )) {
    _dio.interceptors.add(AuthInterceptor(storage));
  }

  final Dio _dio;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) => _run(() => _dio.get(path, queryParameters: query));
  Future<dynamic> post(String path, [Object? body]) => _run(() => _dio.post(path, data: body));
  Future<dynamic> put(String path, [Object? body]) => _run(() => _dio.put(path, data: body));

  Future<dynamic> _run(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      return res.data;
    } on DioException catch (e) {
      final data = e.response?.data;
      final message = data is Map && data['message'] != null ? data['message'].toString() : null;
      throw AppException(message ?? 'Không kết nối được máy chủ', statusCode: e.response?.statusCode);
    }
  }
}
