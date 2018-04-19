import {
  IListenerCallback, counter, logger, IState
} from '..'

/** Keep all created bits, for getting by their ID as key */
export const bits: {
  [id: string]: Bit
} = {}

/**
 * A collection of attributes for setting up listeners, paths, dialogues, scenes
 * and directors. All the related controllers for what causes a bit to execute
 * and what happens next.
 */
export interface IBit {
  id?: string,
  send?: string | string[],
  catch?: string,
  callback?: IListenerCallback,
  catchCallback?: IListenerCallback,
  condition?: RegExp | string,
  intent?: string,
  listen?: string,
  scope?: string,
  next?: string | string[],
  options?: string,
  [key: string]: any
}

/**
 * A single interaction between user and bot.
 * Could be a command to trigger a callback, a request for data or just a
 * connecting line of dialogue.
 * @todo Complete implementation of all attributes.
 */
export class Bit implements IBit {
  /** For scene and/or dialogue, listener running the bit (required) */
  id: string
  /** String/s to send when doing bit (must have this or callback) */
  send?: string | string[]
  /** To send if response unmatched by listeners */
  catch?: string
  /** Function to call when executing bit (after any defined sends) */
  callback?: IListenerCallback
  /** Function to call when response unmatched by listeners */
  catchCallback?: IListenerCallback
  /** Regex or string converted to regex for listener to trigger bit */
  condition?: RegExp | string
  /** Key for language processed intent to match for execution */
  intent?: string
  /** Type of listener (hear/respond) for scene entry bit */
  listen?: string
  /** Type for scene (used if it has a listen type), or omit to not do scene */
  scope?: string
  /** Key/s (strings) for consecutive bits (implicitly creates scene) */
  next?: string | string[]
  /** Key/val options for scene and/or dialogue config */
  options?: string
  /** Index signature for looping through attributes */
  [key: string]: any
  /**
   * Define a `condition` or `intent` that executes the bit, consecutively from
   * a prior bit, or with a `listen` attribute to become a "global" entry point
   * to a one time interaction or continuing scene.
   *
   * A subsequent bit can even lead back to its own parent or any other bit,
   * creating a mesh of possible conversational pathways.
   *
   * A bit without a `condition` or `intent` can still be executed by calling
   * `doBit` with its `id`. This could be useful for defining integration logic
   * that does something outside chat, but can be triggered by chat scripts.
   */
  constructor (options: IBit) {
    this.id = (options.id) ? options.id : counter('bit')
    Object.keys(options).forEach((key: string) => this[key] = options[key])
    if (!this.send && !this.callback) {
      logger.warn('Bit won\'t work without a send or callback attribute.')
    }
  }

  /**
   * Do stuff with current state (e.g. send replies and/or call callbacks)
   * @todo Do send if has `send` property.
   */
  async execute (state: IState): Promise<any> {
    if (this.callback) await Promise.resolve(this.callback(state))
  }
}

/** Add new bit to collection, returning its ID */
export function setupBit (options: IBit) {
  const bit = new Bit(options)
  bits[bit.id] = bit
  return bit.id
}

/** Execute a bit using its ID, providing current conversation state */
export async function doBit (id: string, state: IState): Promise<void> {
  const bit = bits[id]
  if (!bit) {
    logger.error('Attempted to do bit with unknown ID')
    return
  }
  await Promise.resolve(bit.execute(state))
  return
}