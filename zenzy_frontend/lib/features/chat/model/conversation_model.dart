import '../../map/model/map_data.dart' show asList;
import 'message_model.dart';

class ConversationModel {
  ConversationModel({
    required this.id,
    required this.name,
    required this.avatar,
    String? detailAvatar,
    this.timeText = '',
    this.preview = '',
    this.unread = false,
    this.status = '',
    this.messages = const [],
  }) : detailAvatar = detailAvatar ?? avatar;

  final String id;
  final String name;
  final String avatar;

  /// Avatar ở header màn Conversation.
  final String detailAvatar;
  final String timeText;
  final String preview;
  final bool unread;
  final String status;
  final List<MessageModel> messages;

  String get firstName => name.split(' ').first;

  ConversationModel withMessages(List<MessageModel> list) => ConversationModel(
      id: id, name: name, avatar: avatar, detailAvatar: detailAvatar, timeText: timeText, preview: preview, unread: unread, status: status, messages: list);

  factory ConversationModel.fromJson(Map<String, dynamic> j) => ConversationModel(
        id: j['id'].toString(),
        name: j['name'] ?? '',
        avatar: j['avatar'] ?? '',
        detailAvatar: j['detail_avatar'],
        timeText: j['time_text'] ?? '',
        preview: j['preview'] ?? '',
        unread: j['unread'] == true,
        status: j['status'] ?? '',
        messages: [for (final m in asList(j['messages'])) MessageModel.fromJson(m)],
      );
}
