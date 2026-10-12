import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import 'report.dart';

/// Where the app constructs the element's widget, or null when Flutter or a package does. Debug
/// builds track widget creation (`--track-widget-creation`, on in every `flutter run`); the widget
/// inspector reads the location out and says whether it is outside the Flutter SDK.
Source? appSource(Element element) {
  // The cheap check first: serializing every framework element under the finger is not.
  if (!debugIsWidgetLocalCreation(element.widget)) return null;
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

/// Whether the element's widget is a class the app wrote: the app constructs it, and what its build
/// returned is the app's too. `FilledButton` builds Material's widgets; `Home` builds the app's
/// `Scaffold`; the `KeyedSubtree` Scaffold puts around its body is Scaffold's own.
bool _isAppComponent(Element element, Source? Function(Element) sourceOf) {
  final widget = element.widget;
  if (widget is! StatelessWidget && widget is! StatefulWidget) return false;
  Element? child;
  element.visitChildren((each) => child ??= each);
  return child != null && sourceOf(element) != null && sourceOf(child!) != null;
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
    // Each element's source read once: the hit entries share most of their ancestors.
    final sources = <Element, Source?>{};
    Source? sourceOf(Element element) => sources.putIfAbsent(element, () => appSource(element));
    // Every entry counts, not only the first: an iOS page's back swipe strip lies over its left
    // 20 pt, and the app's widget nearest to it is the app itself. The deepest app widget wins.
    Element? best;
    for (final entry in result.path) {
      final target = entry.target;
      if (target is! RenderObject) continue;
      final creator = target.debugCreator;
      if (creator is! DebugCreator) continue;
      final found = _appElementAt(creator.element, host, sourceOf);
      if (found != null && (best == null || found.depth > best.depth)) best = found;
    }
    if (best != null) return Target(touch, _found(best, host, sourceOf));
  } catch (_) {}
  return Target(touch);
}

/// The nearest element at or above `element` that the app constructed; null without one, or for an
/// element outside `host`.
Element? _appElementAt(Element element, Element host, Source? Function(Element) sourceOf) {
  var found = sourceOf(element) != null ? element : null;
  var inside = element == host;
  if (!inside) {
    element.visitAncestorElements((ancestor) {
      if (found == null && sourceOf(ancestor) != null) found = ancestor;
      inside = ancestor == host;
      return !inside;
    });
  }
  return inside ? found : null;
}

/// The app's `element`, named after the app's widget classes above it, up to `host`.
Found _found(Element element, Element host, Source? Function(Element) sourceOf) {
  final source = sourceOf(element)!;
  final components = <Element>[];
  if (element != host) {
    element.visitAncestorElements((ancestor) {
      if (_isAppComponent(ancestor, sourceOf)) components.add(ancestor);
      return components.length < 2 && ancestor != host;
    });
  }
  final type = element.widget.runtimeType.toString();
  return Found(
    name: components.isEmpty ? type : '${components.first.widget.runtimeType} › $type',
    source: source,
    frame: _frameOf(element),
    usedAt: [for (final component in components) sourceOf(component)].whereType<Source>().where((use) => use != source).toList(),
  );
}
