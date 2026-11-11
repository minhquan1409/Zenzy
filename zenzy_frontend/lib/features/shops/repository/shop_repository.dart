import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../map/model/map_data.dart' show asMap;
import '../model/menu_item_model.dart';
import '../model/shop_model.dart';

class ShopRepository {
  ShopRepository(this._api);
  final ApiClient _api;

  Future<ShopModel> fetchShop(String id) async => ShopModel.fromJson(asMap(await _api.get(ApiEndpoints.shop(id))));

  /// Cửa hàng của người dùng hiện tại (khách xem cửa hàng mẫu).
  Future<ShopModel> fetchMyShop() async => ShopModel.fromJson(asMap(await _api.get(ApiEndpoints.myShop)));

  /// Tạo hoặc cập nhật cửa hàng của tôi (cần đăng nhập).
  Future<ShopModel> saveShop({
    required String name,
    required String address,
    required String opening,
    required String closing,
    required List<MenuItemModel> menu,
  }) async {
    final json = await _api.post(ApiEndpoints.shops, {
      'name': name,
      'address': address,
      'opening': opening,
      'closing': closing,
      'menu': [for (final m in menu) m.toJson()],
    });
    return ShopModel.fromJson(asMap(json));
  }
}
