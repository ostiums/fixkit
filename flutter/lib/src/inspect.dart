import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import 'report.dart';

/// Where the app constructs the element's widget, or null when Flutter or a package does. Debug
/// builds track widget creation (`--track-widget-creation`, on in every `flutter run`); the widget
/// inspector reads the location out and says whether it is outside the Flutter SDK.
Source? appSource(Element element) {
  final json = element.toDiagnosticsNode().toJsonMap(InspectorSerializationDelegate(service: WidgetInspectorService.instance));
  final location = json['creationLocation'];
  if (json['createdByLocalProject'] != true || location is! Map) return null;
  final file = location['file'];
  final line = location['line'];
  if (file is! String || line is! int) return null;
  final uri = Uri.tryParse(file);
  final path = uri != null && uri.scheme == 'file' ? uri.toFilePath() : file;
  // A package from pub.dev is outside the SDK too, but not the app's code.
  if (path.contains('/.pub-cache/')) return null;
  return Source(path, line);
}

/// Whether the element's widget is a class the app wrote: what its build returned is the app's too.
/// `FilledButton` builds Material's widgets; `Home` builds the app's `Scaffold`.
bool _isAppComponent(Element element) {
  final widget = element.widget;
  if (widget is! StatelessWidget && widget is! StatefulWidget) return false;
  Element? child;
  element.visitChildren((each) => child ??= each);
  return child != null && appSource(child!) != null;
}

/// The global frame of the element's render box, if it has a laid out one.
Rect? _frameOf(Element element) {
  final box = element.renderObject;
  if (box is! RenderBox || !box.attached || !box.hasSize) return null;
  return MatrixUtils.transformRect(box.getTransformTo(null), Offset.zero & box.size);
}

/// The app's widget under `touch`, at or below `host`: the deepest one the app constructed, named
/// after the app's widget class around it, or the touch alone when there is none or anything fails.
Target inspectAt(Offset touch, Element host) {
  try {
    final result = HitTestResult();
    WidgetsBinding.instance.hitTestInView(result, touch, View.of(host).viewId);
    for (final entry in result.path) {
      final target = entry.target;
      if (target is! RenderObject) continue;
      final creator = target.debugCreator;
      if (creator is! DebugCreator) continue;
      return Target(touch, _found(creator.element, host));
    }
  } catch (_) {}
  return Target(touch);
}

Found? _found(Element deepest, Element host) {
  final chain = <Element>[deepest];
  if (deepest != host) {
    deepest.visitAncestorElements((ancestor) {
      chain.add(ancestor);
      return ancestor != host;
    });
  }
  for (var index = 0; index < chain.length; index++) {
    final source = appSource(chain[index]);
    if (source == null) continue;
    final element = chain[index];
    final components = chain.skip(index + 1).where(_isAppComponent).take(2).toList();
    final type = element.widget.runtimeType.toString();
    return Found(
      name: components.isEmpty ? type : '${components.first.widget.runtimeType} › $type',
      source: source,
      frame: _frameOf(element),
      usedAt: [for (final component in components) appSource(component)].whereType<Source>().where((use) => use != source).toList(),
    );
  }
  return null;
}
