// @ts-ignore
import rangeRegex from 'to-regex-range'

/**
 * Key literals for condition attributes.
 * Behaviour alternates depending on `matchWord` option.
 */
export enum ConditionKey {
  is,       // Match whole input
  starts,   // Match beginning / first word
  ends,     // Match end / last word
  contains, // Match part / word
  excludes, // Negative match part / word
  after,    // Match anything after value / next word
  before,   // Match anything before value / prev word
  range     // Match a given range (only between 0-999, otherwise use regexp)
}
export type ConditionKeys = keyof typeof ConditionKey

/** One or more condition key/value pairs. */
export type Condition = {
  [key in ConditionKeys]?: string | string[]
}

/** Collection of condition types assigned to named keys. */
export type ConditionCollection = {
  [key: string]: Condition
}

/** Type guard to check type of Condition. */
function isCondition (c: any): c is Condition {
  if (!Object.keys(c).length) return false
  for (let key in c) {
    const validKeys = Object.keys(ConditionKey).filter((k) => {
      return isNaN(Number(k)) === true
    })
    if (validKeys.indexOf(key) < 0) return false
  }
  return true
}

/** Type guard to check type of ConditionCollection */
function isConditionCollection (c: any): c is ConditionCollection {
  if (!Object.keys(c).length) return false
  for (let key in c) {
    if (!isCondition(c[key])) return false
  }
  return true
}

/** Interface for condition options, matching modifiers. */
export interface IConditionOptions {
  [key: string]: any
  matchWord?: boolean         // apply word boundaries to regex patterns
  ignoreCase?: boolean        // ignore case on regex patterns
  ignorePunctuation?: boolean // make punctuation optional for matching
}

const _defaults: IConditionOptions = {
  matchWord: true,
  ignoreCase: true,
  ignorePunctuation: false
}

/**
 * Utils for converting semantic key/value condition to regex capture groups.
 * Also accepts straight regex or strings to convert to regex.
 */
export class Expression {
  /** Convert strings to regular expressions */
  fromString (str: string) {
    const match = str.match(new RegExp('^/(.+)/(.*)$'))
    let re: RegExp | null = null
    if (match) re = new RegExp(match[1], match[2])
    if (!match || !(re instanceof RegExp)) {
      throw new Error(`[expression] ${str} can not convert to expression`)
    }
    return re
  }

  /** Escape any special regex characters */
  escape (str: string) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')
  }

  /**
   * Create regex for a value from various condition types
   * @todo combining patterns only works in correct order - can do better
   * @todo make this function modular for better testing of each logic piece
   */
  fromCondition (
    condition: Condition,
    options: IConditionOptions = _defaults
  ) {
    const config = Object.assign({}, _defaults, options)
    const b = (config.matchWord) ? '\\b' : '' // word boundary regex toggle
    const i = (config.ignoreCase) ? 'i' : ''  // ignore case flag toggle
    const p = (config.ignorePunctuation)
      ? `\\,\\-\\:\\[\\]\\/\\(\\)\\+\\?\\.\\'\\$`
      : '\\,\\-\\:'

    const patterns: string[] = []
    for (let cKey of Object.keys(condition)) {
      const type = (cKey as ConditionKeys)
      let value = condition[type]
      if (typeof value === 'string') value = [value]
      value = value!.map((v) => (type === 'range') ? v : this.escape(v))
      if (config.ignorePunctuation) {
        value = value.map((v) => v.replace(/([^\\\w\s])/g, '$1+'))
      }
      value = value.join('|') // make all values options for match
      switch (type) {
        case 'is': patterns.push(`^(${value})$`); break
        case 'starts': patterns.push(`^(?:${value})${b}`); break
        case 'ends': patterns.push(`${b}(?:${value})$`); break
        case 'contains': patterns.push(`${b}(${value})${b}`); break
        case 'excludes': patterns.push(`^((?!${b}${value}${b}).)*$`); break
        case 'after': patterns.push(`(?:${value}\\s?)([\\w\\-\\s${p}]+)`); break
        case 'before': patterns.push(`([\\w\\-\\s${p}]+)(?:\\s?${value})`); break
        case 'range':
          const rangeExp = rangeRegex(value.split('-')[0], value.split('-')[1])
          patterns.push(`${b}(${rangeExp})${b}`)
          break
      }
    }

    for (let i in patterns) {
      // leave last pattern unchanged
      const next = parseInt(i, 10) + 1
      if (!patterns[next]) break

      // remove duplicate patterns (first occurrence), e.g. from before then after
      const groups = patterns[i].match(/(\(.+?\))/g)
      if (groups && groups[1] && patterns[next].indexOf(groups[1]) === 0) {
        patterns[i] = patterns[i].replace(groups[1], '')
      }

      // convert all capture groups to non-capture (last pattern exempted)
      const newGroups = patterns[i].match(/(\(.+?\))/g)
      if (newGroups) {
        patterns[i] = newGroups.map((group) => (group.indexOf('(?') !== 0)
          ? group.replace('(', '(?:')
          : group
        ).join('')
      }
    }
    if (!patterns.length) return new RegExp(/.*/, i)

    // combine multiple condition type patterns, capturing only the last
    const regex = (patterns.length > 1)
      ? new RegExp(`${patterns.join('')}`, i)
      : new RegExp(patterns[0], i)
    return regex
  }
}

