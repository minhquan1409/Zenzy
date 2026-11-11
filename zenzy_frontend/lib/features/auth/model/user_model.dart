class UserModel {
  UserModel({required this.id, required this.name, required this.email});
  final String id;
  final String name;
  final String email;

  factory UserModel.fromJson(Map<String, dynamic> j) =>
      UserModel(id: (j['id'] ?? '').toString(), name: j['name'] ?? '', email: j['email'] ?? '');
}

/// Dữ liệu màn Social Profile.
class ProfileModel {
  ProfileModel({
    required this.name,
    required this.bio,
    required this.avatar,
    required this.friendsText,
    required this.eventsText,
    required this.postsText,
    this.photos = const [],
  });
  final String name;
  final String bio;
  final String avatar;
  final String friendsText;
  final String eventsText;
  final String postsText;
  final List<String> photos;

  factory ProfileModel.fromJson(Map<String, dynamic> j) => ProfileModel(
        name: j['name'] ?? '',
        bio: j['bio'] ?? '',
        avatar: j['avatar'] ?? '',
        friendsText: (j['friends_text'] ?? '0').toString(),
        eventsText: (j['events_text'] ?? '0').toString(),
        postsText: (j['posts_text'] ?? '0').toString(),
        photos: [for (final p in (j['photos'] as List? ?? [])) p.toString()],
      );
}

class AuthTokens {
  AuthTokens({required this.accessToken, required this.user});
  final String accessToken;
  final UserModel user;

  factory AuthTokens.fromJson(Map<String, dynamic> j) => AuthTokens(
        accessToken: j['access_token'] ?? '',
        user: UserModel.fromJson(j['user'] is Map ? Map<String, dynamic>.from(j['user']) : {}),
      );
}
