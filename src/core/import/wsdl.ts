/**
 * Import a WSDL 1.1 / 1.2 document. Each operation of a single SOAP binding
 * (SOAP 1.1 preferred, falling back to 1.2) becomes a POST request: a SOAP
 * envelope whose body carries the operation's input element with its parameters
 * expanded from the WSDL's <types> schema (one level), plus the right
 * Content-Type and, for SOAP 1.1, the mandatory SOAPAction header. Non-SOAP
 * (HTTP GET/POST) bindings are ignored.
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

/** The local part of a QName value such as "tns:GetWeather" -> "GetWeather". */
function localPart(qname: string): string {
  return localName(qname)
}

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

/**
 * Classify a <binding> by the namespace of its binding-extension child:
 * SOAP 1.1, SOAP 1.2, or other (e.g. an HTTP GET/POST binding we skip).
 */
function bindingKind(definitions: Node, binding: Node): 'soap11' | 'soap12' | 'other' {
  const key = childKey(binding, 'binding')
  if (!key) return 'other'
  const prefix = prefixOf(key)
  const lookup = prefix ? `xmlns:${prefix}` : 'xmlns'
  const ns = rawAttr(binding, lookup) ?? rawAttr(definitions, lookup) ?? ''
  if (/soap12/.test(ns)) return 'soap12'
  if (/wsdl\/soap\//.test(ns)) return 'soap11'
  return 'other'
}

/**
 * Map each top-level schema element's local name to the names of its direct
 * child elements (the operation parameters), read from the WSDL <types> schema.
 * Document/literal services wrap each operation in such an element.
 */
function buildElementParams(definitions: Node): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const types = child(definitions, 'types')
  if (!types) return map
  for (const schema of children(types, 'schema')) {
    for (const el of children(schema, 'element')) {
      const name = attr(el, 'name')
      if (!name) continue
      const ct = children(el, 'complexType')[0]
      const seq = ct && (children(ct, 'sequence')[0] ?? children(ct, 'all')[0])
      const params = seq
        ? (children(seq, 'element')
            .map((c) => attr(c, 'name'))
            .filter((n): n is string => !!n))
        : []
      map.set(name, params)
    }
  }
  return map
}

/** The endpoint URL. Prefer the port bound to `bindingName`; else the first. */
function findEndpoint(services: Node[], bindingName?: string): string | undefined {
  let fallback: string | undefined
  for (const svc of services) {
    for (const port of children(svc, 'port')) {
      const address = children(port, 'address')[0]
      const loc = address && attr(address, 'location')
      if (!loc) continue
      if (fallback === undefined) fallback = loc
      if (bindingName && localPart(attr(port, 'binding') ?? '') === bindingName) return loc
    }
  }
  return fallback
}

function buildSoapRequest(opts: {
  opName: string
  requestElement: string
  params: string[]
  endpoint: string
  targetNs: string
  soapAction: string
  soap12: boolean
}): TigerRequest {
  const { opName, requestElement, params, endpoint, targetNs, soapAction, soap12 } = opts
  const envelopeNs = soap12
    ? 'http://www.w3.org/2003/05/soap-envelope'
    : 'http://schemas.xmlsoap.org/soap/envelope/'

  const inner = params.length
    ? params.map((p) => `      <tns:${p}></tns:${p}>`).join('\n')
    : '      <!-- fill in fields -->'

  const content =
    `<soap:Envelope xmlns:soap="${envelopeNs}"\n` +
    `               xmlns:tns="${targetNs}">\n` +
    `  <soap:Body>\n` +
    `    <tns:${requestElement}>\n` +
    `${inner}\n` +
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
    // The SOAPAction header is mandatory in SOAP 1.1, even with an empty value.
    headers.push({ name: 'SOAPAction', value: `"${soapAction}"`, enabled: true })
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
  const services = children(definitions, 'service')
  const serviceName =
    (services[0] && attr(services[0], 'name')) || attr(definitions, 'name') || 'WSDL'

  const elementParams = buildElementParams(definitions)

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

  // Use a single SOAP binding so operations are not duplicated: prefer SOAP 1.1
  // (most compatible), fall back to 1.2. Non-SOAP bindings (HTTP GET/POST) are
  // skipped - they are not SOAP requests.
  const soapBindings = children(definitions, 'binding')
    .map((binding) => ({ binding, kind: bindingKind(definitions, binding) }))
    .filter((b) => b.kind !== 'other')
  const chosen = soapBindings.find((b) => b.kind === 'soap11') ?? soapBindings[0]

  const requests: ImportedRequest[] = []
  if (chosen) {
    const soap12 = chosen.kind === 'soap12'
    const endpoint = findEndpoint(services, attr(chosen.binding, 'name')) ?? '{{baseUrl}}'
    for (const op of children(chosen.binding, 'operation')) {
      const opName = attr(op, 'name')
      if (!opName) continue
      const soapOp = children(op, 'operation').find((o) => attr(o, 'soapAction') !== undefined)
      const soapAction = soapOp ? (attr(soapOp, 'soapAction') ?? '') : ''
      const requestElement = messageElement.get(inputMessage.get(opName) ?? '') ?? opName
      const params = elementParams.get(requestElement) ?? []
      requests.push({
        path: [serviceName],
        request: buildSoapRequest({
          opName,
          requestElement,
          params,
          endpoint,
          targetNs,
          soapAction,
          soap12
        })
      })
    }
  }

  return { name: serviceName, source: 'wsdl', requests }
}
