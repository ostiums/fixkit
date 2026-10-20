import 'package:fixkit/src/client.dart';
import 'package:fixkit/src/report.dart';
import 'package:fixkit/src/session.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeClient extends Client {
  final reports = <Map<String, Object>>[];
  String? Function() answer = () => 'r1';
  String agent = 'Claude Code';

  @override
  Future<Receipt> sendReport(Map<String, Object> body) async {
    reports.add(body);
    final id = answer();
    if (id == null) throw Exception('offline');
    return Receipt(id, agent);
  }

  @override
  Future<ReportStatus> statusOf(String id) async => ReportStatus(id, 'live', agent);

  @override
  Future<ReportStatus> launched(String? vmService, {bool android = false}) async => ReportStatus(null, null, agent);
}

const target = Target(Offset(10, 20), Found(name: 'Card › Text'));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('a draft of spaces cannot be sent; a word can', () {
    final session = Session(client: FakeClient())..begin(target);
    session.setDraft('   ');
    expect(session.canSend, isFalse);
    session.setDraft(' Make it bold ');
    expect(session.canSend, isTrue);
  });

  test('a second long press while the composer is open is ignored', () {
    final session = Session(client: FakeClient())..begin(target);
    session.begin(const Target(Offset(1, 1)));
    expect(session.target, same(target));
  });

  testWidgets('sending closes the composer and reports the trimmed comment', (tester) async {
    final client = FakeClient();
    final session = Session(client: client)..begin(target);
    session.setDraft(' Make it bold ');
    final sending = session.send();
    expect(session.target, isNull);
    expect(session.sending, isTrue);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    await sending;

    expect(client.reports.single['comment'], 'Make it bold');
    expect(session.sending, isFalse);
    expect(session.banner?.text, 'Sent to Claude Code');
    session.dispose();
  });

  testWidgets('a receiver that does not answer shows it is not listening', (tester) async {
    final client = FakeClient()..answer = () => null;
    final session = Session(client: client)..begin(target);
    session.setDraft('x');
    final sending = session.send();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    await sending;

    expect(session.banner?.text, 'FixKit is not listening');
    await tester.pump(const Duration(seconds: 5));
    expect(session.banner, isNull);
    session.dispose();
  });

  testWidgets('the banner names the agent the receiver answers with', (tester) async {
    final client = FakeClient()..agent = 'Codex';
    final session = Session(client: client)..begin(target);
    session.setDraft('x');
    final sending = session.send();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    await sending;

    expect(session.banner?.text, 'Sent to Codex');
    session.dispose();
  });
}
