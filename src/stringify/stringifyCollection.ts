import { Collection } from '../nodes/Collection.js'
import { addComment } from '../stringify/addComment.js'
import { stringify, StringifyContext } from '../stringify/stringify.js'
import { isNode, isPair } from '../nodes/Node.js'

type StringifyNode = { comment: boolean; str: string }

interface StringifyCollectionOptions {
  blockItem(node: StringifyNode): string
  flowChars: { start: '{'; end: '}' } | { start: '['; end: ']' }
  itemIndent: string
  onChompKeep?: () => void
  onComment?: () => void
}

export function stringifyCollection(
  { comment, flow, items }: Readonly<Collection>,
  ctx: StringifyContext,
  {
    blockItem,
    flowChars,
    itemIndent,
    onChompKeep,
    onComment
  }: StringifyCollectionOptions
) {
  const { indent, indentStep } = ctx
  const inFlow = flow || ctx.inFlow
  if (inFlow) itemIndent += indentStep
  ctx = Object.assign({}, ctx, { indent: itemIndent, inFlow, type: null })
  let chompKeep = false
  let hasItemWithNewLine = false
  const nodes = items.reduce((nodes: StringifyNode[], item, i) => {
    let comment: string | null = null
    if (isNode(item) || isPair(item)) {
      if (!chompKeep && item.spaceBefore) nodes.push({ comment: true, str: '' })

      if (item.commentBefore) {
        // This match will always succeed on a non-empty string
        for (const line of item.commentBefore.match(/^.*$/gm) as string[])
          nodes.push({ comment: true, str: `#${line}` })
      }

      if (item.comment) comment = item.comment

      const pair = item as any // Apply guards manually in the following
      if (
        inFlow &&
        ((!chompKeep && item.spaceBefore) ||
          item.commentBefore ||
          item.comment ||
          (pair.key && (pair.key.commentBefore || pair.key.comment)) ||
          (pair.value && (pair.value.commentBefore || pair.value.comment)))
      )
        hasItemWithNewLine = true
    }
    chompKeep = false
    let str = stringify(
      item,
      ctx,
      () => (comment = null),
      () => (chompKeep = true)
    )
    if (inFlow && !hasItemWithNewLine && str.includes('\n'))
      hasItemWithNewLine = true
    if (inFlow && i < items.length - 1) str += ','
    str = addComment(str, itemIndent, comment)
    if (chompKeep && (comment || inFlow)) chompKeep = false
    nodes.push({ comment: false, str })
    return nodes
  }, [])
  let str: string
  if (nodes.length === 0) {
    str = flowChars.start + flowChars.end
  } else if (inFlow) {
    const { start, end } = flowChars
    const strings = nodes.map(n => n.str)
    if (
      hasItemWithNewLine ||
      strings.reduce((sum, str) => sum + str.length + 2, 2) >
        Collection.maxFlowStringSingleLineLength
    ) {
      str = start
      for (const s of strings) {
        str += s ? `\n${indentStep}${indent}${s}` : '\n'
      }
      str += `\n${indent}${end}`
    } else {
      str = `${start} ${strings.join(' ')} ${end}`
    }
  } else {
    const strings = nodes.map(blockItem)
    str = strings.shift() || ''
    for (const s of strings) str += s ? `\n${indent}${s}` : '\n'
  }
  if (comment) {
    str += '\n' + comment.replace(/^/gm, `${indent}#`)
    if (onComment) onComment()
  } else if (chompKeep && onChompKeep) onChompKeep()
  return str
}
