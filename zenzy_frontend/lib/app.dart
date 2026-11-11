import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/design/design.dart';
import 'core/di/providers.dart';
import 'core/router/app_router.dart';

/// Gốc của app: DI, router và scale thiết kế 402px.
class ZenzyApp extends StatefulWidget {
  const ZenzyApp({super.key});
  @override
  State<ZenzyApp> createState() => _ZenzyAppState();
}

class _ZenzyAppState extends State<ZenzyApp> {
  final _router = buildRouter();
  final _providers = buildProviders();

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: _providers,
      child: MaterialApp.router(
        title: 'Zenzy',
        debugShowCheckedModeBanner: false,
        routerConfig: _router,
        theme: ThemeData(
          fontFamily: inter,
          scaffoldBackgroundColor: Z.canvas,
          colorScheme: ColorScheme.fromSeed(seedColor: Z.coral),
          textSelectionTheme: TextSelectionThemeData(
            cursorColor: Z.coral,
            selectionColor: alpha(Z.coral, 0.25),
            selectionHandleColor: Z.coral,
          ),
        ),
        builder: DesignScale.wrap,
      ),
    );
  }
}
