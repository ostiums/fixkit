import 'package:flutter/material.dart';

const _actions = ['Send', 'Top up', 'Request'];

/// Each button counts its presses, so a press that should not have happened shows.
class QuickActions extends StatefulWidget {
  const QuickActions({super.key});

  @override
  State<QuickActions> createState() => _QuickActionsState();
}

class _QuickActionsState extends State<QuickActions> {
  final _presses = <String, int>{};

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final action in _actions) ...[
          if (action != _actions.first) const SizedBox(width: 12),
          Expanded(
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => setState(() => _presses[action] = (_presses[action] ?? 0) + 1),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Column(
                    children: [
                      Text(action, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF1F1B16))),
                      const SizedBox(height: 2),
                      Text('${_presses[action] ?? 0}', style: const TextStyle(fontSize: 12, color: Color(0xFF8A8178))),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
