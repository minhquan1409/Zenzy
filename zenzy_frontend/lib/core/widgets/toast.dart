import 'package:flutter/widgets.dart';

import '../design/design.dart';

/// Thông báo ngắn ở đáy màn hình (không có trong Figma; chỉ dùng báo lỗi/trạng thái API).
void showToast(BuildContext context, String message) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (context) => Positioned(
      left: 24,
      right: 24,
      bottom: MediaQuery.paddingOf(context).bottom + 96,
      child: IgnorePointer(
        child: Center(
          child: Bx(
            bg: alpha(Z.navy, 0.92),
            r: 12,
            pad: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: T(message, 12, Z.white, w: medium, align: TextAlign.center, font: inter),
          ),
        ),
      ),
    ),
  );
  overlay.insert(entry);
  Future.delayed(const Duration(milliseconds: 2400), entry.remove);
}
