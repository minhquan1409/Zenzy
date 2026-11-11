class ParticipantModel {
  ParticipantModel({required this.initials, required this.name, required this.sub, this.tone = 'lilac'});
  final String initials;
  final String name;

  /// "@minhanh · Your friend" ở Event, "@minhanh" ở Privacy.
  final String sub;

  /// lilac | mint | peach
  final String tone;

  factory ParticipantModel.fromJson(Map<String, dynamic> j) => ParticipantModel(
        initials: j['initials'] ?? '',
        name: j['name'] ?? '',
        sub: j['sub'] ?? '',
        tone: j['tone'] ?? 'lilac',
      );
}
