import 'dart:async';
import 'dart:developer' as developer;
import 'dart:io';

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

import 'banners.dart';
import 'client.dart';
import 'report.dart';

/// How long the host takes to slide the app up above the composer, or back down.
const slideDuration = Duration(milliseconds: 300);

/// A report from the long press to the fix on screen: the composer, the sending, the banners.
class Session extends ChangeNotifier {
  Session({Client? client}) : _client = client ?? Client();

  final Client _client;

  /// The press being reported while the composer is open.
  Target? target;

  /// The comment typed so far has more than spaces.
  bool get canSend => _draft.trim().isNotEmpty;

  /// The banner on screen: the report sent, followed, or the receiver not listening.
  StatusBanner? banner;

  /// The press outlined while the receiver takes its screenshot.
  Target? outline;

  /// A report is on its way: the receiver answers once it has read the screen.
  bool sending = false;

  String _draft = '';
  // Each follow holds a ticket; a newer follow or a new report retires the older one.
  int _ticket = 0;
  Timer? _hiding;
  // The wait before the next status poll, which dispose cuts short.
  Timer? _waiting;
  Completer<void>? _waited;
  bool _disposed = false;

  /// The composer is open or a report is on its way: a long press opens nothing.
  bool get isBusy => target != null || sending;

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  /// Opens the composer for `pressed`.
  void begin(Target pressed) {
    if (isBusy) return;
    _draft = '';
    target = pressed;
    _changed();
  }

  /// The comment as typed; redraws only when it starts or stops being sendable.
  void setDraft(String text) {
    final could = canSend;
    _draft = text;
    if (canSend != could) _changed();
  }

  /// Closes the composer without sending.
  void cancel() {
    target = null;
    _changed();
  }

  /// Sends the report; `lifted` when the host has slid the app up, which it now slides back down.
  Future<void> send({bool lifted = false}) async {
    final pressed = target;
    final comment = _draft.trim();
    if (pressed == null || comment.isEmpty || sending) return;

    _ticket++;
    _hiding?.cancel();
    _hiding = null;
    banner = null;
    target = null;
    sending = true;
    _changed();
    // The receiver takes the screenshot and reads the screen as the report arrives, so the report
    // leaves once the composer and the keyboard are gone, the app has slid back down and the
    // outline is on screen.
    await Future.wait([_keyboardGone(), if (lifted) Future<void>.delayed(slideDuration + const Duration(milliseconds: 100))]);
    outline = pressed;
    _changed();
    await _frames(2);
    Receipt? receipt;
    try {
      receipt = await _client.sendReport(await _body(pressed, comment));
    } catch (_) {}
    sending = false;
    outline = null;
    _changed();
    if (receipt == null) {
      _show(offline, hideAfter: const Duration(seconds: 4));
      return;
    }
    _show(sentTo(receipt.agent));
    unawaited(_follow(receipt.id));
  }

  /// The report on this platform: the simulator it runs in on iOS; on Android what the receiver
  /// finds the device by and reads its pixels with.
  Future<Map<String, Object>> _body(Target pressed, String comment) async {
    final os = osVersion(Platform.operatingSystemVersion);
    if (!Platform.isAndroid) return reportBody(pressed, comment, os: os, simulator: simulatorIn(Directory.systemTemp.path));
    final view = WidgetsBinding.instance.platformDispatcher.implicitView;
    final vmService = (await developer.Service.getInfo()).serverUri?.toString();
    return reportBody(pressed, comment, os: os, platform: 'android', pixelRatio: view?.devicePixelRatio, vmService: vmService);
  }

  /// At launch and after every hot reload: tells the receiver the app runs its latest code, which is
  /// how the mod learns a fix is on screen, and where its VM service is; then follows the report
  /// the agent is working on. A report already over shows nothing, so a later reload never repeats it.
  Future<void> announceLaunch() async {
    try {
      final info = await developer.Service.getInfo();
      final answer = await _client.launched(info.serverUri?.toString(), android: Platform.isAndroid);
      final id = answer.id;
      final status = answer.status;
      if (id != null && status != null && !isOver(status)) unawaited(_follow(id));
    } catch (_) {}
  }

  Future<void> _follow(String id) async {
    final mine = ++_ticket;
    // Dispose retires the ticket too.
    while (mine == _ticket) {
      await _sleep(const Duration(seconds: 1));
      if (mine != _ticket) return;
      ReportStatus? answer;
      try {
        answer = await _client.statusOf(id);
      } catch (_) {}
      if (mine != _ticket) return;
      final status = answer?.status;
      if (answer == null || status == null) continue;
      if (isOver(status)) {
        _show(bannerFor(status, answer.agent), hideAfter: const Duration(seconds: 4));
        return;
      }
      _show(bannerFor(status, answer.agent));
    }
  }

  Future<void> _sleep(Duration duration) {
    final waited = _waited = Completer<void>();
    _waiting = Timer(duration, waited.complete);
    return waited.future;
  }

  void _show(StatusBanner shown, {Duration? hideAfter}) {
    _hiding?.cancel();
    _hiding = null;
    // The next poll's same words: nothing to redraw.
    if (hideAfter == null && banner?.text == shown.text) return;
    banner = shown;
    _changed();
    if (hideAfter != null) {
      _hiding = Timer(hideAfter, () {
        banner = null;
        _changed();
      });
    }
  }

  /// Resolves once the keyboard has slid away, or after a second.
  Future<void> _keyboardGone() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final view = WidgetsBinding.instance.platformDispatcher.implicitView;
    var late = false;
    final limit = Timer(const Duration(seconds: 1), () => late = true);
    while ((view?.viewInsets.bottom ?? 0) > 0 && !late) {
      await SchedulerBinding.instance.endOfFrame;
    }
    limit.cancel();
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
