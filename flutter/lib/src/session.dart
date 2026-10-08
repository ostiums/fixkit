import 'dart:async';
import 'dart:developer' as developer;
import 'dart:io';

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

import 'banners.dart';
import 'client.dart';
import 'report.dart';

// How long the host's animation takes to slide the app back down.
const _liftSettles = Duration(milliseconds: 400);

/// A report from the long press to the fix on screen: the composer, the sending, the banners.
class Session extends ChangeNotifier {
  Session({Client? client}) : _client = client ?? Client();

  final Client _client;

  /// The press being reported while the composer is open.
  Target? target;

  /// The comment typed so far has more than spaces.
  bool canSend = false;
  StatusBanner? banner;

  /// The press outlined while the receiver takes its screenshot.
  Target? outline;

  /// A report is on its way: the receiver answers once it has read the screen.
  bool sending = false;

  /// How far the app is slid up so the composer does not cover the pressed element.
  double lift = 0;

  String _draft = '';
  // Each follow holds a ticket; a newer follow or a new report retires the older one.
  int _ticket = 0;
  Timer? _hiding;
  // The wait before the next status poll, which dispose cuts short.
  Timer? _waiting;
  Completer<void>? _waited;
  bool _disposed = false;

  bool get isBusy => target != null || sending;

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  void begin(Target pressed) {
    if (isBusy) return;
    _draft = '';
    target = pressed;
    canSend = false;
    _changed();
  }

  void setDraft(String text) {
    _draft = text;
    final can = text.trim().isNotEmpty;
    if (can == canSend) return;
    canSend = can;
    _changed();
  }

  void setLift(double value) {
    if (value == lift) return;
    lift = value;
    _changed();
  }

  void cancel() {
    target = null;
    lift = 0;
    _changed();
  }

  Future<void> send() async {
    final pressed = target;
    final comment = _draft.trim();
    if (pressed == null || comment.isEmpty || sending) return;

    final lifted = lift > 0;
    _ticket++;
    _hide();
    target = null;
    lift = 0;
    sending = true;
    _changed();
    // The receiver takes the screenshot and reads the screen as the report arrives, so the report
    // leaves once the composer and the keyboard are gone, the app has slid back down and the
    // outline is on screen.
    await Future.wait([_keyboardGone(), if (lifted) Future<void>.delayed(_liftSettles)]);
    outline = pressed;
    _changed();
    await _frames(2);
    String? id;
    try {
      id = await _client.sendReport(
        reportBody(pressed, comment, os: osVersion(Platform.operatingSystemVersion), simulator: simulatorIn(Directory.systemTemp.path)),
      );
    } catch (_) {}
    sending = false;
    outline = null;
    _changed();
    if (id == null) {
      _show(offline, hideAfter: const Duration(seconds: 4));
      return;
    }
    _show(sent);
    unawaited(_follow(id));
  }

  /// At launch and after every hot reload: tells the receiver the app runs its latest code, which is
  /// how the mod learns a fix is on screen, and where its VM service is; then follows the report
  /// Claude is working on. A report already over shows nothing, so a later reload never repeats it.
  Future<void> announceLaunch() async {
    try {
      final info = await developer.Service.getInfo();
      final answer = await _client.launched(info.serverUri?.toString());
      final id = answer.id;
      final status = answer.status;
      if (id != null && status != null && !isOver(status)) unawaited(_follow(id));
    } catch (_) {}
  }

  Future<void> _follow(String id) async {
    final mine = ++_ticket;
    while (mine == _ticket && !_disposed) {
      await _sleep(const Duration(seconds: 1));
      if (_disposed) return;
      String? status;
      try {
        status = (await _client.statusOf(id)).status;
      } catch (_) {}
      if (mine != _ticket || _disposed || status == null) continue;
      if (isOver(status)) {
        _ticket++;
        _show(bannerFor(status), hideAfter: const Duration(seconds: 4));
        return;
      }
      _show(bannerFor(status));
    }
  }

  Future<void> _sleep(Duration duration) {
    final waited = _waited = Completer<void>();
    _waiting = Timer(duration, waited.complete);
    return waited.future;
  }

  void _show(StatusBanner shown, {Duration? hideAfter}) {
    _hide();
    banner = shown;
    _changed();
    if (hideAfter != null) {
      _hiding = Timer(hideAfter, () {
        banner = null;
        _changed();
      });
    }
  }

  void _hide() {
    _hiding?.cancel();
    _hiding = null;
    if (banner == null) return;
    banner = null;
    _changed();
  }

  /// Resolves once the keyboard has slid away, or after a second.
  Future<void> _keyboardGone() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final view = WidgetsBinding.instance.platformDispatcher.implicitView;
    for (var waited = 0; waited < 1000 && (view?.viewInsets.bottom ?? 0) > 0; waited += 16) {
      await Future<void>.delayed(const Duration(milliseconds: 16));
    }
  }

  Future<void> _frames(int count) async {
    for (var left = count; left > 0; left--) {
      SchedulerBinding.instance.scheduleFrame();
      await SchedulerBinding.instance.endOfFrame;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _ticket++;
    _hiding?.cancel();
    _waiting?.cancel();
    if (_waited?.isCompleted == false) _waited!.complete();
    super.dispose();
  }
}
