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
  'main.dialog.keepEditing': '继续编辑',
  'main.import.postman': 'Postman 集合',
  'main.import.insomnia': 'Insomnia 导出文件',
  'main.import.wsdl': 'WSDL 文档',
  'main.import.openapi': 'OpenAPI / Swagger 文档',
  'main.import.brunoFolder': '导入 Bruno 集合文件夹',
  'main.import.failed': '无法导入此文件：{reason}',
  'main.export.title': '导出',
  'main.http.certRead': '无法读取证书文件：{reason}',
  'main.http.tokenStatus': '令牌端点返回了 {status}',
  'main.http.tokenMissing': '令牌响应中没有 access_token'
}
