import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../../chat/view/conversations_screen.dart' show SubTabs, softShadow;
import '../model/post_model.dart';
import '../repository/post_repository.dart';

const _bg = Color(0xFFF7F8FC);
const _blush = Color(0xFFFFECEC);

class _PostCard extends StatelessWidget {
  const _PostCard(this.p);
  final PostModel p;

  @override
  Widget build(BuildContext context) {
    final isEvent = p.kind == 'event';
    return Bx(
      w: double.infinity,
      r: 16,
      bg: Z.white,
      border: isEvent ? _blush : null,
      shadow: isEvent ? zShadow(alpha(Z.coral, 0.07), 10, 6) : zShadow(softShadow, 4, 2),
      pad: const EdgeInsets.all(16),
      child: Col([
        Rw([
          Rw([
            Img(p.authorAvatar, w: 40, h: 40),
            Col([
              T(p.authorName, 14, Z.navy, w: bold),
              Rw([T(p.timeText, 11, Z.purple), const Svg('s10/dot'), T(p.place, 11, Z.coral, w: medium)], gap: 6),
            ], gap: 2),
          ], gap: 10),
          const Svg('s10/ellipsis'),
        ], fill: true, main: MainAxisAlignment.spaceBetween),
        if (isEvent) ...[
          const Bx(
            r: 8,
            bg: _blush,
            pad: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Rw([Svg('s10/calendar'), T('UPCOMING EVENT', 11, Z.coral, w: bold)], gap: 4),
          ),
          T(p.text, 14, Z.navy, w: semiBold),
          Bx(
            w: double.infinity,
            r: 10,
            bg: _bg,
            pad: const EdgeInsets.all(12),
            child: Col([
              Rw([const Svg('s10/clock'), T(p.eventWhen, 12, Z.purple)], gap: 8),
              Rw([const Svg('s10/map_pin'), T(p.eventWhere, 12, Z.purple)], gap: 8),
            ], gap: 8),
          ),
        ] else ...[
          T(p.text, 14, Z.navy, lh: 20 / 14),
          if (p.kind == 'video')
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                width: double.infinity,
                height: 220,
                child: Stack(alignment: Alignment.center, fit: StackFit.expand, children: [
                  Img(p.image ?? ''),
                  Center(
                    child: Bx(
                      w: 48,
                      h: 48,
                      circle: true,
                      bg: Z.white,
                      shadow: zShadow(const Color(0x0F000000), 4, 4),
                      align: Alignment.center,
                      child: const Svg('s10/play'),
                    ),
                  ),
                  const Align(
                    alignment: Alignment.bottomRight,
                    child: Bx(
                      margin: EdgeInsets.all(12),
                      w: 32,
                      h: 32,
                      circle: true,
                      bg: Z.navy,
                      align: Alignment.center,
                      child: Svg('s10/audio_waveform'),
                    ),
                  ),
                ]),
              ),
            )
          else if (p.image != null)
            Img(p.image!, w: double.infinity, h: 200, r: 12),
        ],
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Rw([
            Rw([
              Rw([const Svg('s10/heart_off'), T('${p.likes}', 13, Z.purple, w: medium)], gap: 6),
              Rw([const Svg('s10/message_circle'), T('${p.comments}', 13, Z.purple, w: medium)], gap: 6),
              const Svg('s10/send_horizontal'),
            ], gap: 16),
            const Svg('s10/bookmark'),
          ], fill: true, main: MainAxisAlignment.spaceBetween),
        ),
      ], gap: 12, fill: true),
    );
  }
}

/// 10 · Newsfeed
class FeedScreen extends StatelessWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: _bg,
      child: Col([
        Scroll(
          child: Col([
            const StatusBarSpace(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Rw([
                const Rw([Svg('s10/logo_dot'), T('zenzy', 22, Z.navy, w: extraBold)], gap: 8),
                Bx(
                  w: 40,
                  h: 40,
                  circle: true,
                  bg: Z.white,
                  onTap: () => context.push(Routes.notifications),
                  child: const Stack(alignment: Alignment.center, children: [
                    Svg('s10/bell'),
                    Positioned(right: 10, top: 10, child: Svg('s10/unread_dot')),
                  ]),
                ),
              ], fill: true, main: MainAxisAlignment.spaceBetween),
            ),
            const SubTabs(['For You', null, 'Nearby']),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Loader<List<PostModel>>(
                load: context.read<PostRepository>().fetchFeed,
                initial: SampleData.instance.posts,
                builder: (context, vm) => Col([for (final p in vm.data) _PostCard(p)], gap: 16, fill: true),
              ),
            ),
          ], fill: true),
        ),
        const ZenzyBottomNav(ZTab.feed),
      ], max: true, fill: true),
    );
  }
}
