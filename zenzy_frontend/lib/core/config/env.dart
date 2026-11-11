/// Cấu hình phía client. Đổi địa chỉ API khi build:
/// `flutter run --dart-define=API_BASE_URL=https://api.ten-mien-cua-ban.com/v1`
class Env {
  /// Mặc định trỏ về máy host khi chạy trên Android emulator.
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:8787/v1');

  /// Tâm bản đồ mặc định: Thảo Điền, TP.HCM.
  static const homeLat = 10.8035;
  static const homeLng = 106.7350;
  static const homeZoom = 15.2;
  static const locateZoom = 16.0;
  static const mapStyle = 'https://tiles.openfreemap.org/styles/positron';
}
