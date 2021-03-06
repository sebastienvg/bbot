import * as bot from '..'

/**
 * A generic middleware pipeline function that can either continue the pipeline
 * or interrupt it. Can return a promise to wait on before next piece executed.
 *
 * The `next` function should be called to continue on to the next piece in the
 * stack. It can be called with a single, optional argument: either the provided
 * `done` function or a new function that eventually calls done, to execute
 * logic after the stack completes. If the argument is not given, the provided
 * done will be assumed.
 */
export interface IPiece {
  (
    state: bot.State,
    next: (done?: IPieceDone) => Promise<void>,
    done: IPieceDone
  ): Promise<any> | any
}

/**
 * A `done` function, created when executing middleware piece, is passed to each
 * piece and can be called (with no arguments) to interrupt the stack and begin
 * executing the chain of completion functions.
 */
export interface IPieceDone {
  (newDone?: IPieceDone): any
}

/**
 * Middleware complete function, handles successful processing and final state
 * after middleware stack completes uninterrupted.
 */
export interface IComplete {
  (state: bot.State): any
}

/**
 * Generic async middleware, handles a stack (or pipeline) of functions that
 * to pass along and possibly modify state for a final piece of functionality.
 *
 * Similar to Express middleware, every middleware `piece` receives the same API
 * signature of `state`, `next`, and `done`. Each piece can either continue
 * the chain (by calling next) or interrupt the chain (by calling done).
 * If all middleware continues, a `complete` function is called to handle the
 * final state.
 *
 * Middleware may wrap the `done` function to allow executing code in the second
 * half of the process (after `complete` has been executed).
 *
 * Different kinds of middleware may receive different information in the state
 * object. For more details, see the API for each type of middleware.
 */
export class Middleware {
  /** Contains middleware "pieces" (callbacks) to execute */
  public stack: IPiece[] = []

  /** Remember own name for tracing middleware */
  constructor (public type: string = 'default') {}

  /** Add a piece to the pipeline */
  register (piece: IPiece) {
    this.stack.push(piece)
  }

  /**
   * Execute middleware in order, following by chained completion handlers.
   * State to process can be an object with state properties or existing state.
   */
  execute (state: bot.State | bot.IState, complete: IComplete) {
    const b = (state instanceof bot.State) ? state : new bot.State(state)
    let isPending = true
    return new Promise((resolve, reject) => {
      if (this.stack.length) {
        bot.logger.debug(`[middleware] executing ${this.type} middleware (size: ${this.stack.length})`)
      }

      /**
       * Execute a single piece of middleware. If an error occurs, complete the
       * middleware without executing deeper.
       */
      const executePiece = async (done: IPieceDone, piece: IPiece, cb: Function) => {
        const next: IPieceDone = (newDone?: IPieceDone) => cb(newDone || done)
        try {
          await Promise.resolve(piece(b, next, done))
        } catch (err) {
          err.state = b
          err.middleware = this.type
          bot.logger.error(err)
          throw err
        }
      }

      /**
       * Async reduction loop, passes the `done` from one piece to the next.
       * Calls completion function if promise not already resolved by middleware
       * piece calling `done` to interrupt completion.
       */
      const reduceStack = async () => {
        let done: IPieceDone = () => resolve(b)
        try {
          for (let piece of this.stack) {
            await executePiece(done, piece, (newDone: IPieceDone) => {
              done = newDone
            })
          }
          if (isPending) {
            await Promise.resolve(complete(b))
            await Promise.resolve(done())
          }
        } catch (err) {
          reject(err)
        }
      }

      // Start running the stack at the end of current Node event loop
      process.nextTick(() => reduceStack())
    }).then(() => {
      isPending = false // lets internal reduction know if resolved early
      return b
    })
  }
}

/** Collection of allowed middleware types for loading. */
const middlewareTypes = [
  'hear', 'listen', 'understand', 'serve', 'act', 'respond', 'remember'
]

/**
 * Thought process middleware collection, types and their stacks.
 * Contains pieces for async execution at each stage of input processing loop.
 */
export class Middlewares {
  [key: string]: any
  message?: Middleware
  nlu?: Middleware
  storage?: Middleware

  constructor () {
    // Nothing to see here, move along.
  }

  load () {
    for (let type of middlewareTypes) {
      if (!this[type]) this[type] = new Middleware(type)
    }
  }

  /** Remove all middleware for reset */
  unload () {
    for (let type of middlewareTypes) delete this[type]
  }
}

export const middlewares = new Middlewares()

export interface IRegisterMiddleware { (middlewarePiece: IPiece): void }

export const middleware: {
  [type: string]: IRegisterMiddleware
} = {}

for (let type of middlewareTypes) {
  middleware[type] = (middlewarePiece: IPiece) => {
    if (!middlewares[type]) middlewares[type] = new Middleware(type)
    middlewares[type].register(middlewarePiece)
  }
}
