class MessageModel {
  MessageModel({
    required this.id,
    this.kind = 'text',
    required this.mine,
    this.text = '',
    required this.timeText,
    this.seen = false,
    this.placeName = '',
    this.placeSub = '',
  });

  final String id;

  /// text | place
  final String kind;
  final bool mine;
  final String text;
  final String timeText;
  final bool seen;
  final String placeName;
  final String placeSub;

  factory MessageModel.fromJson(Map<String, dynamic> j) => MessageModel(
        id: j['id'].toString(),
        kind: j['kind'] ?? 'text',
        mine: j['mine'] == true,
        text: j['text'] ?? '',
        timeText: j['time_text'] ?? '',
        seen: j['seen'] == true,
        placeName: j['place_name'] ?? '',
        placeSub: j['place_sub'] ?? '',
      );
}
