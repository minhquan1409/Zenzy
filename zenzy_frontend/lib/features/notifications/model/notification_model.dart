class NotificationModel {
  NotificationModel({
    required this.id,
    required this.section,
    required this.icon,
    required this.badgeColor,
    required this.lead,
    required this.bold,
    required this.timeText,
    this.unread = false,
  });

  final String id;

  /// "TODAY", "THIS WEEK"…
  final String section;

  /// message_circle | calendar | map_pin | ticket | heart_off
  final String icon;

  /// Màu nền huy hiệu dạng "#RRGGBB".
  final String badgeColor;
  final String lead;
  final String bold;
  final String timeText;
  final bool unread;

  factory NotificationModel.fromJson(Map<String, dynamic> j) => NotificationModel(
        id: j['id'].toString(),
        section: j['section'] ?? '',
        icon: j['icon'] ?? 'message_circle',
        badgeColor: j['badge_color'] ?? '#FFECEC',
        lead: j['lead'] ?? '',
        bold: j['bold'] ?? '',
        timeText: j['time_text'] ?? '',
        unread: j['unread'] == true,
      );
}
