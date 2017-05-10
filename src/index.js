const CDP = require('chrome-remote-interface')
const chainProxy = require('async-chain-proxy')
const {
  functionToEvaluatingSource
} = require('./functionToSource')
const {
  escapeHtml,
  createChromeLauncher
} = require('./util')

let startedChromyInstanceCount = 0

class Chromy {
  constructor (options = {}) {
    const defaults = {
      port: 9222,
      waitTimeout: 5000
    }
    this.options = Object.assign(defaults, options)
    this.cdpOptions = {
      port: this.options.port
    }
    this.client = null
    this.launcher = createChromeLauncher(this.options)
  }

  chain (options = {}) {
    return chainProxy(this, options)
  }

  async start () {
    if (this.client !== null) {
      return
    }
    await this.launcher.run()
    const exitHandler = async _ => {
      const success = await this.close()
      if (success) {
        if (startedChromyInstanceCount === 0) {
          process.exit(1)
        }
      }
    }
    process.on('SIGINT', exitHandler.bind(null))
    process.on('unhandledRejection', exitHandler.bind(null))
    process.on('rejectionHandled', exitHandler.bind(null))
    process.on('uncaughtException', exitHandler.bind(null))
    await new Promise((resolve, reject) => {
      CDP(this.cdpOptions, async (client) => {
        this.client = client
        startedChromyInstanceCount++
        const {Network, Page} = client
        await Network.enable()
        await Page.enable()
        if ('userAgent' in this.options) {
          await this.userAgent(this.options.userAgent)
        }
        if ('headers' in this.options) {
          await this.headers(this.options.headers)
        }
        resolve(this)
      }).on('error', (err) => {
        reject(err)
      })
    })
  }

  async close () {
    if (this.client === null) {
      return false
    }
    await this.client.close()
    await this.launcher.kill()
    this.client = null
    startedChromyInstanceCount--
    return true
  }

  async userAgent (ua) {
    return await this.client.Network.setUserAgentOverride({'userAgent': ua})
  }

  /**
   * Example:
   * night.headers({'X-Requested-By': 'foo'})
   */
  async headers (headers) {
    return await this.client.Network.setExtraHTTPHeaders({'headers': headers})
  }

  async goto (url) {
    if (this.client === null) {
      await this.start()
    }
    await this.client.Page.navigate({url: url})
    await this.client.Page.loadEventFired()
  }

  async evaluate (expr) {
    let e = expr
    if ((typeof e) === 'function') {
      e = functionToEvaluatingSource(expr)
    }
    const result = await this.client.Runtime.evaluate({expression: e})
    if (!result.result) {
      return null
    }
    if (result.result.type === 'string') {
      return JSON.parse(result.result.value)
    }
    return result.result
  }

  /**
   * define function
   *
   * @param func {(function|string|Array.<function>|Array.<string>)}
   * @returns {Promise.<void>}
   */
  async defineFunction (def) {
    let funcs = []
    if (Array.isArray(def)) {
      funcs = def
    } else if ((typeof def) === 'object') {
      funcs = this._moduleToFunctionSources(def)
    } else {
      funcs.push(def)
    }
    for (let i = 0;i < funcs.length; i++) {
      let f = funcs[i]
      if ((typeof f) === 'function') {
        f = f.toString()
      }
      await this.client.Runtime.evaluate({expression: f})
    }
  }

  _moduleToFunctionSources (module) {
    const result = []
    for (let funcName in module) {
      let func = module[funcName]
      let src = `function ${funcName} () { return (${func.toString()})() }`.trim()
      result.push(src)
    }
    return result
  }

  async sleep (msec) {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, msec)
    })
  }

  async wait (cond) {
    if ((typeof cond) === 'number') {
      await this.sleep(cond)
    } else {
      let check = null
      let startTime = Date.now()
      await new Promise((resolve, reject) => {
        check = () => {
          setTimeout(async () => {
            try {
              const now = Date.now()
              if (now - startTime > this.options.waitTimeout) {
                reject(new Error('wait() timeout'))
                return
              }
              const result = await this.evaluate(functionToEvaluatingSource(() => {
                return document.querySelector('?')
              }, {'?': escapeHtml(cond)}))
              if (result) {
                resolve(result)
              } else {
                check()
              }
            } catch (e) {
              reject(e)
            }
          }, 50)
        }
        check()
      })
    }
  }

  async type (expr, value) {
    return await this.evaluate('document.querySelectorAll("' + expr + '").forEach(n => n.value = "' + escapeHtml(value) + '")')
  }

  async click (expr) {
    return await this.evaluate('document.querySelectorAll("' + expr + '").forEach(n => n.click())')
  }
}

module.exports = Chromy

