import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../../features/auth/model/user_model.dart';
import '../../features/chat/model/conversation_model.dart';
import '../../features/events/model/event_model.dart';
import '../../features/feed/model/post_model.dart';
import '../../features/map/model/map_data.dart';
import '../../features/notifications/model/notification_model.dart';
import '../../features/privacy/model/privacy_settings.dart';
import '../../features/shops/model/shop_model.dart';

/// Dữ liệu mẫu đúng như thiết kế Figma, cùng định dạng JSON với API (bản sao của
/// zenzy_backend/seed/seed-data.json). Hiển thị ngay khi mở màn hình và khi không có mạng.
class SampleData {
  SampleData._(this._json);
  final Map<String, dynamic> _json;

  static late SampleData instance;

  static Future<void> load() async {
    final text = await rootBundle.loadString('assets/sample/seed-data.json');
    instance = SampleData._(Map<String, dynamic>.from(jsonDecode(text)));
  }

  MapData map(String view) => MapData.fromJson(asMap(asMap(_json['map'])[view]));

  /// Vị trí pin mới đăng (Riverside Courts): (lat, lng).
  (double, double) get newPinLocation {
    final j = asMap(_json['new_pin_location']);
    return ((j['lat'] as num).toDouble(), (j['lng'] as num).toDouble());
  }

  ShopModel get shop => ShopModel.fromJson(asList(_json['shops']).first);
  EventModel get event => EventModel.fromJson(asList(_json['events']).first);
  List<PostModel> get posts => [for (final p in asList(_json['posts'])) PostModel.fromJson(p)];
  List<ConversationModel> get conversations => [for (final c in asList(_json['conversations'])) ConversationModel.fromJson(c)];
  ConversationModel conversation(String id) =>
      conversations.firstWhere((c) => c.id == id, orElse: () => conversations.first);
  List<NotificationModel> get notifications => [for (final n in asList(_json['notifications'])) NotificationModel.fromJson(n)];
  ProfileModel get profile => ProfileModel.fromJson(asMap(_json['profile']));
  PrivacySettings get privacy => PrivacySettings.fromJson(asMap(_json['privacy']));
}
