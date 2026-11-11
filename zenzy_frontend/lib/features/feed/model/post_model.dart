class PostModel {
  PostModel({
    required this.id,
    required this.authorName,
    required this.authorAvatar,
    required this.timeText,
    required this.place,
    this.kind = 'photo',
    this.text = '',
    this.image,
    this.likes = 0,
    this.comments = 0,
    this.eventWhen = '',
    this.eventWhere = '',
  });

  final String id;
  final String authorName;
  final String authorAvatar;
  final String timeText;
  final String place;

  /// photo | video | event
  final String kind;
  final String text;
  final String? image;
  final int likes;
  final int comments;
  final String eventWhen;
  final String eventWhere;

  factory PostModel.fromJson(Map<String, dynamic> j) => PostModel(
        id: j['id'].toString(),
        authorName: j['author_name'] ?? '',
        authorAvatar: j['author_avatar'] ?? '',
        timeText: j['time_text'] ?? '',
        place: j['place'] ?? '',
        kind: j['kind'] ?? 'photo',
        text: j['text'] ?? '',
        image: j['image'],
        likes: (j['likes'] as num?)?.toInt() ?? 0,
        comments: (j['comments'] as num?)?.toInt() ?? 0,
        eventWhen: j['event_when'] ?? '',
        eventWhere: j['event_where'] ?? '',
      );
}
