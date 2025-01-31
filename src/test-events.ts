import { Document } from './doc/Document.js'
import {
  isAlias,
  isCollection,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  Node,
  ParsedNode
} from './nodes/Node.js'
import type { Pair } from './nodes/Pair.js'
import type { Scalar } from './nodes/Scalar.js'
import { parseAllDocuments } from './public-api.js'
import { visit } from './visit.js'

const scalarChar: Record<string, string> = {
  BLOCK_FOLDED: '>',
  BLOCK_LITERAL: '|',
  PLAIN: ':',
  QUOTE_DOUBLE: '"',
  QUOTE_SINGLE: "'"
}

function anchorExists(doc: Document, anchor: string): boolean {
  let found = false
  visit(doc, {
    Value(_key: unknown, node: Node) {
      if (node.anchor === anchor) {
        found = true
        return visit.BREAK
      }
    }
  })
  return found
}

// test harness for yaml-test-suite event tests
export function testEvents(src: string) {
  const docs = parseAllDocuments(src)
  const errDoc = docs.find(doc => doc.errors.length > 0)
  const error = errDoc ? errDoc.errors[0].message : null
  const events = ['+STR']
  try {
    for (let i = 0; i < docs.length; ++i) {
      const doc = docs[i]
      let root = doc.contents
      if (Array.isArray(root)) root = root[0]
      const [rootStart, rootEnd] = doc.range || [0, 0]
      const error = doc.errors[0]
      if (error && (!error.offset || error.offset < rootStart))
        throw new Error()
      let docStart = '+DOC'
      if (doc.directives.marker) docStart += ' ---'
      else if (doc.contents && doc.contents.range[1] === doc.contents.range[0])
        continue
      events.push(docStart)
      addEvents(events, doc, error?.offset ?? -1, root)

      let docEnd = '-DOC'
      if (rootEnd) {
        const post = src.slice(rootStart, rootEnd)
        if (/^\.\.\.($|\s)/m.test(post)) docEnd += ' ...'
      }
      events.push(docEnd)
    }
  } catch (e) {
    return { events, error: error || e }
  }
  events.push('-STR')
  return { events, error }
}

function addEvents(
  events: string[],
  doc: Document,
  errPos: number,
  node: ParsedNode | Pair<ParsedNode, ParsedNode | null> | null
) {
  if (!node) {
    events.push('=VAL :')
    return
  }
  if (errPos !== -1 && isNode(node) && node.range[0] >= errPos)
    throw new Error()
  let props = ''
  let anchor = isScalar(node) || isCollection(node) ? node.anchor : undefined
  if (anchor) {
    if (/\d$/.test(anchor)) {
      const alt = anchor.replace(/\d$/, '')
      if (anchorExists(doc, alt)) anchor = alt
    }
    props = ` &${anchor}`
  }
  if (node.tag) props += ` <${node.tag}>`

  if (isMap(node)) {
    events.push(`+MAP${props}`)
    node.items.forEach(({ key, value }) => {
      addEvents(events, doc, errPos, key)
      addEvents(events, doc, errPos, value)
    })
    events.push('-MAP')
  } else if (isSeq(node)) {
    events.push(`+SEQ${props}`)
    node.items.forEach(item => {
      addEvents(events, doc, errPos, item)
    })
    events.push('-SEQ')
  } else if (isPair(node)) {
    events.push(`+MAP${props}`)
    addEvents(events, doc, errPos, node.key)
    addEvents(events, doc, errPos, node.value)
    events.push('-MAP')
  } else if (isAlias(node)) {
    let alias = node.source
    if (alias && /\d$/.test(alias)) {
      const alt = alias.replace(/\d$/, '')
      if (anchorExists(doc, alt)) alias = alt
    }
    events.push(`=ALI${props} *${alias}`)
  } else {
    const scalar = scalarChar[String(node.type)]
    if (!scalar) throw new Error(`Unexpected node type ${node.type}`)
    const value = (node as Scalar.Parsed).source
      .replace(/\\/g, '\\\\')
      .replace(/\0/g, '\\0')
      .replace(/\x07/g, '\\a')
      .replace(/\x08/g, '\\b')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\v/g, '\\v')
      .replace(/\f/g, '\\f')
      .replace(/\r/g, '\\r')
      .replace(/\x1b/g, '\\e')
    events.push(`=VAL${props} ${scalar}${value}`)
  }
}
