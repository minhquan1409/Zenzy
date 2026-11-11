// Nền tảng dựng UI theo Figma: màu, font, text, SVG, ảnh, bóng đổ, scale 402px.
// Mọi con số trong các màn hình là pixel của Figma (frame rộng 402).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Màu lấy từ biến của file Figma.
class Z {
  static const navy = Color(0xFF1A1B2F);
  static const coral = Color(0xFFFF5C5C);
  static const canvas = Color(0xFFF8F9FC);
  static const purple = Color(0xFF7C66DC);
  static const lavender = Color(0xFFEAE8F8);
  static const secondary = Color(0xFF6B7085);
  static const white = Color(0xFFFFFFFF);
  static const line = Color(0xFFEBEFF5);
  static const line2 = Color(0xFFE9E9F1);
  static const border = Color(0xFFEAEAF2);
  // Bảng màu riêng của các frame luồng live pin và Messages empty.
  static const ink = Color(0xFF1E254B);
  static const indigo = Color(0xFF2F3C7E);
  static const rose = Color(0xFFF96167);
  static const slate = Color(0xFF6B7280);
  static const mist = Color(0xFF9CA4BB);
}

const inter = 'Inter';
const rubik = 'Rubik';
const gabarito = 'Gabarito';

const normal = FontWeight.w400;
const medium = FontWeight.w500;
const semiBold = FontWeight.w600;
const bold = FontWeight.w700;
const extraBold = FontWeight.w800;

/// Chiều rộng mọi frame Figma.
const designWidth = 402.0;

/// Style chữ theo số đo Figma: [size]/[ls] là px, [lh] là hệ số line-height.
TextStyle zStyle(
  double size,
  Color color, {
  FontWeight w = normal,
  double lh = 1.21,
  double ls = 0,
  bool underline = false,
  bool strike = false,
  String? font = inter,
}) {
  return TextStyle(
    fontFamily: font,
    fontSize: size,
    fontWeight: w,
    fontVariations: [FontVariation('wght', w.value.toDouble())],
    color: color,
    height: lh,
    leadingDistribution: TextLeadingDistribution.even,
    letterSpacing: ls,
    decoration: underline
        ? TextDecoration.underline
        : strike
            ? TextDecoration.lineThrough
            : TextDecoration.none,
    decorationColor: color,
  );
}

/// Chữ theo Figma. Không truyền [font] thì dùng font của khung bao ngoài (Inter hoặc Rubik).
class T extends StatelessWidget {
  const T(
    this.text,
    this.size,
    this.color, {
    super.key,
    this.w = normal,
    this.lh = 1.21,
    this.ls = 0,
    this.align,
    this.maxLines,
    this.underline = false,
    this.strike = false,
    this.font,
    this.spans,
  });

  /// Chữ nhiều kiểu (link, in đậm một phần).
  const T.rich(
    List<InlineSpan> this.spans,
    this.size,
    this.color, {
    super.key,
    this.w = normal,
    this.lh = 1.21,
    this.ls = 0,
    this.align,
    this.font,
  })  : text = '',
        maxLines = null,
        underline = false,
        strike = false;

  final String text;
  final double size;
  final Color color;
  final FontWeight w;
  final double lh;
  final double ls;
  final TextAlign? align;
  final int? maxLines;
  final bool underline;
  final bool strike;
  final String? font;
  final List<InlineSpan>? spans;

  @override
  Widget build(BuildContext context) {
    final family = font ?? DefaultTextStyle.of(context).style.fontFamily ?? inter;
    final style = zStyle(size, color, w: w, lh: lh, ls: ls, underline: underline, strike: strike, font: family);
    return Text.rich(
      TextSpan(text: spans == null ? text : null, children: spans),
      style: style,
      textAlign: align,
      maxLines: maxLines,
      overflow: maxLines == null ? TextOverflow.clip : TextOverflow.ellipsis,
      textScaler: TextScaler.noScaling,
    );
  }
}

/// Đoạn chữ con trong [T.rich].
TextSpan span(String text, {Color? color, FontWeight? w, bool underline = false}) => TextSpan(
      text: text,
      style: TextStyle(
        color: color,
        fontWeight: w,
        fontVariations: w == null ? null : [FontVariation('wght', w.value.toDouble())],
        decoration: underline ? TextDecoration.underline : null,
        decorationColor: color,
      ),
    );

/// Vẽ SVG gốc xuất từ Figma (assets/svg/[path].svg) theo kích thước gốc, [tint] đổi màu toàn bộ.
class Svg extends StatelessWidget {
  const Svg(this.path, {super.key, this.w, this.h, this.tint});
  final String path;
  final double? w;
  final double? h;
  final Color? tint;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
        'assets/svg/$path.svg',
        width: w,
        height: h,
        colorFilter: tint == null ? null : ColorFilter.mode(tint!, BlendMode.srcIn),
      );
}

