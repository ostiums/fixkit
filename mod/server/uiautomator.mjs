// Android's accessibility tree, as `uiautomator dump` writes it, in the shape AXe gives the iOS one,
// so one lookup reads both. React Native and Flutter expose their texts and controls to Android's
// accessibility as they do to iOS's. No dependencies: the dump is flat enough for two expressions.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const unescape = text =>
  text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, name) => {
    if (name[0] !== '#') return ENTITIES[name] ?? whole
    return String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1)))
  })

/** `[left,top][right,bottom]` in pixels, as a frame in the touch's units. */
function frameOf(bounds, ratio) {
  const [left, top, right, bottom] = (bounds?.match(/-?\d+/g) ?? [0, 0, 0, 0]).map(Number)
  return { x: left / ratio, y: top / ratio, width: (right - left) / ratio, height: (bottom - top) / ratio }
}

/** One node in AXe's words: a description names it, and then its text is its value. */
function element(attributes, ratio) {
  const text = attributes.text || null
  const description = attributes['content-desc'] || null
  const id = attributes['resource-id'] || null
  return {
    type: attributes.class?.split('.').at(-1) || 'View',
    AXLabel: description ?? text,
    AXValue: description && text && text !== description ? text : null,
    // A testID or a semantics identifier comes as it was set; `package:id/name` is an id of
    // Android's layouts (`android:id/content`, AppCompat's action bar), no part of the app.
    AXUniqueId: id?.includes(':id/') ? null : id,
    frame: frameOf(attributes.bounds, ratio),
    children: [],
  }
}

const hasText = node => Boolean(node.AXLabel || node.AXValue) || node.children.some(hasText)

/**
 * The dump's roots with frames divided by `ratio`, the device's pixels per unit of the app's touch;
 * null when the text is no dump, or names nothing, as when Flutter has not built its semantics yet.
 */
export function parseHierarchy(xml, ratio) {
  const start = xml.indexOf('<hierarchy')
  const end = xml.indexOf('</hierarchy>')
  if (start === -1 || end === -1) return null

  // Each node's attributes, or null where one closes.
  const tags = [...xml.slice(start, end).matchAll(/<node\b([^>]*?)(\/?)>|<\/node>/g)].map(([, attributes, closed]) =>
    attributes === undefined
      ? null
      : { closed, read: Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, unescape(value)])) },
  )
  // The app's touch is measured from its content, which a window that isn't edge to edge starts
  // below the status bar; the dump measures from the screen's corner.
  const content = tags.find(tag => tag?.read['resource-id'] === 'android:id/content')
  const [left, top] = content?.read.bounds?.match(/-?\d+/g)?.map(Number) ?? [0, 0]

  const roots = []
  const open = []
  for (const tag of tags) {
    if (tag === null) {
      open.pop()
      continue
    }
    const node = element(tag.read, ratio)
    node.frame.x -= left / ratio
    node.frame.y -= top / ratio
    ;(open.at(-1)?.children ?? roots).push(node)
    if (!tag.closed) open.push(node)
  }
  return roots.some(hasText) ? roots : null
}
