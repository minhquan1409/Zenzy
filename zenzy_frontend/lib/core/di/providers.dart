import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

import '../../features/auth/repository/auth_repository.dart';
import '../../features/chat/repository/chat_repository.dart';
import '../../features/events/repository/event_repository.dart';
import '../../features/feed/repository/post_repository.dart';
import '../../features/map/repository/map_repository.dart';
import '../../features/notifications/repository/notification_repository.dart';
import '../../features/privacy/repository/privacy_repository.dart';
import '../../features/shops/repository/shop_repository.dart';
import '../../services/secure_storage_service.dart';
import '../network/api_client.dart';

/// Dependency Injection: một ApiClient dùng chung, mỗi tính năng một repository.
List<SingleChildWidget> buildProviders() {
  final storage = SecureStorageService();
  final api = ApiClient(storage);
  return [
    Provider<ApiClient>.value(value: api),
    Provider(create: (_) => AuthRepository(api, storage)),
    Provider(create: (_) => MapRepository(api)),
    Provider(create: (_) => ShopRepository(api)),
    Provider(create: (_) => EventRepository(api)),
    Provider(create: (_) => PostRepository(api)),
    Provider(create: (_) => ChatRepository(api)),
    Provider(create: (_) => NotificationRepository(api)),
    Provider(create: (_) => PrivacyRepository(api)),
  ];
}
