/// Lỗi gọi API. [statusCode] null nghĩa là lỗi mạng (không tới được máy chủ).
class AppException implements Exception {
  AppException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
  bool get isNetwork => statusCode == null;
  @override
  String toString() => message;
}
