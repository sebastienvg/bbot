import { promisify } from 'util'
import * as bot from '..'

/** Await helper, pauses for event loop */
export const eventDelay = promisify(setImmediate)

/** Internal index for loading status */
const status: { [key: string]: 0 | 1 } = {
  waiting: 1, loading: 0, loaded: 0, starting: 0, started: 0, shutdown: 0
}

/** Private helper for setting and logging loading status. */
function setStatus (set: 'waiting' | 'loading' | 'loaded' | 'starting' | 'started' | 'shutdown') {
  for (let key of Object.keys(status)) status[key] = (set === key) ? 1 : 0
  if (set === 'loading') {
    bot.logger.info(`[core] ${bot.settings.name} loading  . . . . . ~(0_0)~`)
  } else if (set === 'starting') {
    bot.logger.info(`[core] ${bot.settings.name} starting . . . . . ┌(O_O)┘ bzzzt whirr`)
  } else if (set === 'started') {
    bot.logger.info(`[core] ${bot.settings.name} started  . . . . . ~(O_O)~ bleep bloop`)
  }
}

/** Find out where the loading or shutdown process is at. */
export function getStatus () {
  for (let key of Object.keys(status)) if (status[key] === 1) return key
  return 'broken' // should never get here
}

/**
 * Load all components.
 * Extensions/adapters can interrupt or modify the stack before start.
 */
export async function load () {
  bot.logger.level = bot.settings.get('log-level') // may change after init
  if (getStatus() !== 'waiting') await reset()
  setStatus('loading')
  try {
    bot.middlewares.load()
    bot.server.load()
    bot.adapters.load()
    await eventDelay()
    setStatus('loaded')
    bot.events.emit('loaded')
  } catch (err) {
    bot.logger.error('[core] failed to load')
    await bot.shutdown(1).catch()
  }
}

/**
 * Make it go!
 * @example
 *  import * as bot from 'bbot'
 *  bot.start()
 */
export async function start () {
  if (getStatus() !== 'loaded') await load()
  setStatus('starting')
  try {
    await bot.server.start()
    await bot.adapters.start()
    await bot.memory.start()
  } catch (err) {
    bot.logger.error('[core] failed to start')
    await bot.shutdown(1).catch()
  }
  await eventDelay()
  setStatus('started')
  bot.events.emit('started')
}

/**
 * Make it stop!
 * Stops responding but keeps history and loaded components.
 * Will wait until started if shutdown called while starting.
 * @example
 *  import * as bbot from 'bbot'
 *  bbot.shutdown()
 */
export async function shutdown (exit = 0) {
  const status = getStatus()
  if (status === 'shutdown') return
  if (status === 'loading') {
    await new Promise((resolve) => bot.events.on('loaded', () => resolve()))
  } else if (status === 'starting') {
    await new Promise((resolve) => bot.events.on('started', () => resolve()))
  }
  await bot.memory.shutdown()
  await bot.adapters.shutdown()
  await bot.server.shutdown()
  await eventDelay()
  setStatus('shutdown')
  bot.events.emit('shutdown')
  if (exit) process.exit(exit)
}

/**
 * Stop temporarily.
 * Allow start to be called again without reloading
 */
export async function pause () {
  await shutdown()
  await eventDelay()
  setStatus('loaded')
  bot.events.emit('paused')
}

/**
 * Scrub it clean!
 * Would allow redefining classes before calling start again, mostly for tests.
 */
export async function reset () {
  const status = getStatus()
  if (status !== 'shutdown') await shutdown()
  try {
    bot.adapters.unload()
    bot.middlewares.unload()
    bot.global.reset()
    bot.settings.resetConfig()
  } catch (err) {
    bot.logger.error('[core] failed to reset')
    await bot.shutdown(1).catch()
  }
  await eventDelay()
  setStatus('waiting')
  bot.events.emit('waiting')
}
