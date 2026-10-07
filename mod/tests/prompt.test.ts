import { expect, test } from 'claude-code/testing'

import type { Accessibility } from '../types'
import {
  INSTRUCTIONS,
  RN_INSTRUCTIONS,
  describeAccessibility,
  isBuildAndRun,
  isReactNativeProject,
  pressedLabel,
  promptFor,
} from '../hooks/prompt'

const amount: Accessibility = {
  element: {
    type: 'StaticText',
    label: '+€4,650.00',
    value: null,
    identifier: null,
  },
  within: null,
  nearby: ['Northwind GmbH', 'Salary, September'],
}

test('an unmarked element is named by accessibility and the screen', () => {
  const prompt = promptFor(
    {
      id: 'r1',
      comment: 'Income should be green',
      screen: 'Activity',
      screenshot: '.fixkit/reports/r1.png',
      touch: { x: 321, y: 686 },
      accessibility: amount,
    },
    null,
  )

  expect(prompt).toBe(
    'Income should be green\n\n' +
      '[fix r1] StaticText "+€4,650.00" near "Northwind GmbH", "Salary, September" · Activity screen · .fixkit/reports/r1.png',
  )
})

test('a marked element leads with its name and source line', () => {
  const prompt = promptFor(
    {
      id: 'r2',
      comment: 'This button is out of line',
      screen: 'Home',
      screenshot: '.fixkit/reports/r2.png',
      element: { name: 'home.quickActions.send', file: '/p/App/QuickActions.swift', line: 8 },
      accessibility: {
        element: { ...amount.element, type: 'Button', label: 'Send' },
        within: null,
        nearby: [],
      },
    },
    'App/QuickActions.swift:8',
  )

  expect(prompt).toBe(
    'This button is out of line\n\n' +
      '[fix r2] home.quickActions.send · App/QuickActions.swift:8 · Button "Send" · .fixkit/reports/r2.png',
  )
})

test('with nothing known, the touch point stands in', () => {
  const prompt = promptFor(
    { id: 'r3', comment: 'Too dark', screen: '', screenshot: null, touch: { x: 120.4, y: 339.6 }, accessibility: null },
    null,
  )

  expect(prompt).toBe('Too dark\n\n[fix r3] touch at 120,340')
})

test('a UIKit view named after its property leads with that name', () => {
  const prompt = promptFor(
    {
      id: 'r4',
      comment: 'The name is cut off',
      screen: 'ProfileViewController',
      screenshot: '.fixkit/reports/r4.png',
      element: { name: 'ProfileViewController.nameLabel' },
      viewDescription: 'UILabel "Alex Morgan"',
      accessibility: { element: { ...amount.element, label: 'Alex Morgan' }, within: null, nearby: [] },
    },
    null,
  )

  expect(prompt).toBe(
    'The name is cut off\n\n' +
      '[fix r4] ProfileViewController.nameLabel · UILabel "Alex Morgan" · .fixkit/reports/r4.png',
  )
})

test("in a UIKit app the app's own description wins over accessibility, which can read a view under a sheet", () => {
  const prompt = promptFor(
    {
      id: 'r6',
      comment: 'Too close to the edge',
      screen: 'SheetViewController',
      screenshot: null,
      viewDescription: 'UIView',
      accessibility: { element: { ...amount.element, type: 'Button', label: 'Pay' }, within: null, nearby: [] },
    },
    null,
  )

  expect(prompt).toBe('Too close to the edge\n\n[fix r6] UIView · SheetViewController screen')
})

test("without accessibility, the app's own description of the view still names it", () => {
  const prompt = promptFor(
    {
      id: 'r5',
      comment: 'Make it bold',
      screen: 'ProfileViewController',
      screenshot: '.fixkit/reports/r5.png',
      viewDescription: 'UILabel "Alex Morgan"',
      accessibility: null,
    },
    null,
  )

  expect(prompt).toBe(
    'Make it bold\n\n[fix r5] UILabel "Alex Morgan" · ProfileViewController screen · .fixkit/reports/r5.png',
  )
})

