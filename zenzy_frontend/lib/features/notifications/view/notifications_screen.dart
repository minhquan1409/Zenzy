import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../../core/data/sample_data.dart';
import '../../../core/design/design.dart';
import '../../../core/ui_state/view_state.dart';
import '../../../core/widgets/main_scaffold.dart';
import '../../chat/view/conversations_screen.dart' show RowDivider, softShadow;
import '../model/notification_model.dart';
import '../repository/notification_repository.dart';

const _blush = Color(0xFFFFECEC);

Color _hex(String s) {
  final v = int.tryParse(s.replaceFirst('#', ''), radix: 16);
  return v == null ? _blush : Color(0xFF000000 | v);
}

class _Item extends StatelessWidget {
  const _Item(this.n);
  final NotificationModel n;

  @override
  Widget build(BuildContext context) => Bx(
        w: double.infinity,
        r: 16,
        bg: Z.white,
        border: n.unread ? _blush : Z.lavender,
        shadow: zShadow(softShadow, 4, 2),
        pad: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        child: Rw([
          Bx(w: 40, h: 40, circle: true, bg: _hex(n.badgeColor), align: Alignment.center, child: Svg('s12/${n.icon}')),
          Expanded(
            child: Col([
              T.rich([span(n.lead), span(n.bold, w: bold)], 13, Z.navy, lh: 18 / 13),
              T(n.timeText, 11, Z.secondary),
            ], gap: 2),
          ),
          if (n.unread) const Svg('s12/coral_dot'),
        ], gap: 12, fill: true),
      );
}

/// 12 · Notifications
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Screen(
      bg: Z.white,
      child: Col([
        Scroll(
          child: Loader<List<NotificationModel>>(
            load: context.read<NotificationRepository>().fetch,
            initial: SampleData.instance.notifications,
            builder: (context, vm) {
              final items = vm.data;
              return Col([
                const StatusBarSpace(),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  child: Rw([
                    T('Notifications', 24, Z.navy, w: extraBold),
                    T('Mark all read', 13, Z.coral, w: semiBold),
                  ], fill: true, main: MainAxisAlignment.spaceBetween),
                ),
                for (final (i, n) in items.indexed) ...[
                  if (i == 0 || items[i - 1].section != n.section)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
                      child: T(n.section, 12, Z.secondary, w: bold),
                    )
                  else
                    const RowDivider(),
                  _Item(n),
                ],
              ], fill: true);
            },
          ),
        ),
        // Màn này không thuộc tab nào nên không tô sáng tab.
        const ZenzyBottomNav(null),
      ], max: true, fill: true),
    );
  }
}