export const expression = new Expression()

/**
 * Convert range of arguments into a collection of regular expressions.
 * Config changes flags and filtering. Multiple conditions can be combined.
 */
export class Conditions {
  config: IConditionOptions
  expressions: { [key: string]: RegExp } = {}
  matches: {
    [key: string]: any
    [key: number]: any
  } = {}
  captures: {
    [key: string]: string | undefined
    [key: number]: string | undefined
  } = {}

  /**
   * Created new conditions instance.
   * Generate expressions from conditions and options.
   */
  constructor (
    condition?: string | RegExp | Condition | Condition[] | ConditionCollection,
    options: IConditionOptions = {}
  ) {
    this.config = Object.assign({}, _defaults, options)
    if (!condition) return
    if (
      typeof condition === 'string' ||
      condition instanceof RegExp ||
      isCondition(condition)
    ) {
      this.add(condition)
    } else if (condition instanceof Array) {
      for (let c of condition) this.add(c)
    } else if (isConditionCollection(condition)) {
      for (let key in condition) this.add(condition[key], key)
    }
  }

  /**
   * Add new condition, converted to regular expression.
   * Assigns to either an integer index (as string), or a given key.
   * Returns self for chaining multiple additions.
   */
  add (condition: string | RegExp | Condition, key?: string | number) {
    if (!key) key = Object.keys(this.expressions).length
    if (condition instanceof RegExp) {
      this.expressions[key] = condition
    } else if (typeof condition === 'string') {
      this.expressions[key] = expression.fromString(condition)
    } else {
      this.expressions[key] = expression.fromCondition(condition, this.config)
    }
    return this
  }

  /** Test a string against all expressions. */
  exec (str: string) {
    for (let key in this.expressions) {
      const match: any = str.match(this.expressions[key])
      this.matches[key] = match
      this.captures[key] = (match && typeof match[1] === 'string')
        ? match[1].replace(/(^[\,\-\:\s]*)|([\,\-\:\s]*$)/g, '')
        : undefined
    }
    return this.matches
  }

  /** Get cumulative success (all matches truthy). */
  get success () {
    return (Object.keys(this.matches).every((key) => this.matches[key]))
  }

  /** Get success of all matches or the first match object if only one */
  get match () {
    let matchKeys = Object.keys(this.matches)
    return (matchKeys.length > 1)
      ? this.success
      : this.matches[matchKeys[0]]
  }

  /** Get the result of all matches or the first if only one and no keys used */
  get matched () {
    let matchKeys = Object.keys(this.matches)
    if (
      matchKeys.length > 1 ||
      matchKeys.some((key) => isNaN(parseInt(key, 10)))
    ) return this.matches
    else if (matchKeys.length === 1) return this.matches[matchKeys[0]]
  }

  /** Get all captured strings, or the first if only one and no keys used */
  get captured () {
    let matchKeys = Object.keys(this.matches)
    if (
      matchKeys.length > 1 ||
      matchKeys.some((key) => isNaN(parseInt(key, 10)))
    ) return this.captures
    else if (matchKeys.length === 1) return this.captures[matchKeys[0]]
  }

  /** Clear results but keep expressions and config. */
  clear () {
    this.matches = {}
    this.captures = {}
  }

  /** Clear expressions too, just keep config. */
  clearAll () {
    this.clear()
    this.expressions = {}
  }
}
