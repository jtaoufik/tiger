import type { NamespaceCatalog } from '../../translator'
import type { main as en } from '../en/main'

export const main: NamespaceCatalog<typeof en> = {
  'main.dialog.openCollection': '打开 Tiger 集合文件夹',
  'main.dialog.newCollection': '选择创建“{name}”的位置',
  'main.dialog.createHere': '在此创建',
  'main.dialog.cloneTitle': '选择团队集合的保存位置',
  'main.dialog.saveHere': '保存到此处',
  'main.dialog.unsavedTitle': '有未保存的更改',
  'main.dialog.unsavedDetail': '现在关闭会丢弃尚未保存的编辑。',
  'main.dialog.closeAnyway': '仍然关闭',
  'main.dialog.updateUnsavedDetail': '现在重启更新会丢弃尚未保存的编辑。',
  'main.dialog.restartAnyway': '仍然重启',
  'main.dialog.keepEditing': '继续编辑',
  'main.dialog.saveResponse': '保存响应正文',
  'main.import.postman': 'Postman 集合',
  'main.import.insomnia': 'Insomnia 导出文件',
  'main.import.wsdl': 'WSDL 文档',
  'main.import.openapi': 'OpenAPI / Swagger 文档',
  'main.import.brunoFolder': '导入 Bruno 集合文件夹',
  'main.import.failed': '无法导入此文件：{reason}',
  'main.export.title': '导出',
  'main.http.certRead': '无法读取证书文件：{reason}',
  'main.http.tokenStatus': '令牌端点返回了 {status}',
  'main.http.tokenMissing': '令牌响应中没有 access_token',
  'main.realtime.badUrl': '此地址不能用于该连接：{url}',
  'main.realtime.refused': '{url} 上没有服务在监听',
  'main.realtime.proxyTimeout': '代理未及时响应',
  'main.realtime.proxyRefused': '代理拒绝了连接（状态 {status}）',
  'main.realtime.handshakeStatus': '服务器返回了 {status}，没有打开 WebSocket',
  'main.realtime.sseStatus': '服务器返回了 {status}，而不是事件流',
  'main.realtime.sseType': '服务器发送的是 {type}，而不是 text/event-stream'
}
