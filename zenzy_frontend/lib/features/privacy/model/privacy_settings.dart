import '../../events/model/participant_model.dart';
import '../../map/model/map_data.dart' show asList;

class PrivacySettings {
  PrivacySettings({required this.ghostMode, required this.audience, required this.precise, this.excluded = const []});
  final bool ghostMode;

  /// public | friends | private
  final String audience;
  final bool precise;
  final List<ParticipantModel> excluded;

  PrivacySettings copyWith({bool? ghostMode, String? audience, bool? precise}) => PrivacySettings(
        ghostMode: ghostMode ?? this.ghostMode,
        audience: audience ?? this.audience,
        precise: precise ?? this.precise,
        excluded: excluded,
      );

  factory PrivacySettings.fromJson(Map<String, dynamic> j) => PrivacySettings(
        ghostMode: j['ghost_mode'] != false,
        audience: j['audience'] ?? 'friends',
        precise: j['precise'] == true,
        excluded: [for (final p in asList(j['excluded'])) ParticipantModel.fromJson(p)],
      );

  Map<String, dynamic> toJson() => {'ghost_mode': ghostMode, 'audience': audience, 'precise': precise};
}
