import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/error/app_exception.dart';
import '../../../core/router/route_names.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../../../core/widgets/toast.dart';
import '../../shops/view/shop_detail_screen.dart' show BannerBadge, RoundIconButton;
import '../model/event_model.dart';
import '../repository/event_repository.dart';

const _lilac = Color(0xFFEEEAFB);
const _mint = Color(0xFFE4F1EA);
const _peach = Color(0xFFFFF0E4);

/// Màu nền / chữ của avatar chữ cái theo tông do API trả về.
(Color, Color) toneColors(String tone) => switch (tone) {
      'mint' => (_mint, Z.secondary),
      'peach' => (_peach, Z.secondary),
      _ => (_lilac, Z.purple),
    };

class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar(this.text, this.bg, this.fg, this.size, this.fontSize, {super.key, this.ring = true});
  final String text;
  final Color bg;
  final Color fg;
  final double size;
  final double fontSize;
  final bool ring;
  @override
  Widget build(BuildContext context) => Bx(
        w: size,
        h: size,
        circle: true,
        bg: bg,
        border: ring ? Z.white : null,
        bw: 2,
        align: Alignment.center,
        child: T(text, fontSize, fg, w: semiBold),
      );
}

/// 09 · Event & RSVP
class EventDetailScreen extends StatelessWidget {
  const EventDetailScreen({super.key, required this.id});
  final String id;

