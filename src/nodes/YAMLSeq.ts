import type { Schema } from '../schema/Schema.js'
import type { StringifyContext } from '../stringify/stringify.js'
import { stringifyCollection } from '../stringify/stringifyCollection.js'
import { Collection } from './Collection.js'
import { isScalar, ParsedNode, SEQ } from './Node.js'
import type { Pair } from './Pair.js'
import { isScalarValue } from './Scalar.js'
import { toJS, ToJSContext } from './toJS.js'

export declare namespace YAMLSeq {
  interface Parsed<
    T extends ParsedNode | Pair<ParsedNode, ParsedNode | null> = ParsedNode
  > extends YAMLSeq<T> {
    items: T[]
    range: [number, number]
  }
}

export class YAMLSeq<T = unknown> extends Collection {
  static get tagName(): 'tag:yaml.org,2002:seq' {
    return 'tag:yaml.org,2002:seq'
  }

  items: T[] = []

  constructor(schema?: Schema) {
    super(SEQ, schema)
  }

  add(value: T) {
    this.items.push(value)
  }

  /**
   * Removes a value from the collection.
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   *
   * @returns `true` if the item was found and removed.
   */
  delete(key: unknown) {
    const idx = asItemIndex(key)
    if (typeof idx !== 'number') return false
    const del = this.items.splice(idx, 1)
    return del.length > 0
  }

  /**
   * Returns item at `key`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   */
  get(key: unknown, keepScalar?: boolean) {
    const idx = asItemIndex(key)
    if (typeof idx !== 'number') return undefined
    const it = this.items[idx]
    return !keepScalar && isScalar(it) ? it.value : it
  }

  /**
   * Checks if the collection includes a value with the key `key`.
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   */
  has(key: unknown) {
    const idx = asItemIndex(key)
    return typeof idx === 'number' && idx < this.items.length
  }

  /**
   * Sets a value in this collection. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   *
   * If `key` does not contain a representation of an integer, this will throw.
   * It may be wrapped in a `Scalar`.
   */
  set(key: unknown, value: T) {
    const idx = asItemIndex(key)
    if (typeof idx !== 'number')
      throw new Error(`Expected a valid index, not ${key}.`)
    const prev = this.items[idx]
    if (isScalar(prev) && isScalarValue(value)) prev.value = value
    else this.items[idx] = value
  }

  toJSON(_?: unknown, ctx?: ToJSContext) {
    const seq: unknown[] = []
    if (ctx && ctx.onCreate) ctx.onCreate(seq)
    let i = 0
    for (const item of this.items) seq.push(toJS(item, String(i++), ctx))
    return seq
  }

  toString(
    ctx?: StringifyContext,
    onComment?: () => void,
    onChompKeep?: () => void
  ): string {
    if (!ctx) return JSON.stringify(this)
    return stringifyCollection(this, ctx, {
      blockItem: n => (n.comment ? n.str : `- ${n.str}`),
      flowChars: { start: '[', end: ']' },
      itemIndent: (ctx.indent || '') + '  ',
      onChompKeep,
      onComment
    })
  }
}

function asItemIndex(key: unknown): number | null {
  let idx = isScalar(key) ? key.value : key
  if (idx && typeof idx === 'string') idx = Number(idx)
  return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0
    ? idx
    : null
}
