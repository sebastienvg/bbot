import * as bBot from '..'
import * as inquirer from 'inquirer'
import chalk from 'chalk'

/** Load prompts and render chat in shell, for testing interactions */
export class Shell extends bBot.MessageAdapter {
  name = 'shell-message-adapter'
  ui = new inquirer.ui.BottomBar()
  logs: string[] = ['']
  messages: [string, string][] = []
  line = new inquirer.Separator()
  settings = {
    chatSize: 5
  }

  /** Update chat window and return to input prompt */
  async render () {
    let _ = '\n'
    let n = '           '
    _ += chalk.cyan('╔═════════════════════════════════════════════════════════▶') + '\n'
    for (let m of this.messages.slice(-this.settings.chatSize)) {
      _ += chalk.cyan(`║${n.substr(0, n.length - m[0].length) + m[0]} ┆ `) + m[1] + '\n'
    }
    _ += chalk.cyan('╚═════════════════════════════════════════════════════════▶') + '\n\n'
    this.ui.updateBottomBar(_)
    await this.prompt()
  }

  /** Route log events to the inquirer UI */
  log (_transport: string, level: string, msg: string) {
    let item = `[${level}]${msg}`
    switch (level) {
      case 'debug': item = chalk.gray(item)
        break
      case 'warn': item = chalk.magenta(item)
        break
      case 'error': item = chalk.red(item)
    }
    this.ui.writeLog(item)
  }

  /** Register user and room, then render chat with welcome message */
  async start () {
    this.bot.logger.info('[shell] using Shell as message adapter')
    this.bot.events.on('started', async () => {
      const registration: any = await inquirer.prompt([{
        type: 'input',
        name: 'username',
        default: 'user',
        message: 'Welcome! What shall I call you?'
      },{
        type: 'input',
        name: 'room',
        default: 'shell',
        message: 'And what about this "room"?'
      }])
      this.user = new this.bot.User({ name: registration.username })
      this.room = { name: registration.room }
      this.bot.logger.remove('console')
      this.bot.logger.on('logging', this.log.bind(this))
      const e = new this.bot.Envelope()
      e.write(`Welcome @${this.user.name}, I'm @${this.bot.name}`)
      e.write(`Type "exit" to exit, or anything else to keep talking.`)
      await this.dispatch(e)
    })
  }

  /** Prompt for message input, recursive after each render */
  async prompt () {
    const input: any = await inquirer.prompt({
      type: 'input',
      name: 'message',
      message: chalk.magenta(`[${this.room.name}]`) + chalk.cyan(' ➤')
    })
    if ((input.message as string).toLowerCase() === 'exit') {
      return this.bot.shutdown()
    }
    this.messages.push([this.user.name, input.message])
    await this.bot.receive(new this.bot.TextMessage(this.user, input.message))
    return this.render()
  }

  /** Add outgoing messages and re-render chat */
  async dispatch (envelope: bBot.Envelope) {
    for (let text of (envelope.strings || [])) {
      this.messages.push([this.bot.name, text])
    }
    await this.render()
  }

  /** Close inquirer UI and exit process when shutdown complete */
  async shutdown () {
    this.ui.close()
    this.bot.events.on('shutdown', () => process.exit(0))
  }
}

export const use = (bot: typeof bBot) => new Shell(bot)