test('an icon is described with the control around it and its value', () => {
  expect(
    describeAccessibility({
      element: { ...amount.element, type: 'Image', label: 'chart column', identifier: 'chart.bar.fill' },
      within: { ...amount.element, type: 'RadioButton', label: 'Activity', identifier: 'chart.bar' },
      nearby: [],
    }),
  ).toBe('Image "chart column" #chart.bar.fill in RadioButton "Activity" #chart.bar')
  expect(describeAccessibility({ element: { ...amount.element, type: 'GenericElement', label: 'Shop', value: '493' }, within: null, nearby: [] })).toBe(
    'GenericElement "Shop" = "493"',
  )
})

test('the pane names a marked element, else what accessibility said, else the screen', () => {
  expect(pressedLabel({ element: 'home.quickActions.send', accessibility: amount, viewDescription: null, screen: 'Home' })).toBe('home.quickActions.send')
  expect(pressedLabel({ element: null, accessibility: amount, viewDescription: null, screen: 'Activity' })).toBe(
    'StaticText "+€4,650.00" near "Northwind GmbH", "Salary, September"',
  )
  expect(pressedLabel({ element: null, accessibility: null, viewDescription: null, screen: 'Activity' })).toBe('Activity screen')
  expect(pressedLabel({ element: null, accessibility: null, viewDescription: 'UILabel "Alex Morgan"', screen: 'ProfileViewController' })).toBe(
    'UILabel "Alex Morgan"',
  )
  expect(pressedLabel({ element: null, accessibility: null, viewDescription: null, screen: '' })).toBe('unnamed element')
})

test("XcodeBuildMCP's build-and-run shows as rebuilding, whatever server name it has", () => {
  expect(isBuildAndRun('mcp__XcodeBuildMCP__build_run_sim')).toBe(true)
  expect(isBuildAndRun('mcp__plugin_x_XcodeBuildMCP__build_run_sim')).toBe(true)
  expect(isBuildAndRun('mcp__XcodeBuildMCP__build_sim')).toBe(false)
  expect(isBuildAndRun('Bash')).toBe(false)
})

test('a React Native element leads with its components, its JSX line and where it is used', () => {
  const prompt = promptFor(
    {
      id: 'r7',
      comment: 'The name is cut off',
      screen: '',
      screenshot: '.fixkit/reports/r7.png',
      element: { name: 'WalletCard › Text', file: '/p/src/WalletCard.tsx', line: 18, usedAt: [{ file: '/p/App.tsx', line: 31 }] },
      accessibility: { element: { ...amount.element, label: 'Alex Morgan' }, within: null, nearby: [] },
    },
    'src/WalletCard.tsx:18',
    ['App.tsx:31'],
  )

  expect(prompt).toBe(
    'The name is cut off\n\n' +
      '[fix r7] WalletCard › Text · src/WalletCard.tsx:18 · used at App.tsx:31 · StaticText "Alex Morgan" · .fixkit/reports/r7.png',
  )
})

test('a package.json that depends on React Native makes a React Native project', () => {
  const app = JSON.stringify({ dependencies: { expo: '~57.0.27', react: '19.2.3', 'react-native': '0.86.3' } })
  expect(isReactNativeProject(app)).toBe(true)
  expect(isReactNativeProject(JSON.stringify({ devDependencies: { 'react-native': '0.86.3' } }))).toBe(true)
  expect(isReactNativeProject(JSON.stringify({ dependencies: { react: '19.2.3' } }))).toBe(false)
  expect(isReactNativeProject('not json')).toBe(false)
  expect(isReactNativeProject(null)).toBe(false)

  expect(RN_INSTRUCTIONS).toContain('Fast Refresh')
  expect(INSTRUCTIONS).not.toContain('React Native')
})
