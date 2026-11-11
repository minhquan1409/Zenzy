import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/view/login_screen.dart';
import '../../features/auth/view/register_screen.dart';
import '../../features/auth/view/splash_screen.dart';
import '../../features/chat/view/chat_room_screen.dart';
import '../../features/chat/view/conversations_screen.dart';
import '../../features/events/view/event_detail_screen.dart';
import '../../features/feed/view/feed_screen.dart';
import '../../features/map/model/map_data.dart';
import '../../features/map/view/create_live_pin_screen.dart';
import '../../features/map/view/live_map_screen.dart';
import '../../features/map/view/map_screen.dart';
import '../../features/map/view/nearby_screen.dart';
import '../../features/notifications/view/notifications_screen.dart';
import '../../features/privacy/view/privacy_settings_screen.dart';
import '../../features/profile/view/profile_screen.dart';
import '../../features/shops/view/create_shop_screen.dart';
import '../../features/shops/view/my_shop_screen.dart';
import '../../features/shops/view/shop_detail_screen.dart';
import 'route_names.dart';

/// Màn mở đầu khi debug: `--dart-define=START_ROUTE=/feed` (hoặc `flutter run --route /feed`).
const _startRoute = String.fromEnvironment('START_ROUTE', defaultValue: Routes.splash);

GoRoute _route(String path, Widget Function(GoRouterState state) build) => GoRoute(
      path: path,
      pageBuilder: (context, state) => CustomTransitionPage(
        key: state.pageKey,
        child: build(state),
        transitionDuration: const Duration(milliseconds: 160),
        reverseTransitionDuration: const Duration(milliseconds: 120),
        transitionsBuilder: (context, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );

const _liveStates = {
  'map': LiveMapState.explore,
  'create': LiveMapState.create,
  'pin': LiveMapState.pinLive,
  'loading': LiveMapState.loading,
  'lost': LiveMapState.connectionLost,
};

/// Điều hướng giữa 25 màn hình.
GoRouter buildRouter() => GoRouter(
      initialLocation: _startRoute,
      routes: [
        _route(Routes.splash, (_) => const SplashScreen()),
        _route(Routes.login, (_) => const LoginScreen()),
        _route(Routes.register, (_) => const RegisterScreen()),
        _route(Routes.home, (_) => const MapScreen()),
        _route(Routes.nearbyLoading, (_) => const NearbyScreen(NearbyState.loading)),
        _route(Routes.nearbyGhost, (_) => const NearbyScreen(NearbyState.ghost)),
        _route(Routes.nearbyError, (_) => const NearbyScreen(NearbyState.error)),
        _route(Routes.privacy, (_) => const PrivacySettingsScreen()),
        _route('/shop/:id', (s) => ShopDetailScreen(id: s.pathParameters['id']!)),
        _route('/event/:id', (s) => EventDetailScreen(id: s.pathParameters['id']!)),
        _route(Routes.feed, (_) => const FeedScreen()),
        _route(Routes.messages, (_) => const ConversationsScreen()),
        _route(Routes.messagesEmpty, (_) => const MessagesEmptyScreen()),
        _route('/conversation/:id', (s) => ChatRoomScreen(id: s.pathParameters['id']!)),
        _route(Routes.notifications, (_) => const NotificationsScreen()),
        _route(Routes.profile, (_) => const ProfileScreen()),
        _route(Routes.createShop, (_) => const CreateShopScreen()),
        _route(Routes.myShop, (_) => const MyShopScreen()),
        _route(Routes.createPin, (_) => const CreateLivePinScreen()),
        _route(
          '/live/:state',
          (s) => LiveMapScreen(
            key: ValueKey(s.pathParameters['state']),
            initial: _liveStates[s.pathParameters['state']] ?? LiveMapState.explore,
            pin: s.extra is LivePin ? s.extra as LivePin : null,
          ),
        ),
      ],
    );
