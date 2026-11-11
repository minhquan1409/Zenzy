import '../../map/model/map_data.dart' show asList;
import 'participant_model.dart';

class EventModel {
  EventModel({
    required this.id,
    required this.title,
    required this.description,
    this.cover = 's09_soccer',
    this.badge = '',
    this.dateText = '',
    this.timeText = '',
    this.priceText = '',
    this.place = '',
    this.address = '',
    this.organizerName = '',
    this.organizerInitials = '',
    this.conversationId,
    this.participantsCount = 0,
    this.capacity = 0,
    this.friendsText = '',
    this.participants = const [],
    this.joined = false,
  });

  final String id;
  final String title;
  final String description;
  final String cover;
  final String badge;
  final String dateText;
  final String timeText;
  final String priceText;
  final String place;
  final String address;
  final String organizerName;
  final String organizerInitials;
  final String? conversationId;
  final int participantsCount;
  final int capacity;
  final String friendsText;

  String get goingText => '$participantsCount going · ${capacity - participantsCount} spots left';
  String get extraCountText => '+${participantsCount - participants.length}';
  final List<ParticipantModel> participants;
  final bool joined;

  factory EventModel.fromJson(Map<String, dynamic> j) => EventModel(
        id: j['id'].toString(),
        title: j['title'] ?? '',
        description: j['description'] ?? '',
        cover: j['cover'] ?? 's09_soccer',
        badge: j['badge'] ?? '',
        dateText: j['date_text'] ?? '',
        timeText: j['time_text'] ?? '',
        priceText: j['price_text'] ?? '',
        place: j['place'] ?? '',
        address: j['address'] ?? '',
        organizerName: j['organizer_name'] ?? '',
        organizerInitials: j['organizer_initials'] ?? '',
        conversationId: j['conversation_id']?.toString(),
        participantsCount: (j['participants_count'] as num?)?.toInt() ?? 0,
        capacity: (j['capacity'] as num?)?.toInt() ?? 0,
        friendsText: j['friends_text'] ?? '',
        participants: [for (final p in asList(j['participants'])) ParticipantModel.fromJson(p)],
        joined: j['joined'] == true,
      );
}
