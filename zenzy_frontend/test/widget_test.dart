import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zenzy_frontend/features/chat/model/conversation_model.dart';
import 'package:zenzy_frontend/features/events/model/event_model.dart';
import 'package:zenzy_frontend/features/map/model/map_data.dart';
import 'package:zenzy_frontend/features/shops/model/shop_model.dart';

void main() {
  final json = Map<String, dynamic>.from(jsonDecode(File('assets/sample/seed-data.json').readAsStringSync()));

  test('sample data matches the copy in zenzy_backend/seed', () {
    final backend = File('../zenzy_backend/seed/seed-data.json');
    if (backend.existsSync()) {
      expect(File('assets/sample/seed-data.json').readAsStringSync(), backend.readAsStringSync());
    }
  });

  test('sample data parses into models', () {
    final map = MapData.fromJson(asMap(asMap(json['map'])['main']));
    expect(map.pins, hasLength(5));
    expect(map.activity.eventId, 'weekly-soccer-run');

    final shop = ShopModel.fromJson(asList(json['shops']).first);
    expect(shop.menu.first.salePrice, '29,000');

    final event = EventModel.fromJson(asList(json['events']).first);
    expect(event.goingText, '8 going · 4 spots left');
    expect(event.extraCountText, '+5');

    final zoe = ConversationModel.fromJson(asList(json['conversations']).first);
    expect(zoe.messages, hasLength(6));
    expect(zoe.detailAvatar, 'conv_avatar_zoe');
  });
}
