const initEnv = process.env
delete process.env.BOT_NAME
import 'mocha'
import { expect } from 'chai'
import * as yargs from 'yargs'
import * as config from './config'

describe('[config]', () => {
  beforeEach(() => delete process.env.BOT_NAME)
  after(() => process.env = initEnv)
  describe('Settings', () => {
    describe('.reloadConfig', () => {
      it('allows overwrite of saved config with update settings', () => {
        process.env.BOT_NAME = 'thierry'
        const settings = new config.Settings()
        expect(settings.config.name).to.equal('thierry')
        process.env.BOT_NAME = 'philippe'
        settings.reloadConfig()
        expect(settings.config.name).to.equal('philippe')
      })
      it('allows overwrite of save config with new options', () => {
        const settings = new config.Settings()
        expect(typeof settings.config.isFoo).to.equal('undefined')
        settings.options['is-foo'] = {
          type: 'boolean',
          description: 'testing a new option',
          default: true
        }
        settings.reloadConfig()
        expect(typeof settings.config.isFoo).to.equal('boolean')
      })
    })
    describe('.extend', () => {
      it('allows defining new options after load', () => {
        process.env.BOT_FOO = 'bar'
        const settings = new config.Settings()
        expect(typeof settings.config.foo).to.equal('undefined')
        settings.extend({ 'foo': { type: 'string' } })
        expect(settings.config.foo).to.equal('bar')
      })
    })
    describe('.name', () => {
      it('provides shortcut to name from config', () => {
        config.settings.name = 'foo1'
        expect(config.settings.config.name).to.equal('foo1')
      })
      it('validates and reformats safe username', () => {
        config.settings.name = 'f()!o@#o2'
        expect(config.settings.config.name).to.equal('foo2')
      })
    })
    describe('.alias', () => {
      it('provides shortcut to alias from config', () => {
        config.settings.alias = 'foo1'
        expect(config.settings.config.alias).to.equal('foo1')
      })
      it('validates and reformats safe alias', () => {
        config.settings.alias = 'f()!o@#o2'
        expect(config.settings.config.alias).to.equal('foo2')
      })
    })
  })
  describe('.config', () => {
    beforeEach(() => config.settings.reloadConfig())
    it('contains arguments collection, with defaults', () => {
      expect(config.settings).to.have.property('name', 'bot')
    })
  })
  describe('.getConfig', () => {
    beforeEach(() => config.settings.reloadConfig())
    it('loads config from process.config', () => {
      yargs.parse(['--name', 'hao']) // overwrite config
      expect(config.getConfig()).to.have.property('name', 'hao')
      yargs.parse(process.argv) // replace with actual config
    })
    it('loads configs from ENV variables using prefix', () => {
      process.env.BOT_NAME = 'henry'
      expect(config.getConfig()).to.have.property('name', 'henry')
    })
    it('loads config from package.json `bot` attribute', () => {
      expect(config.getConfig()).to.have.property('alias', 'bb')
    })
    // it('load config from a defined json file if given', () => {
    //   mock({
    //     '/mock/config.json': JSON.stringify({ name: 'harriet' })
    //   })
    //   yargs.parse(['--config', '/mock/config.json']) // overwrite config
    //   console.log(config.getConfig())
    //   mock.restore()
    //   yargs.parse(process.config) // replace with actual config
    // })
  })
})
