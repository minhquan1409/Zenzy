/// Đường dẫn của 25 màn hình. Mở thẳng một màn khi debug:
/// `flutter run --route /shop/zenzy-coffee` hoặc
/// `adb shell am start -n com.zenzy.zenzy_frontend/.MainActivity --es route /feed`.
class Routes {
  static const splash = '/';
  static const login = '/login';
  static const register = '/register';
  static const home = '/home';
  static const nearbyLoading = '/nearby/loading';
  static const nearbyGhost = '/nearby/ghost';
  static const nearbyError = '/nearby/error';
  static const privacy = '/privacy';
  static const feed = '/feed';
  static const messages = '/messages';
  static const messagesEmpty = '/messages/empty';
  static const notifications = '/notifications';
  static const profile = '/profile';
  static const createShop = '/shop-create';
  static const myShop = '/my-shop';
  static const createPin = '/create-pin';

  /// Bản đồ luồng live pin: map | create | pin | loading | lost.
  static const liveMap = '/live/map';
  static const liveCreate = '/live/create';
  static const livePin = '/live/pin';
  static const liveLoading = '/live/loading';
  static const liveLost = '/live/lost';

  static const defaultShopId = 'zenzy-coffee';
  static const defaultEventId = 'weekly-soccer-run';
  static const defaultConversationId = 'zoe';

  static String shop([String? id]) => '/shop/${id ?? defaultShopId}';
  static String event([String? id]) => '/event/${id ?? defaultEventId}';
  static String conversation([String? id]) => '/conversation/${id ?? defaultConversationId}';
}
