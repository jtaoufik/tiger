import type { NamespaceCatalog } from '../../translator'
import type { imports as en } from '../en/imports'

export const imports: NamespaceCatalog<typeof en> = {
  'imports.dynamicVars': '使用了 Tiger 不会生成的动态变量：{names}。请在环境中设置它们，或替换掉。',
  'imports.preScriptCalls': '预请求脚本使用了 Tiger 无法运行的调用：{calls}。脚本已保留，请检查。',
  'imports.testScriptCalls': '测试脚本使用了 Tiger 无法运行的调用：{calls}。脚本已保留，请检查。',
  'imports.formFileMissing': '表单字段“{field}”是文件上传，但导出文件中没有保存文件。请在“正文”标签页中选择文件。',
  'imports.formFileNone': '表单字段“{field}”是文件上传，但未选择文件。请在“正文”标签页中选择文件。',
  'imports.formFileUpload': '表单字段“{field}”上传 {files}。请确认该文件存在于这台电脑上。',
  'imports.formFileUploadFirstOnly':
    '表单字段“{field}”上传 {files}。请确认该文件存在于这台电脑上。只保留了第一个文件。',
  'imports.binaryBody': '发送二进制文件正文，Tiger 暂不支持。正文已留空。',
  'imports.oauthBodyCreds':
    '在 Postman 中，OAuth 2.0 将客户端凭据放在正文中发送；Tiger 则通过 Basic 标头发送。请检查令牌请求是否正常。',
  'imports.oauthUnsupportedToken': '不支持 OAuth 2.0“{grant}”。已保存的访问令牌被导入为 Bearer 令牌，它会过期。',
  'imports.oauthUnsupportedNone': '不支持 OAuth 2.0“{grant}”。认证已设为无；请获取令牌并使用 Bearer 认证。',
  'imports.authUnsupported': '不支持 {auth} 认证。认证已设为无，请重新设置。',
  'imports.methodUnsupported': '不支持 {method} 方法，因此已跳过此请求。',
  'imports.pathVariables': {
    other: '路径变量 {names} 没有值，已变为 {values}。请在环境中设置。'
  },
  'imports.scriptsCopiedPre': {
    other: '{owner} 含有预请求脚本。Tiger 按请求运行脚本，因此已将它们复制到其 {count} 个请求中。请在那里编辑。'
  },
  'imports.scriptsCopiedPost': {
    other: '{owner} 含有测试脚本。Tiger 按请求运行脚本，因此已将它们复制到其 {count} 个请求中。请在那里编辑。'
  },
  'imports.scriptsCopiedBoth': {
    other: '{owner} 含有预请求脚本和测试脚本。Tiger 按请求运行脚本，因此已将它们复制到其 {count} 个请求中。请在那里编辑。'
  },
  'imports.postmanGlobals':
    'Postman 全局变量已加入每个导入的环境。若某个环境也设置了同名变量，则以该环境的值为准。',
  'imports.globalsEnv':
    'Postman 全局变量已变为环境“{name}”，并已为你选中。',
  'imports.secretsNotExported': 'Postman 不会导出机密值：{names}。请自行填写。',
  'imports.postmanV1': '这是 Postman v1 集合。请在 Postman 中重新导出为 Collection v2.1，再导入该文件。',
  'imports.securityUnmapped': 'API 使用了 Tiger 无法映射的安全方案（Cookie API 密钥或类似方式）。请手动设置认证。',
  'imports.cookieParams': '未添加 Cookie 参数（{names}）。如有需要，请添加 Cookie 标头。',
  'imports.securityPlaceholders': '认证已根据 API 的安全方案设置，使用了 {token} 之类的占位变量。请在环境中设置它们。',
  'imports.baseUrlUnknown':
    'API 未指定服务器主机。发送前，请在环境“{name}”中把 baseUrl 设为主机地址，例如 https://api.example.com 。',
  'imports.prodNotSelected':
    'Tiger 没有自动选择“{name}”，以免请求意外发往生产环境。需要时请在环境菜单中选择它。',
  'imports.apiKeyCookie': '在 Insomnia 中 API 密钥通过 Cookie 发送；Tiger 则通过标头发送。请确认服务器接受这种方式。',
  'imports.bearerPrefix':
    'Bearer 认证使用了前缀“{prefix}”。Tiger 始终发送“Bearer”；如果服务器需要“{prefix}”，请改为添加 Authorization 标头。',
  'imports.folderVariables': '不支持文件夹变量：{names}。请将它们添加到环境中。',
  'imports.folderScripts': '文件夹脚本已复制到此文件夹中的每个请求。请在那里编辑。',
  'imports.templateTags': '使用了 Tiger 无法运行的模板标签：{tags}。',
  'imports.templateTagsKept': '使用了 Tiger 无法运行的模板标签：{tags}。它们已作为文本保留。',
  'imports.envTemplateTags': '环境值使用了 Tiger 无法运行的模板标签：{tags}。',
  'imports.skippedRequests': {
    other: '已跳过 {count} 个 {kind} 请求：Tiger 只发送 HTTP 请求。'
  },
  'imports.requestVariables': '不支持请求变量（{kind}）：{names}。请在环境或脚本中设置它们。',
  'imports.assertionsSkipped': '以下断言未转换为测试：{items}。请手动添加为测试。',
  'imports.brunoSecrets': 'Bruno 从不把机密值保存到磁盘：{names}。请将它们添加到“{env}”环境中。',
  'imports.couldNotRead': '无法读取：{error}',
  'imports.folderCopiedHeaders':
    '{label} 含有标头。Tiger 按请求保存标头，因此已将它们复制到其下的每个请求中。请在那里编辑。',
  'imports.folderCopiedScripts':
    '{label} 含有脚本。Tiger 按请求保存脚本，因此已将它们复制到其下的每个请求中。请在那里编辑。',
  'imports.folderCopiedBoth':
    '{label} 含有标头和脚本。Tiger 按请求保存它们，因此已将它们复制到其下的每个请求中。请在那里编辑。',
  'imports.collectionVarsEnv': '集合变量已变为环境“{name}”，并已为你选中。',
  'imports.collectionVarsLayered':
    'Tiger 只有一个变量作用域，因此集合变量（{names}）已添加到每个环境中。环境中设置的值优先。',

  'imports.report.title': '已导入 {name}',
  'imports.report.statsLabel': '已导入',
  'imports.report.requests': { other: '请求' },
  'imports.report.folders': { other: '文件夹' },
  'imports.report.environments': { other: '环境' },
  'imports.report.descEnvironmentsTarget': '环境已添加到 {target}。请从环境菜单中选择一个。',
  'imports.report.descSelectedEnvironment': '{name} 已在侧边栏中打开，并选中了“{environment}”环境。',
  'imports.report.descOpen': '{name} 已在侧边栏中打开。',
  'imports.report.clean': '全部转换顺利，无需检查。',
  'imports.report.checkOne': '请检查此项',
  'imports.report.checkMany': '请检查这 {count} 项',
  'imports.report.hint': '这些内容只导入了一部分。所有内容都已保留，你可以直接在原处修正。',
  'imports.report.in': '位于',
  'imports.report.sentenceClean': '已从 {name} 导入 {requests}、{folders}、{environments}。全部转换顺利。',
  'imports.report.sentenceCheck': '已从 {name} 导入 {requests}、{folders}、{environments}。有 {items}需要检查。',
  'imports.report.requestsCount': { other: '{count} 个请求' },
  'imports.report.foldersCount': { other: '{count} 个文件夹' },
  'imports.report.environmentsCount': { other: '{count} 个环境' },
  'imports.report.itemsCount': { other: '{count} 项' }
}
