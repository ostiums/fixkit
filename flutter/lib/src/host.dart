import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'inspect.dart';
import 'overlay.dart';
import 'session.dart';

// Shorter than the 500 ms of Flutter's own long press, so FixKit's wins the arena first.
const _pressFor = Duration(milliseconds: 450);

/// Whether the app runs on iOS or Android itself, which in debug means the simulator or the emulator.
bool get onDevice => runsOnDevice(isIOS: Platform.isIOS, isAndroid: Platform.isAndroid, environment: Platform.environment);

/// iOS, Android, or `flutter test`, which runs on the Mac with the platform overridden: the host's tests run it.
@visibleForTesting
bool runsOnDevice({required bool isIOS, required bool isAndroid, required Map<String, String> environment}) =>
    isIOS || isAndroid || environment.containsKey('FLUTTER_TEST');

/// The debug host: a long press anywhere opens the composer for the app's widget under it.
class DebugHost extends StatefulWidget {
  const DebugHost({super.key, required this.child});

  final Widget child;

  @override
  State<DebugHost> createState() => _DebugHostState();
}

class _DebugHostState extends State<DebugHost> with WidgetsBindingObserver {
  final _session = Session();

  @override
  void initState() {
    super.initState();
    // Before the app's own: the host is built first, so Android's back button reaches it first.
    WidgetsBinding.instance.addObserver(this);
    _session.addListener(_changed);
    WidgetsBinding.instance.addPostFrameCallback((_) => _session.announceLaunch());
  }

  // A hot reload reassembles the tree: the app now runs the code the agent saved. A hot restart runs
  // initState again instead.
  @override
  void reassemble() {
    super.reassemble();
    _session.announceLaunch();
  }

  void _changed() => setState(() {});

  // Android's back button closes the composer, not the app's screen under it. With the keyboard up
  // the first press only hides the keyboard, and the draft stays.
  @override
  Future<bool> didPopRoute() async {
    if (_session.target == null) return false;
    _session.cancel();
    return true;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _session.removeListener(_changed);
    _session.dispose();
    super.dispose();
  }

  void _pressed(LongPressStartDetails details) {
    if (_session.isBusy) return;
    // Accepting the long press has rejected every other gesture under the finger: the button
    // pressed neither taps nor long presses.
    _session.begin(inspectAt(details.globalPosition, context as Element));
    // Android 16's predictive back leaves the app on its first screen without asking Flutter, which
    // the app's navigator says it can't pop there. The composer can be closed: Flutter handles back
    // from now on. The navigator says so again at its next change; until then a back press on the
    // first screen still leaves the app, only without the predictive animation.
    SystemNavigator.setFrameworkHandlesBack(true);
  }

  @override
  Widget build(BuildContext context) {
    final target = _session.target;
    final bottom = composerBottom(MediaQuery.viewInsetsOf(context).bottom, MediaQuery.paddingOf(context).bottom);
    final lift = target == null ? 0.0 : composerLift(target, MediaQuery.sizeOf(context), bottom);
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
