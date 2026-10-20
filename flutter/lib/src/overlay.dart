import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'banners.dart';
import 'layout.dart';
import 'report.dart';
import 'session.dart';

// FixKit's tint, the Swift package's own.
const _tint = Color(0xFFD97857);
const _white = Color(0xFFFFFFFF);
const _panelHeight = 52.0;
// Between the composer's panel and the keyboard.
const _panelGap = 10.0;

/// FixKit's widgets above the app: the outline for a screenshot, the composer, the banner. Idle,
/// it takes no touch, so the app gets them all.
class FixKitOverlay extends StatelessWidget {
  const FixKitOverlay({super.key, required this.session});

  final Session session;

  @override
  Widget build(BuildContext context) {
    final target = session.target;
    final outline = session.outline;
    final banner = session.banner;
    return DefaultTextStyle(
      style: const TextStyle(color: _white, fontSize: 14, decoration: TextDecoration.none),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (outline != null) _Outline(target: outline),
          if (target != null) _Composer(session: session, target: target),
          if (banner != null) _BannerView(banner: banner),
        ],
      ),
    );
  }
}

/// How far above the bottom of the screen the composer sits: above the keyboard, or with none above
/// the screen's own bottom inset, Android's navigation bar or the home indicator.
double composerBottom(BuildContext context) {
  final keyboard = MediaQuery.viewInsetsOf(context).bottom;
  return (keyboard > 0 ? keyboard : MediaQuery.paddingOf(context).bottom) + _panelGap;
}

/// How far the host slides the app up so the composer, above the keyboard, does not cover the
/// pressed element.
double composerLift(Target target, Size screen, double bottom) =>
    liftFor(target.element?.frame?.bottom ?? target.touch.dy, screen.height - bottom - _panelHeight);

/// The pressed element outlined in red, or a red ring where the finger was.
class _Outline extends StatelessWidget {
  const _Outline({required this.target});

  final Target target;

  @override
  Widget build(BuildContext context) {
    final frame = target.element?.frame;
    return Positioned.fromRect(
      rect: around(frame, target.touch, 4, 22),
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFFF3B30), width: 2),
            borderRadius: BorderRadius.circular(frame != null ? 8 : 22),
          ),
        ),
      ),
    );
  }
}

/// The dimmed screen with the pressed element lit, and the comment field above the keyboard.
class _Composer extends StatefulWidget {
  const _Composer({required this.session, required this.target});

  final Session session;
  final Target target;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 900), lowerBound: 0.35)
    ..repeat(reverse: true);
  final _text = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _text.addListener(() => widget.session.setDraft(_text.text));
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _pulse.dispose();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final target = widget.target;
    final size = MediaQuery.sizeOf(context);
    final bottom = composerBottom(context);
    final frame = target.element?.frame;
    final lift = composerLift(target, size, bottom);
    final lit = spotlight(frame, target.touch, lift);
    void send() => session.send(lifted: lift > 0);
    final name = target.element?.name;

    return Semantics(
      identifier: 'fixkit.composer',
      child: Stack(
        fit: StackFit.expand,
        children: [
          // A tap anywhere but the panel cancels, the lit element included: the app under it must not act.
          GestureDetector(behavior: HitTestBehavior.opaque, onTap: session.cancel),
          for (final rect in dimAround(lit, size))
            Positioned.fromRect(rect: rect, child: const IgnorePointer(child: ColoredBox(color: Color(0x9E000000)))),
          Positioned.fromRect(
            rect: lit,
            child: IgnorePointer(
              child: FadeTransition(
                opacity: _pulse,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    border: Border.all(color: _tint, width: 2),
                    borderRadius: BorderRadius.circular(frame != null ? 12 : 28),
                    boxShadow: const [BoxShadow(color: Color(0xE6D97857), blurRadius: 12)],
                  ),
                ),
              ),
            ),
          ),
          if (name != null)
            Positioned(
              left: 12,
              right: 12,
              top: lit.top > 120 ? lit.top - 34 : lit.bottom + 10,
              child: IgnorePointer(
                child: Align(
                  alignment: Alignment(((lit.center.dx / size.width) * 2 - 1).clamp(-1.0, 1.0), 0),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(color: _tint, borderRadius: BorderRadius.circular(12)),
                    child: Text(name, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, fontFamily: 'Menlo')),
                  ),
                ),
              ),
            ),
          Positioned(
            left: 14,
            right: 14,
            bottom: bottom,
            height: _panelHeight,
            // Takes the taps that miss its field and button, which would otherwise cancel.
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _focus.requestFocus,
              child: Container(
                padding: const EdgeInsets.only(left: 16, right: 7),
                decoration: BoxDecoration(
                  color: const Color(0xEB28282C),
                  borderRadius: BorderRadius.circular(26),
                  border: Border.all(color: const Color(0x8CD97857)),
                  boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 18, offset: Offset(0, 8))],
                ),
                child: Row(
                  children: [
                    const Text('✦', style: TextStyle(color: _tint, fontSize: 16, fontWeight: FontWeight.w600)),
                    const SizedBox(width: 10),
                    Expanded(child: _field(session, send)),
                    const SizedBox(width: 10),
                    GestureDetector(
                      onTap: session.canSend ? send : null,
                      child: Container(
                        width: 38,
                        height: 38,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: session.canSend ? _tint : const Color(0x24FFFFFF)),
                        child: const Text('↵', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(Session session, VoidCallback send) => Stack(
    alignment: Alignment.centerLeft,
    children: [
      ValueListenableBuilder(
        valueListenable: _text,
        builder: (context, value, _) => value.text.isEmpty
            ? const Text('What should be fixed here?', style: TextStyle(color: Color(0x8CFFFFFF), fontSize: 16))
            : const SizedBox.shrink(),
      ),
      EditableText(
        controller: _text,
        focusNode: _focus,
        style: const TextStyle(color: _white, fontSize: 16),
        cursorColor: _tint,
        backgroundCursorColor: const Color(0xFF888888),
        keyboardAppearance: Brightness.dark,
        textInputAction: TextInputAction.send,
        autocorrect: false,
        onSubmitted: (_) => send(),
      ),
    ],
  );
}

class _BannerView extends StatelessWidget {
  const _BannerView({required this.banner});

  final StatusBanner banner;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.paddingOf(context).top + 6,
      left: 0,
      right: 0,
      child: IgnorePointer(
        child: Center(
          child: Semantics(
            identifier: 'fixkit.banner',
            label: banner.text,
            container: true,
            excludeSemantics: true,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: _tint,
                borderRadius: BorderRadius.circular(20),
                boxShadow: const [BoxShadow(color: Color(0x59000000), blurRadius: 14, offset: Offset(0, 6))],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (banner.working)
                    const CupertinoActivityIndicator(color: _white, radius: 8)
                  else
                    Text(banner.glyph ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 8),
                  Text(banner.text, style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
