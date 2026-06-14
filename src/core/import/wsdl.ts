/**
 * Import a WSDL 1.1 / 1.2 document. Each binding operation becomes a POST
 * request whose body is a SOAP envelope skeleton (the request element wrapped
 * around a "fill in fields" placeholder) and whose headers carry the right
 * Content-Type and, for SOAP 1.1, the SOAPAction. Deep XSD-to-sample expansion
 * is intentionally out of scope; the envelope is a skeleton the user completes.
 */

import { XMLParser } from 'fast-xml-parser'
import type { KeyValue, TigerRequest } from '../types'
import type { ImportedRequest, ImportResult } from './types'

// WSDL is namespaced XML with varying prefixes (wsdl:, soap:, or none). We keep
// prefixes intact and match nodes/attributes by their local name instead.
type Node = any // eslint-disable-line @typescript-eslint/no-explicit-any

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

function localName(key: string): string {
  const i = key.indexOf(':')
  return i === -1 ? key : key.slice(i + 1)
}

const SOAP12_NS = /wsdl\/soap12|2003\/05\/soap-envelope/

/** Raw attribute by exact (possibly prefixed) name, e.g. 'xmlns:soap12'. */
function rawAttr(node: Node, exact: string): string | undefined {
  const v = node?.[`@_${exact}`]
  return v == null ? undefined : String(v)
}

/** The actual child key (with prefix) whose local name matches. */
function childKey(node: Node, name: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  for (const key of Object.keys(node)) {
    if (key.startsWith('@_')) continue
    if (localName(key) === name) return key
  }
  return undefined
}

function prefixOf(key: string): string {
  const i = key.indexOf(':')
  return i === -1 ? '' : key.slice(0, i)
}

/** Is this <binding> a SOAP 1.2 binding? Resolve its soap-binding child's namespace. */
function bindingIsSoap12(definitions: Node, binding: Node, docFallback: boolean): boolean {
  const key = childKey(binding, 'binding') // the soap:binding / soap12:binding child
  if (!key) return docFallback
  const prefix = prefixOf(key)
  const lookup = prefix ? `xmlns:${prefix}` : 'xmlns'
  const ns = rawAttr(binding, lookup) ?? rawAttr(definitions, lookup)
  return ns ? SOAP12_NS.test(ns) : docFallback
}

/** The local part of a QName value such as "tns:GetWeather" -> "GetWeather". */
function localPart(qname: string): string {
  return localName(qname)
}

/** First child value whose element local name matches `name`. */
function child(node: Node, name: string): Node {
  if (!node || typeof node !== 'object') return undefined
  for (const key of Object.keys(node)) {
    if (key.startsWith('@_')) continue
    if (localName(key) === name) return node[key]
  }
  return undefined
}

/** All children with local name `name`, always as an array (0, 1 or many). */
function children(node: Node, name: string): Node[] {
  const v = child(node, name)
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

/** Attribute value by local name (ignores namespace prefix on the attribute). */
function attr(node: Node, name: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  for (const key of Object.keys(node)) {
    if (!key.startsWith('@_')) continue
    if (localName(key.slice(2)) === name) {
      const val = node[key]
      return val == null ? undefined : String(val)
    }
  }
  return undefined
}

function findEndpoint(services: Node[]): string | undefined {
  for (const svc of services) {
    for (const port of children(svc, 'port')) {
      const address = children(port, 'address')[0]
      const loc = address && attr(address, 'location')
      if (loc) return loc
    }
  }
  return undefined
}

function buildSoapRequest(opts: {
  opName: string
  requestElement: string
  endpoint: string
  targetNs: string
  soapAction: string
  soap12: boolean
}): TigerRequest {
  const { opName, requestElement, endpoint, targetNs, soapAction, soap12 } = opts
  const envelopeNs = soap12
    ? 'http://www.w3.org/2003/05/soap-envelope'
    : 'http://schemas.xmlsoap.org/soap/envelope/'

  const content =
    `<soap:Envelope xmlns:soap="${envelopeNs}"\n` +
    `               xmlns:tns="${targetNs}">\n` +
    `  <soap:Body>\n` +
    `    <tns:${requestElement}>\n` +
    `      <!-- fill in fields -->\n` +
    `    </tns:${requestElement}>\n` +
    `  </soap:Body>\n` +
    `</soap:Envelope>\n`

  const headers: KeyValue[] = []
  if (soap12) {
    const action = soapAction ? `; action="${soapAction}"` : ''
    headers.push({
      name: 'Content-Type',
      value: `application/soap+xml; charset=utf-8${action}`,
      enabled: true
    })
  } else {
    headers.push({ name: 'Content-Type', value: 'text/xml; charset=utf-8', enabled: true })
    if (soapAction) {
      headers.push({ name: 'SOAPAction', value: `"${soapAction}"`, enabled: true })
    }
  }

  return {
    name: opName,
    method: 'post',
    url: endpoint,
    headers,
    query: [],
    body: { type: 'xml', content }
  }
}

export function importWsdl(xml: string): ImportResult {
  const root = parser.parse(xml)
  const definitions = child(root, 'definitions')
  if (!definitions) return { name: 'WSDL', source: 'wsdl', requests: [] }

  const targetNs = attr(definitions, 'targetNamespace') ?? ''
  const docSoap12 =
    /schemas\.xmlsoap\.org\/wsdl\/soap12|www\.w3\.org\/2003\/05\/soap-envelope/.test(xml)

  const services = children(definitions, 'service')
  const serviceName =
    (services[0] && attr(services[0], 'name')) || attr(definitions, 'name') || 'WSDL'
  const endpoint = findEndpoint(services) ?? '{{baseUrl}}'

  // message name -> request element local name (document/literal style)
  const messageElement = new Map<string, string>()
  for (const msg of children(definitions, 'message')) {
    const name = attr(msg, 'name')
    const part = children(msg, 'part')[0]
    const element = part && (attr(part, 'element') ?? attr(part, 'name'))
    if (name && element) messageElement.set(name, localPart(element))
  }

  // operation name -> input message local name
  const inputMessage = new Map<string, string>()
  for (const pt of children(definitions, 'portType')) {
    for (const op of children(pt, 'operation')) {
      const opName = attr(op, 'name')
      const input = children(op, 'input')[0]
      const msg = input && attr(input, 'message')
      if (opName && msg) inputMessage.set(opName, localPart(msg))
    }
  }

  const requests: ImportedRequest[] = []
  for (const binding of children(definitions, 'binding')) {
    const soap12 = bindingIsSoap12(definitions, binding, docSoap12)
    for (const op of children(binding, 'operation')) {
      const opName = attr(op, 'name')
      if (!opName) continue
      const soapOp = children(op, 'operation').find((o) => attr(o, 'soapAction') !== undefined)
      const soapAction = soapOp ? (attr(soapOp, 'soapAction') ?? '') : ''
      const requestElement = messageElement.get(inputMessage.get(opName) ?? '') ?? opName
      requests.push({
        path: [serviceName],
        request: buildSoapRequest({ opName, requestElement, endpoint, targetNs, soapAction, soap12 })
      })
    }
  }

  return { name: serviceName, source: 'wsdl', requests }
}
