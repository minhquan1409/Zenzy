import 'package:flutter/material.dart' show DayPeriod, TimeOfDay;
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/router/route_names.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../model/conversation_model.dart';
import '../model/message_model.dart';
import '../repository/chat_repository.dart';

const _sentShape = BorderRadius.only(
    topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(18), bottomRight: Radius.circular(5));
const _receivedShape = BorderRadius.only(
    topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(5), bottomRight: Radius.circular(18));

/// Zenzy · Conversation
class ChatRoomScreen extends StatefulWidget {
  const ChatRoomScreen({super.key, required this.id});
  final String id;
  @override
  State<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends State<ChatRoomScreen> {
  final _draft = TextEditingController();
  final _scroll = ScrollController();
  late final LoadViewModel<ConversationModel> _vm = LoadViewModel(
    () => context.read<ChatRepository>().fetchConversation(widget.id),
    SampleData.instance.conversation(widget.id),
  );

  @override
  void dispose() {
    _draft.dispose();
    _scroll.dispose();
    _vm.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _draft.text.trim();
    if (text.isEmpty) return;
    _draft.clear();
    final repo = context.read<ChatRepository>();
    MessageModel message;
    try {
      message = await repo.send(widget.id, text);
    } catch (_) {
      // Khách hoặc mất mạng: chỉ hiện tin nhắn trên máy.
      final now = TimeOfDay.now();
      final hour = now.hourOfPeriod == 0 ? 12 : now.hourOfPeriod;
      final time = '$hour:${now.minute.toString().padLeft(2, '0')} ${now.period == DayPeriod.am ? 'AM' : 'PM'}';
      message = MessageModel(id: 'local-${DateTime.now().microsecondsSinceEpoch}', mine: true, text: text, timeText: time);
    }
    if (!mounted) return;
    _vm.update(_vm.data.withMessages([..._vm.data.messages, message]));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  Widget _sent(MessageModel m, {double width = 278}) => Col([
        Bx(
          w: width,
          br: _sentShape,
          bg: Z.coral,
          pad: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          child: T(m.text, 14, Z.white, lh: 1.45),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 3),
          child: Rw([
            T(m.seen ? '${m.timeText} · Seen' : m.timeText, 10, Z.secondary, lh: 1.3),
            Svg(m.seen ? 'conv/check_check_seen' : 'conv/check_check'),
          ], gap: 4),
        ),
      ], gap: 5, cross: CrossAxisAlignment.end, fill: true);

  Widget _received(MessageModel m) => Col([
        Bx(
          w: 278,
          br: _receivedShape,
          bg: Z.lavender,
          pad: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          child: T(m.text, 14, Z.navy, lh: 1.45),
        ),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 3), child: T(m.timeText, 10, Z.secondary, lh: 1.3)),
      ], gap: 5, fill: true);

  Widget _place(MessageModel m) => SizedBox(
        width: 278,
        child: Col([
          Bx(
            r: 16,
            bg: Z.white,
            border: Z.border,
            clip: true,
            child: Col([
              Padding(
                padding: const EdgeInsets.all(12),
                child: Rw([
                  const Bx(w: 42, h: 42, r: 13, bg: Z.lavender, align: Alignment.center, child: Svg('conv/map_pin')),
                  Expanded(
                    child: Col([
                      T(m.placeName, 13, Z.navy, w: bold),
                      T(m.placeSub, 10, Z.secondary),
                    ], gap: 5),
                  ),
                ], gap: 10, fill: true),
              ),
              const HLine(Z.border),
              Bx(
                h: 31,
                pad: const EdgeInsets.symmetric(horizontal: 14),
                onTap: () => context.go(Routes.home),
                child: const Rw([T('View on map', 11, Z.coral, w: semiBold), Svg('conv/arrow_up_right')],
                    fill: true, main: MainAxisAlignment.spaceBetween),
              ),
            ], fill: true),
          ),
          T(m.timeText, 10, Z.secondary, lh: 1.3),
        ], gap: 5),
      );

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: Z.canvas,
      child: ImePadding(
        child: ListenableBuilder(
          listenable: _vm,
          builder: (context, _) {
            final c = _vm.data;
            final last = c.messages.isEmpty ? null : c.messages.last;
            return Col([
              ColoredBox(
                color: Z.white,
                child: Col([
                  const StatusBarSpace(),
                  SizedBox(
                    height: 80,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Rw([
                        Bx(w: 20, h: 44, align: Alignment.center, onTap: () => goBack(context), child: const Svg('conv/arrow_left')),
                        Img(c.detailAvatar, w: 44, h: 44),
                        Expanded(
                          child: Col([
                            T(c.name, 16, Z.navy, w: bold, maxLines: 1),
                            Rw([const Svg('conv/online'), T(c.status, 11, Z.purple)], gap: 5),
                          ], gap: 5),
                        ),
                        gapW(21),
                        const Svg('conv/ellipsis_vertical'),
                      ], gap: 12, fill: true),
                    ),
                  ),
                  const HLine(Z.border),
                ], fill: true),
              ),
              Expanded(
                child: SingleChildScrollView(
                  controller: _scroll,
                  physics: const ClampingScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
                  child: Col([
                    const Rw([
                      Expanded(child: HLine(Z.border)),
                      T('Today', 10, Z.secondary, w: medium),
                      Expanded(child: HLine(Z.border)),
                    ], gap: 12, fill: true),
                    for (final m in c.messages)
                      if (m.kind == 'place')
                        _place(m)
                      else if (m.mine)
                        // Bong bóng cuối cùng trong thiết kế ngắn hơn (207px).
                        _sent(m, width: identical(m, last) && m.text.length <= 24 ? 207 : 278)
                      else
                        _received(m),
                  ], gap: 14, fill: true),
                ),
              ),
              ColoredBox(
                color: Z.white,
                child: Col([
                  const HLine(Z.border),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 14, 24, 0),
                    child: Rw([
                      const Bx(w: 28, h: 44, align: Alignment.center, child: Svg('conv/plus')),
                      Expanded(
                        child: Bx(
                          h: 48,
                          r: 16,
                          bg: Z.canvas,
                          border: Z.border,
                          pad: const EdgeInsets.symmetric(horizontal: 13),
                          child: Rw([
                            Expanded(
                              child: ZField(
                                controller: _draft,
                                placeholder: 'Message ${c.firstName}...',
                                style: zStyle(13, Z.navy),
                                placeholderColor: Z.secondary,
                              ),
                            ),
                            const Svg('conv/smile'),
                          ], gap: 8, fill: true),
                        ),
                      ),
                      Bx(w: 46, h: 46, r: 16, bg: Z.coral, align: Alignment.center, onTap: _send, child: const Svg('conv/arrow_up')),
                    ], gap: 10, fill: true),
                  ),
                  const NavBarSpace(top: 12),
                ], fill: true),
              ),
            ], max: true, fill: true);
          },
        ),
      ),
    );
  }
}
