import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../map/model/map_data.dart' show asList, asMap;
import '../model/conversation_model.dart';
import '../model/message_model.dart';

class ChatRepository {
  ChatRepository(this._api);
  final ApiClient _api;

  Future<List<ConversationModel>> fetchConversations() async =>
      [for (final c in asList(await _api.get(ApiEndpoints.conversations))) ConversationModel.fromJson(c)];

  Future<ConversationModel> fetchConversation(String id) async =>
      ConversationModel.fromJson(asMap(await _api.get(ApiEndpoints.conversation(id))));

  /// Gửi tin nhắn (cần đăng nhập).
  Future<MessageModel> send(String conversationId, String text) async =>
      MessageModel.fromJson(asMap(await _api.post(ApiEndpoints.messages(conversationId), {'text': text})));
}
