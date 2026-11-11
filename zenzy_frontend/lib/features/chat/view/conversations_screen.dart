import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../model/conversation_model.dart';
import '../repository/chat_repository.dart';

const softShadow = Color(0x0A000000);

/// Dải tab gạch chân dùng ở Newsfeed và Messages. Phần tử null là tab rỗng trong thiết kế.
class SubTabs extends StatelessWidget {
  const SubTabs(this.tabs, {super.key});
  final List<String?> tabs;

  @override
  Widget build(BuildContext context) => Bx(
        w: double.infinity,
        border: Z.line,
        pad: const EdgeInsets.symmetric(horizontal: 24),
        child: Rw([
          for (final (i, label) in tabs.indexed)
            if (label == null)
              const SizedBox(width: 0, height: 41)
            else if (i == 0)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: IntrinsicWidth(
                  child: Col([
                    T(label, 14, Z.navy, w: bold),
                    const Bx(w: double.infinity, h: 3, r: 1.5, bg: Z.coral),
                  ], gap: 8, cross: CrossAxisAlignment.center),
                ),
              )
            else
              Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: T(label, 14, Z.purple, w: medium)),
        ], gap: 20, cross: CrossAxisAlignment.start, fill: true),
      );
}

class RowDivider extends StatelessWidget {
  const RowDivider({super.key});
  @override
  Widget build(BuildContext context) => const HLine(Z.lavender);
}

class _MessageRow extends StatelessWidget {
  const _MessageRow(this.c, {this.width = double.infinity, this.previewWidth = 220, this.onTap});
  final ConversationModel c;
  final double width;
  final double previewWidth;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Bx(
        w: width,
        r: 16,
        bg: Z.white,
        shadow: zShadow(softShadow, 4, 2),
        pad: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        onTap: onTap,
        child: Rw([
          Img(c.avatar, w: 48, h: 48),
          Expanded(
            child: Col([
              Rw([
                Flexible(child: T(c.name, 15, Z.navy, w: bold, maxLines: 1)),
                T(c.timeText, 11, c.unread ? Z.coral : Z.purple, maxLines: 1),
              ], fill: true, main: MainAxisAlignment.spaceBetween),
              Rw([
                SizedBox(width: previewWidth, child: T(c.preview, 13, c.unread ? Z.navy : Z.purple, maxLines: 1)),
                if (c.unread) const Svg('s11/coral_dot'),
              ], fill: true, main: MainAxisAlignment.spaceBetween),
            ], gap: 4),
          ),
        ], gap: 12, fill: true),
      );
}

/// 11 · Messages
class ConversationsScreen extends StatelessWidget {
  const ConversationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: Z.white,
      child: Col([
        Scroll(
          child: Loader<List<ConversationModel>>(
            load: context.read<ChatRepository>().fetchConversations,
            initial: SampleData.instance.conversations,
            builder: (context, vm) => Col([
              const StatusBarSpace(),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                child: Rw([
                  const T('Messages', 24, Z.navy, w: extraBold),
                  Rw([
                    Bx(onTap: () => context.push(Routes.messagesEmpty), child: const Svg('s11/search')),
                    const Svg('s11/pencil'),
                  ], gap: 12),
                ], fill: true, main: MainAxisAlignment.spaceBetween),
              ),
              const SubTabs(['All', 'Groups', 'Event Chats']),
              for (final (i, c) in vm.data.indexed) ...[
                if (i > 0) const RowDivider(),
                if (i == 1)
                  // Dòng đang vuốt mở, lộ nút tắt tiếng / xoá như trong thiết kế.
                  ClipRect(
                    child: IntrinsicHeight(
                      child: Rw([
                        _MessageRow(c, width: 300, previewWidth: 176, onTap: () => context.push(Routes.conversation(c.id))),
                        const Bx(w: 51, bg: Z.lavender, align: Alignment.center, child: Svg('s11/bell_off')),
                        const Bx(w: 51, bg: Z.coral, align: Alignment.center, child: Svg('s11/trash_2')),
                      ], cross: CrossAxisAlignment.stretch, fill: true),
                    ),
                  )
                else
                  _MessageRow(c, onTap: () => context.push(Routes.conversation(c.id))),
              ],
            ], fill: true),
          ),
        ),
        const ZenzyBottomNav(ZTab.chat),
      ], max: true, fill: true),
    );
  }
}