/// Ảnh. [name] là tên file trong assets/images (không đuôi) hoặc URL http(s) do API trả về.
class Img extends StatelessWidget {
  const Img(this.name, {super.key, this.w, this.h, this.fit = BoxFit.cover, this.r = 0, this.circle = false});
  final String name;
  final double? w;
  final double? h;
  final BoxFit fit;
  final double r;
  final bool circle;

  @override
  Widget build(BuildContext context) {
    final isUrl = name.startsWith('http');
    final key = name.startsWith('asset:') ? name.substring(6) : name;
    Widget img = isUrl
        ? Image.network(name, width: w, height: h, fit: fit, errorBuilder: (_, __, ___) => SizedBox(width: w, height: h))
        : Image.asset('assets/images/$key.png',
            width: w, height: h, fit: fit, errorBuilder: (_, __, ___) => SizedBox(width: w, height: h));
    if (circle) return ClipOval(child: img);
    if (r > 0) return ClipRRect(borderRadius: BorderRadius.circular(r), child: img);
    return img;
  }
}

/// Drop shadow của Figma: [blur] và [y] theo px. Figma/CSS dùng sigma = blur / 2.
BoxShadow zShadow(Color color, double blur, [double y = 0]) {
  final sigma = blur / 2;
  final radius = sigma <= 0.5 ? 0.0 : (sigma - 0.5) / 0.57735;
  return BoxShadow(color: color, blurRadius: radius, offset: Offset(0, y));
}

Color alpha(Color c, double a) => c.withValues(alpha: a);

/// Hộp: nền, bo góc, viền, bóng, padding, kích thước, canh nội dung, bấm (không ripple).
class Bx extends StatelessWidget {
  const Bx({
    super.key,
    this.w,
    this.h,
    this.minH,
    this.pad,
    this.margin,
    this.bg,
    this.gradient,
    this.r = 0,
    this.br,
    this.circle = false,
    this.border,
    this.bw = 1,
    this.shadow,
    this.align,
    this.onTap,
    this.clip = false,
    this.opacity = 1,
    this.child,
  });

  final double? w;
  final double? h;
  final double? minH;
  final EdgeInsetsGeometry? pad;
  final EdgeInsetsGeometry? margin;
  final Color? bg;
  final Gradient? gradient;
  final double r;
  final BorderRadius? br;
  final bool circle;
  final Color? border;
  final double bw;
  final BoxShadow? shadow;
  final Alignment? align;
  final VoidCallback? onTap;
  final bool clip;
  final double opacity;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final radius = br ?? BorderRadius.circular(circle ? 1000 : r);
    Widget c = child ?? const SizedBox.shrink();
    if (align != null) c = Align(alignment: align!, widthFactor: 1, heightFactor: 1, child: c);
    if (pad != null) c = Padding(padding: pad!, child: c);
    if (clip) c = ClipRRect(borderRadius: radius, child: c);
    if (bg != null || gradient != null || shadow != null || border != null) {
      c = DecoratedBox(
        decoration: BoxDecoration(
          color: bg,
          gradient: gradient,
          borderRadius: radius,
          boxShadow: shadow == null ? null : [shadow!],
        ),
        position: DecorationPosition.background,
        child: border == null
            ? c
            : DecoratedBox(
                decoration: BoxDecoration(borderRadius: radius, border: Border.all(color: border!, width: bw)),
                position: DecorationPosition.foreground,
                child: c,
              ),
      );
    }
    if (w != null || h != null) c = SizedBox(width: w, height: h, child: c);
    if (minH != null) c = ConstrainedBox(constraints: BoxConstraints(minHeight: minH!), child: c);
    if (opacity < 1) c = Opacity(opacity: opacity, child: c);
    if (onTap != null) c = GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: c);
    if (margin != null) c = Padding(padding: margin!, child: c);
    return c;
  }
}

/// Cột: mặc định co theo nội dung, canh trái (giống Column của Compose). [fill] = rộng hết.
class Col extends StatelessWidget {
  const Col(this.children,
      {super.key, this.gap = 0, this.cross = CrossAxisAlignment.start, this.main = MainAxisAlignment.start, this.fill = false, this.max = false});
  final List<Widget> children;
  final double gap;
  final CrossAxisAlignment cross;
  final MainAxisAlignment main;
  final bool fill;
  final bool max;

  @override
  Widget build(BuildContext context) {
    final col = Column(
      mainAxisSize: max ? MainAxisSize.max : MainAxisSize.min,
      crossAxisAlignment: cross,
      mainAxisAlignment: main,
      spacing: gap,
      children: children,
    );
    return fill ? SizedBox(width: double.infinity, child: col) : col;
  }
}

/// Hàng: mặc định co theo nội dung, canh giữa theo chiều dọc. [fill] = rộng hết.
class Rw extends StatelessWidget {
  const Rw(this.children,
      {super.key, this.gap = 0, this.cross = CrossAxisAlignment.center, this.main = MainAxisAlignment.start, this.fill = false});
  final List<Widget> children;
  final double gap;
  final CrossAxisAlignment cross;
  final MainAxisAlignment main;
  final bool fill;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: fill ? MainAxisSize.max : MainAxisSize.min,
        crossAxisAlignment: cross,
        mainAxisAlignment: main,
        spacing: gap,
        children: children,
      );
}

