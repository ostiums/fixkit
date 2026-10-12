import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';

import 'inspect.dart';
import 'overlay.dart';
import 'session.dart';

// Shorter than the 500 ms of Flutter's own long press, so FixKit's wins the arena first.
const _pressFor = Duration(milliseconds: 450);

/// Whether the app runs on iOS itself, which in debug means the simulator.
bool get onIOS => runsOnIOS(isIOS: Platform.isIOS, environment: Platform.environment);

/// iOS, or `flutter test`, which runs on the Mac with the platform overridden: the host's tests run it.
@visibleForTesting
bool runsOnIOS({required bool isIOS, required Map<String, String> environment}) =>
    isIOS || environment.containsKey('FLUTTER_TEST');

/// The debug host: a long press anywhere opens the composer for the app's widget under it.
class DebugHost extends StatefulWidget {
  const DebugHost({super.key, required this.child});

  final Widget child;

  @override
  State<DebugHost> createState() => _DebugHostState();
}

class _DebugHostState extends State<DebugHost> {
  final _session = Session();

  @override
  void initState() {
    super.initState();
    _session.addListener(_changed);
    WidgetsBinding.instance.addPostFrameCallback((_) => _session.announceLaunch());
  }

  // A hot reload reassembles the tree: the app now runs the code Claude saved. A hot restart runs
  // initState again instead.
  @override
  void reassemble() {
    super.reassemble();
    _session.announceLaunch();
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _session.removeListener(_changed);
    _session.dispose();
    super.dispose();
  }

  void _pressed(LongPressStartDetails details) {
    if (_session.isBusy) return;
    // Accepting the long press has rejected every other gesture under the finger: the button
    // pressed neither taps nor long presses.
    _session.begin(inspectAt(details.globalPosition, context as Element));
  }

  @override
  Widget build(BuildContext context) {
    final target = _session.target;
    final lift = target == null ? 0.0 : composerLift(target, MediaQuery.sizeOf(context), MediaQuery.viewInsetsOf(context).bottom);
    return RawGestureDetector(
      behavior: HitTestBehavior.translucent,
      gestures: {
        LongPressGestureRecognizer: GestureRecognizerFactoryWithHandlers<LongPressGestureRecognizer>(
          () => LongPressGestureRecognizer(duration: _pressFor, debugOwner: this),
          (recognizer) => recognizer.onLongPressStart = _pressed,
        ),
      },
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Stack(
          fit: StackFit.expand,
          children: [
            AbsorbPointer(
              absorbing: _session.sending,
              child: TweenAnimationBuilder<double>(
                tween: Tween(end: lift),
                duration: slideDuration,
                curve: Curves.easeOut,
                builder: (context, lift, child) => Transform.translate(offset: Offset(0, -lift), child: child),
                // The composer's keyboard is FixKit's, not the app's, also while it slides away: a
                // Scaffold would shrink its body under the lit element. Always a MediaQuery, so the
                // app's tree keeps its shape.
                child: MediaQuery.removeViewInsets(
                  context: context,
                  removeBottom: _session.isBusy,
                  child: widget.child,
                ),
              ),
            ),
            FixKitOverlay(session: _session),
          ],
        ),
      ),
    );
  }
}
