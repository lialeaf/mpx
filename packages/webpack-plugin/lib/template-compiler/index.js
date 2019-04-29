const compiler = require('./compiler')
const loaderUtils = require('loader-utils')
const bindThis = require('./bind-this').transform
const InjectDependency = require('../dependency/InjectDependency')
const stripExtension = require('../utils/strip-extention')

module.exports = function (raw) {
  this.cacheable()
  const options = loaderUtils.getOptions(this) || {}
  // 对于原生模板暂不做处理
  if (options.isNative) {
    return raw
  }
  const mode = this._compilation.__mpx__.mode
  const globalSrcMode = this._compilation.__mpx__.srcMode
  const localSrcMode = loaderUtils.parseQuery(this.resourceQuery || '?').mode
  // const pagesMap = this._compilation.__mpx__.pagesMap
  const componentsMap = this._compilation.__mpx__.componentsMap
  const resource = stripExtension(this.resource)

  let parsed = compiler.parse(raw, Object.assign(options, {
    warn: (msg) => {
      this.emitWarning(
        new Error('[template compiler][' + this.resource + ']: ' + msg)
      )
    },
    error: (msg) => {
      this.emitError(
        new Error('[template compiler][' + this.resource + ']: ' + msg)
      )
    },
    isComponent: !!componentsMap[resource],
    mode,
    srcMode: localSrcMode || globalSrcMode
  }))
  let ast = parsed.root
  let meta = parsed.meta
  let renderResult = bindThis(`global.currentInject = {
    moduleId: ${JSON.stringify(options.moduleId)},
    render: function () {
      var __seen = [];
      var renderData = {};
      ${compiler.genNode(ast)}
      return renderData
    }
};\n`, {
    needCollect: true,
    ignoreMap: meta.wxsModuleMap
  })

  let globalInjectCode = renderResult.code + '\n'

  if (meta.computed) {
    globalInjectCode += bindThis(`global.currentInject.injectComputed = {
  ${meta.computed.join(',')}
  };`).code + '\n'
  }

  if (meta.refs) {
    globalInjectCode += `global.currentInject.getRefsData = function () {
  return ${JSON.stringify(meta.refs)};
  };\n`
  }

  const dep = new InjectDependency({
    content: globalInjectCode,
    index: -2
  })

  this._module.issuer.addDependency(dep)
  return compiler.serialize(ast)
}