  Future<void> _join(BuildContext context, LoadViewModel<EventModel> vm) async {
    try {
      vm.update(await context.read<EventRepository>().join(id));
      if (context.mounted) showToast(context, "You're in! See you there.");
    } on AppException catch (e) {
      // Khách / mất mạng: giữ luồng của bản thiết kế (quay lại bản đồ).
      if (!context.mounted) return;
      if (!e.isNetwork && e.statusCode != 401) showToast(context, e.message);
      goBack(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: Z.canvas,
      child: Loader<EventModel>(
        load: () => context.read<EventRepository>().fetchEvent(id),
        initial: SampleData.instance.event,
        builder: (context, vm) {
          final e = vm.data;
          return Col([
            const StatusBarSpace(),
            Scroll(
              child: Col([
                SizedBox(
                  height: 148,
                  width: double.infinity,
                  child: Stack(clipBehavior: Clip.hardEdge, children: [
                    Positioned.fill(child: Img(e.cover)),
                    Positioned(left: 24, top: 16, child: RoundIconButton('s09/back', onTap: () => goBack(context))),
                    const Positioned(left: 344, top: 16, child: RoundIconButton('s09/bookmark')),
                    Positioned(left: 24, top: 112, child: BannerBadge('s09/circle_x', e.badge)),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 12),
                  child: Col([
                    Col([
                      T(e.title, 24, Z.navy, w: bold, lh: 1.18, ls: -0.8),
                      T(e.description, 11, Z.secondary, lh: 1.45),
                    ], gap: 6),
                    // Lịch
                    Bx(
                      w: double.infinity,
                      h: 54,
                      r: 16,
                      bg: Z.lavender,
                      pad: const EdgeInsets.symmetric(horizontal: 12),
                      child: Rw([
                        const Bx(w: 34, h: 34, r: 11, bg: Z.white, align: Alignment.center, child: Svg('s09/calendar_days')),
                        Expanded(
                          child: Col([
                            T(e.dateText, 12, Z.navy, w: semiBold),
                            T(e.timeText, 10, Z.purple),
                          ], gap: 4),
                        ),
                        T(e.priceText, 11, Z.coral, w: semiBold),
                      ], gap: 10, fill: true),
                    ),
                    // Địa điểm
                    Bx(
                      w: double.infinity,
                      r: 16,
                      bg: Z.white,
                      border: Z.line2,
                      shadow: zShadow(const Color(0x0A33275C), 12, 3),
                      clip: true,
                      child: Col([
                        const _MiniMap(),
                        SizedBox(
                          height: 52,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Rw([
                              Expanded(
                                child: Col([
                                  T(e.place, 12, Z.navy, w: semiBold),
                                  T(e.address, 10, Z.secondary),
                                ], gap: 3),
                              ),
                              const Svg('s09/navigation'),
                              const T('Directions', 10, Z.coral, w: semiBold),
                            ], gap: 8, fill: true),
                          ),
                        ),
                      ], fill: true),
                    ),
                    // Người tổ chức
                    SizedBox(
                      height: 52,
                      child: Rw([
                        InitialsAvatar(e.organizerInitials, Z.lavender, Z.purple, 40, 13),
                        Expanded(
                          child: Col([
                            const T('Organized by', 10, Z.secondary),
                            T(e.organizerName, 13, Z.navy, w: semiBold),
                          ], gap: 3),
                        ),
                        Bx(
                          h: 32,
                          r: 16,
                          bg: Z.white,
                          border: Z.line2,
                          pad: const EdgeInsets.symmetric(horizontal: 12),
                          onTap: () => context.push(Routes.conversation(e.conversationId)),
                          child: const Rw([Svg('s09/message_circle'), T('Message', 10, Z.coral, w: semiBold)], gap: 6),
                        ),
                      ], gap: 10, fill: true),
                    ),
                    // Người tham gia
                    Col([
                      Rw([
                        T('Participants · ${e.participantsCount}', 16, Z.navy, w: semiBold, ls: -0.3),
                        const T('View all', 11, Z.coral, w: semiBold),
                      ], fill: true, main: MainAxisAlignment.spaceBetween),
                      SizedBox(
                        height: 32,
                        child: Rw([
                          SizedBox(
                            width: 32.0 + 23 * e.participants.length,
                            height: 32,
                            child: Stack(children: [
                              for (final (i, p) in e.participants.indexed)
                                Positioned(
                                  left: 23.0 * i,
                                  child: InitialsAvatar(p.initials, toneColors(p.tone).$1, toneColors(p.tone).$2, 32, 10),
                                ),
                              Positioned(
                                left: 23.0 * e.participants.length,
                                child: InitialsAvatar(e.extraCountText, _lilac, Z.purple, 32, 10),
                              ),
                            ]),
                          ),
                          Expanded(
                            child: Col([
                              T(e.goingText, 11, Z.navy, w: semiBold),
                              T(e.friendsText, 10, Z.secondary),
                            ], gap: 3),
                          ),
                        ], gap: 10, fill: true),
                      ),
                      Bx(
                        w: double.infinity,
                        r: 16,
                        bg: Z.white,
                        border: Z.line2,
                        pad: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                        child: Col([
                          for (final (i, p) in e.participants.indexed) ...[
                            SizedBox(
                              height: 38,
                              child: Rw([
                                InitialsAvatar(p.initials, toneColors(p.tone).$1, toneColors(p.tone).$2, 28, 10),
                                Expanded(
                                  child: Col([
                                    T(p.name, 11, Z.navy, w: semiBold),
                                    T(p.sub, 9, Z.secondary),
                                  ], gap: 2),
                                ),
                                const Svg('s09/check'),
                              ], gap: 9, fill: true),
                            ),
                            if (i < e.participants.length - 1) const HLine(Z.line2),
                          ],
                        ], fill: true),
                      ),
                    ], gap: 8, fill: true),
                  ], gap: 12, fill: true),
                ),
              ], fill: true),
            ),
            // Khu vực RSVP
            ColoredBox(
              color: Z.white,
              child: Col([
                const HLine(Z.line2),
                Bx(
                  margin: const EdgeInsets.fromLTRB(24, 10, 24, 0),
                  w: double.infinity,
                  h: 50,
                  r: 16,
                  bg: Z.coral,
                  opacity: e.joined ? 0.6 : 1,
                  onTap: e.joined ? () => goBack(context) : () => _join(context, vm),
                  child: Rw([
                    const Svg('s09/calendar_plus'),
                    T(e.joined ? "You're going" : 'Join Event / RSVP', 14, Z.white, w: semiBold),
                  ], gap: 9, fill: true, main: MainAxisAlignment.center),
                ),
                const NavBarSpace(top: 10),
              ], fill: true),
            ),
          ], max: true, fill: true);
        },
      ),
    );
  }
}

/// Bản đồ thu nhỏ minh hoạ trong thẻ địa điểm (354 × 76).
class _MiniMap extends StatelessWidget {
  const _MiniMap();
  @override
  Widget build(BuildContext context) => const SizedBox(
        width: 354,
        height: 76,
        child: ColoredBox(
          color: Color(0xFFF0F2F4),
          child: Stack(clipBehavior: Clip.hardEdge, children: [
            Positioned(left: 95, top: 5, child: Bx(w: 122, h: 65, r: 22, bg: Color(0xFFDDEBDD))),
            Positioned(left: 270, top: 0, child: Svg('s09/river')),
            Positioned(left: 62.45, top: 7, child: Svg('s09/streets')),
            Positioned(left: 140, top: 23, child: Bx(w: 55, h: 34, r: 3, bg: Color(0xFFB7D1BC), border: Z.white)),
            Positioned(left: 167, top: 24, child: Bx(w: 1, h: 32, bg: Z.white)),
            Positioned(left: 159, top: 32, child: Svg('s09/center_circle')),
            Positioned(left: 8, top: 40, child: T('Nguyễn Văn Hưởng', 8, Z.secondary)),
            Positioned(left: 285, top: 54, child: T('Sài Gòn River', 8, Z.purple)),
            Positioned(
              left: 194,
              top: 12,
              child: Bx(w: 31, h: 31, circle: true, bg: Z.purple, border: Z.white, bw: 3, align: Alignment.center, child: Svg('s09/map_pin')),
            ),
            Positioned(
              left: 302,
              top: 10,
              child: Bx(w: 30, h: 30, circle: true, bg: Z.white, align: Alignment.center, child: Svg('s09/expand')),
            ),
          ]),
        ),
      );
}
