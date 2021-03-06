import 'dotenv/config'
import * as yargs from 'yargs'
import { packageJSON } from './json'

const argsInfo = `
All option can be provided as environment variables, with the prefix \`BOT_\`.
Config can also be declared in \`package.json\` with the key: "botConfig".
For more information, see http://bbot.chat/docs/config'
`
const argsError = (msg: string, err: Error) => {
  console.error(msg, err)
  console.info('Start with --help for config argument info.')
  if (err) throw err
  process.exit(1)
}

/** Utility for converting option keys, from fooBar to foo-bar */
export function hyphenate (str: string) {
  return str.replace(/([A-Z])/g, (g) => `-${g[0].toLowerCase()}`)
}
/** Utility for converting option keys, from foo-bar to fooBar */
export function camelCase (str: string) {
  return str.replace(/-([a-z])/gi, (g) => g[1].toUpperCase())
}

/** Initial array of config options, can be extended prior and post load. */
const initOptions: { [key: string]: yargs.Options } = {
  'name': {
    type: 'string',
    describe: 'Name of the bot in chat. Prepending any command with the name will trigger `direct` branches.',
    alias: 'n',
    default: 'bot'
  },
  'alias': {
    type: 'string',
    describe: 'Alternate name for the bot.'
  },
  'log-level': {
    type: 'string',
    describe: 'The starting minimum level for logging events (silent|debug|info|warn|error).',
    default: 'info'
  },
  'auto-save': {
    type: 'boolean',
    describe: 'Save data in the brain every 5 seconds (defaults true).',
    default: true
  },
  'use-server': {
    type: 'boolean',
    describe: 'Enable/disable the internal Koa server for incoming requests and http/s messages.',
    default: true
  },
  'server-host': {
    type: 'string',
    describe: 'The host the bot is running on.',
    default: 'localhost'
  },
  'server-port': {
    type: 'string',
    describe: 'The port the server should listen on.',
    default: '3000'
  },
  'server-secure': {
    type: 'boolean',
    describe: 'Server should listen on HTTPS only.',
    default: false
  },
  'message-adapter': {
    type: 'string',
    describe: 'Local path or NPM package name to require as message platform adapter',
    alias: 'm',
    default: './adapters/shell'
  },
  'nlu-adapter': {
    type: 'string',
    describe: 'Local path or NPM package name to require as message platform adapter',
    alias: 'l',
    default: null
  },
  'storage-adapter': {
    type: 'string',
    describe: 'Local path or NPM package name to require as storage engine adapter',
    alias: 's',
    default: null
  },
  // 'webhook-adapter': {
  //   type: 'string',
  //   describe: 'Local path or NPM package name to require as webhook provider adapter',
  //   alias: 'w',
  //   default: null
  // },
  // 'analytics-adapter': {
  //   type: 'string',
  //   describe: 'Local path or NPM package name to require as analytics provider adapter',
  //   alias: 'a',
  //   default: null
  // },
  'nlu-min-length': {
    type: 'number',
    describe: 'Minimum string length for NLU parsing to apply on message',
    default: 10
  },
  'request-timeout': {
    type: 'number',
    describe: 'Maximum milliseconds to wait for a http/s request to resolve',
    default: 1500
  }
}

/** Config class adds setter and getter logic to validate certain settings */
export class Settings {
  options = Object.assign({}, initOptions)

  /** Access all settings from argv, env, package.json and custom config file */
  config: yargs.Arguments = this.loadConfig(true)

  /** Keep all manually assigned configs, to be retained on reload */
  updates: { [key: string]: any } = {}

  /**
   * Combine and load config from command line, environment and JSON if provided.
   * The returned argv object will copy any options given using param alias into
   * the main attribute, or use defaults if none assigned. The option values are
   * then assigned to the config object (some are nullable).
   */
  loadConfig (reset = false) {
    const options: { [key: string]: yargs.Options } = {} // populate new options
    // const restore: { [key: string]: any } = {} // restore set settings

    for (let key in this.options) {
      const opt = Object.assign({}, this.options[key])
      if (this.config) {
        if (typeof opt.global === 'undefined') opt.global = false
        // if (!reset && typeof this.config[key] !== 'undefined') {
        //   restore[key] = this.config[key]
        // }
      }
      options[key] = opt
    }
    const config = yargs
      .options(options)
      .usage('\nUsage: $0 [args]')
      .env('BOT')
      .pkgConf('bot')
      .config()
      .alias('config', 'c')
      .example('config', 'bin/bbot -c bot-config.json')
      .version(packageJSON.version)
      .alias('version', 'v')
      .help()
      .alias('h', 'help')
      .epilogue(argsInfo)
      .fail(argsError)
      .argv
    // restore or reset manually assigned settings on reload/reset
    if (reset) this.updates = {}
    else for (let key in this.updates) config[key] = this.updates[key]
    // clear out config key case variations
    for (let key in config) {
      if (Object.keys(this.options).indexOf(hyphenate(key)) < 0) {
        delete config[key]
      }
    }
    return config
  }

  /** Allow reloading config after options update */
  reloadConfig () {
    this.config = this.loadConfig(false)
  }

  /** Reload config without taking on existing */
  resetConfig () {
    this.options = Object.assign({}, initOptions)
    this.config = this.loadConfig(true)
  }

  /** Validate name, stripping special characters */
  safeName (name: string) { return name.replace(/[^a-z0-9_-]/ig, '') }

  /** Shortcut to loaded bot name config */
  get name () { return this.get('name') }

  /** Shortcut to setting name with validation */
  set name (name: string) { this.set('name', this.safeName(name)) }

  /** Shortcut to loaded bot alias config */
  get alias () { return this.get('alias') }

  /** Shortcut to setting alias with validation */
  set alias (name: string) { this.set('alias', this.safeName(name)) }

  /** Generic config getter */
  get (key: string) {
    return (this.config) ? this.config[key] : undefined
  }

  /** Generic config setter (@todo this is kinda whack) */
  set (key: string, value: any) {
    this.config[key] = value
    this.updates[key] = value
    if (key === hyphenate(key)) {
      this.config[camelCase(key)] = value
      this.updates[camelCase(key)] = value
    } else if (key === camelCase(key)) {
      this.config[hyphenate(key)] = value
      this.updates[hyphenate(key)] = value
    }
  }

  /** Generic config clear */
  unset (key: string) {
    delete this.config[key]
    delete this.config[camelCase(key)]
    delete this.config[hyphenate(key)]
    delete this.updates[key]
    delete this.updates[camelCase(key)]
    delete this.updates[hyphenate(key)]
    this.reloadConfig()
  }

  /** Add more options after load */
  extend (options: { [key: string]: yargs.Options }) {
    this.options = Object.assign({}, this.options, options)
    this.reloadConfig()
  }
}

/** Access the settings instance, to replace options and reload config */
export const settings = new Settings()

/** Return config directly, without updating those in the settings instance */
export const getConfig = () => settings.loadConfig()

if (process.platform !== 'win32') process.on('SIGTERM', () => process.exit(0))