/// Zenzy · Messages empty
class MessagesEmptyScreen extends StatelessWidget {
  const MessagesEmptyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    Widget navItem(String icon, String label, bool selected, VoidCallback onTap) => Bx(
          w: 66,
          onTap: onTap,
          child: Col([Svg(icon), T(label, 10, selected ? Z.rose : Z.indigo, w: selected ? bold : medium)],
              gap: 4, cross: CrossAxisAlignment.center),
        );

    return Screen(
      bg: Z.white,
      font: rubik,
      child: Col([
        const StatusBarSpace(),
        const SizedBox(
          height: 58,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 24),
            child: Rw([
              T('Messages', 26, Z.ink, w: extraBold, font: gabarito),
              Rw([
                Svg('mempty/search'),
                Bx(w: 24, h: 24, align: Alignment.center, child: Svg('mempty/pencil')),
              ], gap: 14, cross: CrossAxisAlignment.start),
            ], fill: true, main: MainAxisAlignment.spaceBetween),
          ),
        ),
        const SizedBox(
          height: 47,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 24),
            child: Rw([
              Padding(
                padding: EdgeInsets.only(top: 10),
                child: Col([T('All', 14, Z.ink, w: semiBold), Bx(w: 19, h: 3, r: 2, bg: Z.rose)], gap: 9),
              ),
              Padding(padding: EdgeInsets.only(top: 10), child: T('Groups', 14, Z.mist, w: medium)),
              Padding(padding: EdgeInsets.only(top: 10), child: T('Event Chats', 14, Z.mist, w: medium)),
            ], gap: 22, cross: CrossAxisAlignment.start, fill: true),
          ),
        ),
        const HLine(Z.line),
        Expanded(
          child: Stack(clipBehavior: Clip.hardEdge, children: [
            Positioned(
              left: 32,
              top: 129,
              width: 338,
              child: Col([
                const SizedBox(
                  width: 204,
                  height: 160,
                  child: Stack(clipBehavior: Clip.none, children: [
                    Positioned(left: 35, top: 15, child: Svg('mempty/backdrop')),
                    Positioned(left: 59, top: 141, child: Svg('mempty/ground')),
                    Positioned(left: 68, top: 29, child: Svg('mempty/pin_outline')),
                    Positioned(left: 89, top: 51, child: Svg('mempty/pin_center')),
                    Positioned(left: 94, top: 87, child: Svg('mempty/smile')),
                    Positioned(left: 128, top: 21, child: Svg('mempty/cloud')),
                    Positioned(left: 15.25, top: 112, child: Img('mempty_map_trail', w: 56.5, h: 25)),
                    Positioned(left: 31, top: 59, child: Svg('mempty/sparkle')),
                    Positioned(left: 160, top: 104, child: Svg('mempty/twinkle')),
                  ]),
                ),
                const Col([
                  T('No messages yet', 27, Z.ink, w: extraBold, align: TextAlign.center, font: gabarito),
                  T('Connect with friends nearby to start chatting!', 14, Z.slate, lh: 1.6, align: TextAlign.center),
                ], gap: 10, cross: CrossAxisAlignment.center, fill: true),
                Bx(
                  margin: const EdgeInsets.only(top: 8),
                  w: 266,
                  h: 52,
                  r: 16,
                  bg: const Color(0xFFFFECEE),
                  onTap: () => context.push(Routes.nearbyLoading),
                  child: const Rw([Svg('mempty/find'), T('Find friends nearby', 15, Z.rose, w: semiBold)],
                      gap: 8, fill: true, main: MainAxisAlignment.center),
                ),
              ], gap: 18, cross: CrossAxisAlignment.center),
            ),
          ]),
        ),
        ColoredBox(
          color: Z.white,
          child: Col([
            const HLine(Z.line),
            SizedBox(
              height: 66,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 7, 12, 0),
                child: Rw([
                  navItem('mempty/nav_map', 'Map', false, () => goTab(context, ZTab.map)),
                  navItem('mempty/nav_feed', 'Feed', false, () => goTab(context, ZTab.feed)),
                  Bx(
                    w: 48,
                    h: 48,
                    r: 24,
                    bg: Z.rose,
                    align: Alignment.center,
                    onTap: () => openCreatePin(context),
                    child: const Svg('mempty/nav_plus'),
                  ),
                  navItem('mempty/nav_chat', 'Chat', true, () => goTab(context, ZTab.chat)),
                  navItem('mempty/nav_profile', 'Profile', false, () => goTab(context, ZTab.profile)),
                ], fill: true, main: MainAxisAlignment.spaceBetween),
              ),
            ),
            const NavBarSpace(),
          ], fill: true),
        ),
      ], max: true, fill: true),
    );
  }
}
