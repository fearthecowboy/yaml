import { anchorIsValid } from '../doc/anchors'
import type { Document } from '../doc/Document'
import type { StringifyContext } from '../stringify/stringify.js'
import { visit } from '../visit'
import { ALIAS, isAlias, isCollection, isPair, Node, NodeBase } from './Node.js'
import type { Scalar } from './Scalar'
import type { ToJSContext } from './toJS.js'
import type { YAMLMap } from './YAMLMap'
import type { YAMLSeq } from './YAMLSeq'

export declare namespace Alias {
  interface Parsed extends Alias {
    range: [number, number]
  }
}

export class Alias extends NodeBase {
  source: string

  declare anchor?: never

  constructor(source: string) {
    super(ALIAS)
    this.source = source
    Object.defineProperty(this, 'tag', {
      set() {
        throw new Error('Alias nodes cannot have tags')
      }
    })
  }

  /**
   * Resolve the value of this alias within `doc`, finding the last
   * instance of the `source` anchor before this node.
   */
  resolve(doc: Document): Scalar | YAMLMap | YAMLSeq | undefined {
    let found: Scalar | YAMLMap | YAMLSeq | undefined = undefined
    visit(doc, {
      Node: (_key: unknown, node: Node) => {
        if (node === this) return visit.BREAK
        if (node.anchor === this.source) found = node
      }
    })
    return found
  }

  toJSON(_arg?: unknown, ctx?: ToJSContext) {
    if (!ctx) return { source: this.source }
    const { anchors, doc, maxAliasCount } = ctx
    const source = this.resolve(doc)
    if (!source) {
      const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`
      throw new ReferenceError(msg)
    }
    const data = anchors.get(source)
    /* istanbul ignore if */
    if (!data || data.res === undefined) {
      const msg = 'This should not happen: Alias anchor was not resolved?'
      throw new ReferenceError(msg)
    }
    if (maxAliasCount >= 0) {
      data.count += 1
      if (data.aliasCount === 0)
        data.aliasCount = getAliasCount(doc, source, anchors)
      if (data.count * data.aliasCount > maxAliasCount) {
        const msg =
          'Excessive alias count indicates a resource exhaustion attack'
        throw new ReferenceError(msg)
      }
    }
    return data.res
  }

  toString(
    ctx?: StringifyContext,
    _onComment?: () => void,
    _onChompKeep?: () => void
  ) {
    const src = `*${this.source}`
    if (ctx) {
      anchorIsValid(this.source)
      if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
        const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`
        throw new Error(msg)
      }
      if (ctx.implicitKey) return `${src} `
    }
    return src
  }
}

function getAliasCount(
  doc: Document,
  node: unknown,
  anchors: ToJSContext['anchors']
): number {
  if (isAlias(node)) {
    const source = node.resolve(doc)
    const anchor = anchors && source && anchors.get(source)
    return anchor ? anchor.count * anchor.aliasCount : 0
  } else if (isCollection(node)) {
    let count = 0
    for (const item of node.items) {
      const c = getAliasCount(doc, item, anchors)
      if (c > count) count = c
    }
    return count
  } else if (isPair(node)) {
    const kc = getAliasCount(doc, node.key, anchors)
    const vc = getAliasCount(doc, node.value, anchors)
    return Math.max(kc, vc)
  }
  return 1
}
