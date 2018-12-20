import 'mocha'
import * as sinon from 'sinon'
import { expect } from 'chai'

import config from '../util/config'
import adapters, { abstracts } from './adapter'
import bBot from '..'
import { ShellAdapter } from '../adapters/shell'

/** Mock Adapter class has methods to imitate all different types */
class MockAdapter extends abstracts.Adapter {
  name = 'mock-adapter'
  async start () { /* mock start */ }
  async shutdown () { /* mock shutdown */ }
  async findOne () { /* mock findOne */ }
  async find () { /* mock find */ }
  async keep () { /* mock keep */ }
  async lose () { /* mock lose */ }
  async loadMemory () { /* mock loadMemory */ }
  async saveMemory () { /* mock saveMemory */ }
  async process () { return {} }
}
const mockAdapter = new MockAdapter(bBot)
export const use = sinon.spy(() => mockAdapter) // exported to test as module
const stubs: { [key: string]: sinon.SinonStub } = {}

describe('[adapter]', () => {
  beforeEach(() => {
    for (let type of adapters.types) config.set(`${type}-adapter`, null)
    adapters.unloadAll()
    use.resetHistory()
  })
  describe('.isAdapter', () => {
    it('returns true for adapter instances', () => {
      expect(adapters.isAdapter(mockAdapter)).to.equal(true)
    })
    it('returns false if adapter instance not implemented properly', () => {
      expect(adapters.isAdapter({
        name: 'invalid-adapter',
        bot: bBot,
        start: Promise.resolve()
        // <-- missing .shutdown()
      })).to.equal(false)
    })
  })
  describe('.fromModule', () => {
    it('returns undefined if no module found', () => {
      const result = adapters.fromModule('not-a-module')
      expect(typeof result).to.equal('undefined')
    })
  })
  describe('.fromPath', () => {
    it('loads adapter exported at path', () => {
      const test = adapters.fromPath('./components/adapter.spec')
      expect(test.use(bBot)).to.be.an.instanceof(abstracts.Adapter)
    })
    it('loads internal adapters at path', () => {
      const test = adapters.fromPath('./adapters/shell')
      expect(test.use(bBot)).to.be.an.instanceof(ShellAdapter)
    })
  })
  describe('.load', () => {
    before(() => {
      stubs.fromModule = sinon.stub(adapters, 'fromModule')
      stubs.fromPath = sinon.stub(adapters, 'fromPath').returns({ use })
    })
    beforeEach(() => {
      stubs.fromModule.resetHistory()
      stubs.fromPath.resetHistory()
    })
    after(() => {
      stubs.fromModule.restore()
      stubs.fromPath.restore()
    })
    it('loads from module if not given a path', () => {
      adapters.load('name')
      sinon.assert.calledOnce(stubs.fromModule)
    })
    it('does not attempt load from module if path given', () => {
      adapters.load('./path')
      sinon.assert.notCalled(stubs.fromModule)
    })
    it('attempts to load from path if path given', () => {
      adapters.load('./path')
      sinon.assert.calledOnce(stubs.fromPath)
    })
    it('attempts to use name as path if module loading fails', () => {
      adapters.load('name')
      sinon.assert.calledOnce(stubs.fromModule)
      sinon.assert.calledWithMatch(stubs.fromPath, /\/name/)
    })
  })
  describe('.loadAll', () => {
    it('loads nothing if none configured', () => {
      expect(() => adapters.loadAll()).to.not.throw()
    })
    it('throws if bad path in config for adapter', () => {
      config.set('messageAdapter', 'foo')
      expect(() => adapters.loadAll()).to.throw()
    })
    it('loads all configured adapters at valid path', () => {
      config.set('messageAdapter', './components/adapter.spec')
      config.set('storageAdapter', './components/adapter.spec')
      config.set('nluAdapter', './components/adapter.spec')
      adapters.loadAll()
      sinon.assert.calledThrice(use)
    })
    it('loads shell message adapter by default', () => {
      config.reset()
      adapters.loadAll()
      expect(adapters.loaded).to.have.property('message')
      expect(adapters.loaded.message!.name).to.equal('shell-message-adapter')
    })
    it('keeps loaded adapters in collection', () => {
      config.set('messageAdapter', './components/adapter.spec')
      adapters.loadAll()
      expect(adapters.loaded.message).to.be.instanceof(abstracts.Adapter)
      expect(typeof adapters.loaded.nlu).to.equal('undefined')
    })
  })
  describe('.startAll', () => {
    it('starts all loaded adapters', async () => {
      adapters.loaded.storage = new MockAdapter(bBot)
      adapters.loaded.nlu = new MockAdapter(bBot)
      const startStorage = sinon.spy(adapters.loaded.storage, 'start')
      const startNLU = sinon.spy(adapters.loaded.nlu, 'start')
      await adapters.startAll()
      sinon.assert.calledOnce(startStorage)
      sinon.assert.calledOnce(startNLU)
    })
  })
  describe('.shutdownAll', () => {
    it('shuts down all loaded adapters', async () => {
      adapters.loaded.storage = new MockAdapter(bBot)
      adapters.loaded.nlu = new MockAdapter(bBot)
      const shutdownStorage = sinon.spy(adapters.loaded.storage, 'shutdown')
      const shutdownNLU = sinon.spy(adapters.loaded.nlu, 'shutdown')
      await adapters.shutdownAll()
      sinon.assert.calledOnce(shutdownStorage)
      sinon.assert.calledOnce(shutdownNLU)
    })
  })
  describe('.unloadAll', () => {
    it('clears all configured adapters', async () => {
      adapters.register('message', './components/adapter.spec')
      adapters.register('nlu', './components/adapter.spec')
      adapters.register('storage', './components/adapter.spec')
      adapters.unloadAll()
      expect(adapters.loaded).to.eql({})
    })
  })
})