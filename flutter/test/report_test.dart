import 'dart:ui';

import 'package:fixkit/src/report.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the report carries the element, its source, frame and uses, rounded', () {
    const target = Target(
      Offset(100.4, 310.6),
      Found(
        name: 'WalletCard › Text',
        source: Source('/app/lib/wallet_card.dart', 18),
        frame: Rect.fromLTWH(44.2, 299.5, 314, 22.4),
        usedAt: [Source('/app/lib/main.dart', 31)],
      ),
    );

    expect(reportBody(target, 'The name is cut off', os: '26.5', simulator: 'UDID'), {
      'os': '26.5',
      'simulator': 'UDID',
      'comment': 'The name is cut off',
      'screen': '',
      'touch': {'x': 100, 'y': 311},
      'element': {
        'name': 'WalletCard › Text',
        'file': '/app/lib/wallet_card.dart',
        'line': 18,
        'frame': {'x': 44, 'y': 300, 'width': 314, 'height': 22},
        'usedAt': [
          {'file': '/app/lib/main.dart', 'line': 31},
        ],
      },
    });
  });

  test('a touch alone, from an unknown simulator, carries neither element nor simulator', () {
    expect(reportBody(const Target(Offset(1, 2)), 'x', os: '26.5'), {
      'os': '26.5',
      'comment': 'x',
      'screen': '',
      'touch': {'x': 1, 'y': 2},
    });
  });

  test("on Android the report carries the platform and the pixel ratio the receiver reads the screen's pixels with", () {
    final body = reportBody(const Target(Offset(1, 2)), 'x', os: '6.6', platform: 'android', pixelRatio: 2.625);

    expect(body['platform'], 'android');
    expect(body['pixelRatio'], 2.625);
    expect(body.containsKey('simulator'), isFalse);
  });

  test("iOS's version as the platform words it", () {
    expect(osVersion('Version 26.5 (Build 23F77)'), '26.5');
    expect(osVersion('Version 18.0.1 (Build 22A3370)'), '18.0.1');
  });

  test("the simulator is the one whose data folder holds the app's", () {
    expect(
      simulatorIn('/Users/v/Library/Developer/CoreSimulator/Devices/B58B4D64-5C75-4D8F-AAAE-B410A62909A5/data/Containers/Data/Application/A3/tmp'),
      'B58B4D64-5C75-4D8F-AAAE-B410A62909A5',
    );
    expect(simulatorIn('/private/var/mobile/Containers/Data/Application/A3/tmp'), isNull);
  });
}
