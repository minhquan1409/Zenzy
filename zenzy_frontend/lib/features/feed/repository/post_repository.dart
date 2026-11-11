import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../map/model/map_data.dart' show asList;
import '../model/post_model.dart';

class PostRepository {
  PostRepository(this._api);
  final ApiClient _api;

  Future<List<PostModel>> fetchFeed() async =>
      [for (final p in asList(await _api.get(ApiEndpoints.posts))) PostModel.fromJson(p)];
}
