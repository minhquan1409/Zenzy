/// Đường dẫn REST API (tương đối so với Env.apiBaseUrl, đã gồm /v1).
class ApiEndpoints {
  static const register = '/auth/register';
  static const login = '/auth/login';
  static const me = '/me';
  static const profile = '/me/profile';
  static const privacy = '/me/privacy';
  static const myShop = '/me/shop';
  static const mapPins = '/map/pins';
  static const pins = '/pins';
  static const shops = '/shops';
  static const events = '/events';
  static const posts = '/posts';
  static const conversations = '/conversations';
  static const notifications = '/notifications';
  static String shop(String id) => '/shops/$id';
  static String event(String id) => '/events/$id';
  static String joinEvent(String id) => '/events/$id/join';
  static String conversation(String id) => '/conversations/$id';
  static String messages(String id) => '/conversations/$id/messages';
}
