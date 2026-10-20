import 'dart:ui';

/// A place in the app's code: a file and a line.
class Source {
  const Source(this.file, this.line);

  final String file;
  final int line;

  Map<String, Object> toJson() => {'file': file, 'line': line};

  @override
  bool operator ==(Object other) => other is Source && other.file == file && other.line == line;

  @override
  int get hashCode => Object.hash(file, line);
}

/// The app's widget under a touch: its name, where it is constructed, its frame and where the
/// widgets around it are used, nearest first.
class Found {
  const Found({required this.name, this.source, this.frame, this.usedAt = const []});

  final String name;
  final Source? source;
  final Rect? frame;
  final List<Source> usedAt;
}

/// What the long press captured, before the comment is typed.
class Target {
  const Target(this.touch, [this.element]);

  final Offset touch;
  final Found? element;
}

/// The report as the receiver takes it. The receiver takes the screenshot with the outline drawn,
/// and reads what accessibility says, from the simulator named, or the one booted on `os`; on
/// Android from the device online, whose screen's pixels it reads with `pixelRatio`.
Map<String, Object> reportBody(
  Target target,
  String comment, {
  required String os,
  String? simulator,
  bool android = false,
  double? pixelRatio,
}) {
  final element = target.element;
  final frame = element?.frame;
  return {
    'os': os,
    'simulator': ?simulator,
    if (android) 'platform': 'android',
    'pixelRatio': ?pixelRatio,
    'comment': comment,
    'screen': '',
    'touch': {'x': target.touch.dx.round(), 'y': target.touch.dy.round()},
    if (element != null)
      'element': {
        'name': element.name,
        if (element.source case final source?) ...source.toJson(),
        if (frame != null)
          'frame': {'x': frame.left.round(), 'y': frame.top.round(), 'width': frame.width.round(), 'height': frame.height.round()},
        if (element.usedAt.isNotEmpty) 'usedAt': [for (final use in element.usedAt) use.toJson()],
      },
  };
}

/// iOS's version out of the platform's words for it: `Version 26.5 (Build 23F77)` is `26.5`.
String osVersion(String platformVersion) => RegExp(r'\d+(?:\.\d+)+').firstMatch(platformVersion)?.group(0) ?? platformVersion;

/// The simulator whose data folder holds `path`, the app's temporary folder, say; null on a device.
String? simulatorIn(String path) => RegExp(r'/CoreSimulator/Devices/([0-9A-Fa-f-]{36})/').firstMatch(path)?.group(1);
