import 'dart:async';
import 'dart:convert';
import 'dart:io';

// Talks to the receiver the fixkit mod runs on this Mac. The simulator shares the Mac's loopback
// interface, so no address has to be configured; `--dart-define=FIXKIT_PORT=…` picks another port.
const _port = String.fromEnvironment('FIXKIT_PORT', defaultValue: '4747');

/// The receiver's answer about a report: its id and where Claude is with it.
class ReportStatus {
  const ReportStatus(this.id, this.status);

  final String? id;
  final String? status;
}

class Client {
  final _base = Uri.parse('http://127.0.0.1:$_port');

  Future<Object?> _call(String method, String path, {Object? body, required Duration timeout}) async {
    final http = HttpClient()..connectionTimeout = const Duration(seconds: 2);
    try {
      return await () async {
        final request = await http.openUrl(method, _base.resolve(path));
        if (body != null) {
          request.headers.contentType = ContentType.json;
          request.write(jsonEncode(body));
        }
        final response = await request.close();
        final text = await response.transform(utf8.decoder).join();
        if (response.statusCode != 200) throw HttpException('$path answered ${response.statusCode}');
        return jsonDecode(text);
      }().timeout(timeout);
    } finally {
      http.close(force: true);
    }
  }

  static ReportStatus _status(Object? json) {
    final map = json is Map ? json : const {};
    return ReportStatus(map['id'] as String?, map['status'] as String?);
  }

  /// Sends the report and returns its id. The receiver answers once it has read the screen.
  Future<String> sendReport(Map<String, Object> body) async {
    final receipt = await _call('POST', '/report', body: body, timeout: const Duration(seconds: 20));
    return (receipt as Map)['id'] as String;
  }

  Future<ReportStatus> statusOf(String id) async =>
      _status(await _call('GET', '/status?id=${Uri.encodeQueryComponent(id)}', timeout: const Duration(seconds: 3)));

  /// Says the app is up with its latest code, and where its VM service is, which the receiver hot
  /// reloads it through; answers the report Claude is working on, else the newest.
  Future<ReportStatus> launched(String? vmService) async => _status(
    await _call('POST', '/launched', body: {'vmService': ?vmService}, timeout: const Duration(seconds: 3)),
  );
}
