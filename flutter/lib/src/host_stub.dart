import 'package:flutter/widgets.dart';

/// The web is not iOS.
bool get onIOS => false;

/// Where there is no dart:io, the web: FixKit does nothing.
class DebugHost extends StatelessWidget {
  const DebugHost({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => child;
}
