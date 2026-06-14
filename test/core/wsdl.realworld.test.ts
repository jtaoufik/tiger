import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importWsdl } from '../../src/core/import/wsdl'

// A real public SOAP service WSDL (the DNE Online calculator), captured as a
// fixture. It exposes BOTH a SOAP 1.1 and a SOAP 1.2 binding over the same four
// operations, so it exercises per-binding version detection on real-world input.
const wsdl = readFileSync('test/core/fixtures/calculator.wsdl', 'utf8')

describe('importWsdl on a real Calculator service', () => {
  const result = importWsdl(wsdl)

  it('reads the service name and source', () => {
    expect(result.source).toBe('wsdl')
    expect(result.name).toBe('Calculator')
  })

  it('creates a POST request per binding operation at the real endpoint', () => {
    expect(result.requests.length).toBeGreaterThanOrEqual(4)
    for (const r of result.requests) {
      expect(r.request.method).toBe('post')
      expect(r.request.url).toBe('http://www.dneonline.com/calculator.asmx')
      expect(r.path).toEqual(['Calculator'])
      expect(r.request.body.type).toBe('xml')
    }
    // The four operations are present.
    const names = new Set(result.requests.map((r) => r.request.name))
    for (const op of ['Add', 'Subtract', 'Multiply', 'Divide']) {
      expect(names.has(op)).toBe(true)
    }
  })

  it('builds a SOAP 1.1 Add request with the right SOAPAction and envelope', () => {
    const add11 = result.requests.find(
      (r) =>
        r.request.name === 'Add' &&
        r.request.headers.some((h) => h.name === 'Content-Type' && h.value.includes('text/xml'))
    )
    expect(add11).toBeDefined()
    const headers = Object.fromEntries(add11!.request.headers.map((h) => [h.name, h.value]))
    expect(headers['SOAPAction']).toBe('"http://tempuri.org/Add"')
    expect(add11!.request.body.content).toContain('http://schemas.xmlsoap.org/soap/envelope/')
    expect(add11!.request.body.content).toContain('<tns:Add>')
  })

  it('also builds the SOAP 1.2 variant (application/soap+xml, no SOAPAction header)', () => {
    const add12 = result.requests.find(
      (r) =>
        r.request.name === 'Add' &&
        r.request.headers.some(
          (h) => h.name === 'Content-Type' && h.value.includes('application/soap+xml')
        )
    )
    expect(add12).toBeDefined()
    const headers = Object.fromEntries(add12!.request.headers.map((h) => [h.name, h.value]))
    expect(headers['SOAPAction']).toBeUndefined()
    expect(add12!.request.body.content).toContain('http://www.w3.org/2003/05/soap-envelope')
  })
})