/// Đường kẻ ngang 1px.
class HLine extends StatelessWidget {
  const HLine(this.color, {super.key});
  final Color color;
  @override
  Widget build(BuildContext context) => SizedBox(width: double.infinity, height: 1, child: ColoredBox(color: color));
}

Widget gapH(double h) => SizedBox(height: h);
Widget gapW(double w) => SizedBox(width: w);

/// Chừa chỗ cho status bar thật của hệ điều hành (thay thanh "9:41" trong Figma).
class StatusBarSpace extends StatelessWidget {
  const StatusBarSpace({super.key, this.darkIcons = true});
  final bool darkIcons;
  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          systemNavigationBarColor: Colors.transparent,
          systemNavigationBarContrastEnforced: false,
          statusBarIconBrightness: darkIcons ? Brightness.dark : Brightness.light,
          statusBarBrightness: darkIcons ? Brightness.light : Brightness.dark,
        ),
        child: SizedBox(height: MediaQuery.paddingOf(context).top, width: double.infinity),
      );
}

/// Chừa chỗ cho navigation bar thật (thay home indicator trong Figma).
class NavBarSpace extends StatelessWidget {
  const NavBarSpace({super.key, this.top = 0});
  final double top;
  @override
  Widget build(BuildContext context) => SizedBox(height: MediaQuery.paddingOf(context).bottom + top, width: double.infinity);
}

/// Ô nhập thật, trông như chữ thường của thiết kế, có placeholder.
class ZField extends StatelessWidget {
  const ZField({
    super.key,
    this.controller,
    this.initial,
    required this.placeholder,
    required this.style,
    required this.placeholderColor,
    this.singleLine = true,
    this.obscure = false,
    this.keyboard,
    this.onChanged,
  });
  final TextEditingController? controller;
  final String? initial;
  final String placeholder;
  final TextStyle style;
  final Color placeholderColor;
  final bool singleLine;
  final bool obscure;
  final TextInputType? keyboard;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) => TextFormField(
        controller: controller,
        initialValue: controller == null ? initial : null,
        onChanged: onChanged,
        style: style,
        obscureText: obscure,
        keyboardType: keyboard ?? (singleLine ? TextInputType.text : TextInputType.multiline),
        maxLines: singleLine ? 1 : null,
        cursorColor: Z.coral,
        cursorWidth: 1.5,
        strutStyle: StrutStyle.fromTextStyle(style, forceStrutHeight: true),
        decoration: InputDecoration.collapsed(hintText: placeholder, hintStyle: style.copyWith(color: placeholderColor)),
      );
}

/// Scale toàn bộ UI để chiều rộng màn hình = 402 đơn vị thiết kế.
class DesignScale extends InheritedWidget {
  const DesignScale._({required this.scale, required this.deviceQuery, required super.child});
  final double scale;
  final MediaQueryData deviceQuery;

  static DesignScale of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<DesignScale>()!;

  /// Dùng trong `MaterialApp.builder`.
  static Widget wrap(BuildContext context, Widget? child) {
    final mq = MediaQuery.of(context);
    final s = mq.size.width / designWidth;
    return DesignScale._(
      scale: s,
      deviceQuery: mq,
      child: MediaQuery(
        data: mq.copyWith(
          size: mq.size / s,
          padding: mq.padding / s,
          viewPadding: mq.viewPadding / s,
          viewInsets: mq.viewInsets / s,
          devicePixelRatio: mq.devicePixelRatio * s,
          textScaler: TextScaler.noScaling,
        ),
        child: SizedBox.expand(
          child: FittedBox(
            fit: BoxFit.fill,
            alignment: Alignment.topLeft,
            child: SizedBox(
              width: designWidth,
              height: mq.size.height / s,
              child: DefaultTextStyle(style: zStyle(14, Z.navy), child: Material(type: MaterialType.transparency, child: child)),
            ),
          ),
        ),
      ),
    );
  }

  @override
  bool updateShouldNotify(DesignScale oldWidget) => scale != oldWidget.scale || deviceQuery != oldWidget.deviceQuery;
}

/// Bỏ scale cho con (dùng cho platform view bản đồ): con được dựng ở kích thước thật của thiết bị.
class Unscaled extends StatelessWidget {
  const Unscaled({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ds = DesignScale.of(context);
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth * ds.scale;
      final h = c.maxHeight * ds.scale;
      return ClipRect(
        child: OverflowBox(
          alignment: Alignment.topLeft,
          minWidth: w,
          maxWidth: w,
          minHeight: h,
          maxHeight: h,
          child: Transform.scale(
            scale: 1 / ds.scale,
            alignment: Alignment.topLeft,
            child: MediaQuery(data: ds.deviceQuery, child: child),
          ),
        ),
      );
    });
  }
}

/// Đưa nội dung lên trên bàn phím.
class ImePadding extends StatelessWidget {
  const ImePadding({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom), child: child);
}
