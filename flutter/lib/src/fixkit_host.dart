import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'host_stub.dart' if (dart.library.io) 'host.dart';

/// Installs the long press, the report composer and the status banners. Wrap the app's root in
/// it, once: `runApp(const FixKitHost(child: MyApp()))`. In release, and anywhere but iOS, it is
/// its child: `kDebugMode` is a constant, so the compiler drops the rest.
class FixKitHost extends StatelessWidget {
  const FixKitHost({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode || defaultTargetPlatform != TargetPlatform.iOS) return child;
    return DebugHost(child: child);
  }
}
