import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importWsdl } from '../../src/core/import/wsdl'

// Real public SOAP WSDLs captured as fixtures. Both expose SOAP 1.1 and SOAP 1.2
// bindings, so they exercise single-binding selection and parameter expansion on
// genuine real-world input.
const calculator = readFileSync('test/core/fixtures/calculator.wsdl', 'utf8')
const temperature = readFileSync('test/core/fixtures/temperature.wsdl', 'utf8')

describe('importWsdl on the real DNE Calculator service', () => {
  const result = importWsdl(calculator)

  it('reads the service name and source', () => {
    expect(result.source).toBe('wsdl')
    expect(result.name).toBe('Calculator')
  })

  it('emits one POST request per operation from a single SOAP 1.1 binding (no duplicates)', () => {
    expect(result.requests).toHaveLength(4)
    for (const r of result.requests) {
      expect(r.request.method).toBe('post')
      expect(r.request.url).toBe('http://www.dneonline.com/calculator.asmx')
      expect(r.path).toEqual(['Calculator'])
      const headers = Object.fromEntries(r.request.headers.map((h) => [h.name, h.value]))
      expect(headers['Content-Type']).toBe('text/xml; charset=utf-8')
      expect(headers['SOAPAction']).toBeDefined()
    }
    const names = new Set(result.requests.map((r) => r.request.name))
    for (const op of ['Add', 'Subtract', 'Multiply', 'Divide']) {
      expect(names.has(op)).toBe(true)
    }
  })

  it('expands the Add operation parameters (intA, intB) into the body', () => {
    const add = result.requests.find((r) => r.request.name === 'Add')!
    const headers = Object.fromEntries(add.request.headers.map((h) => [h.name, h.value]))
    expect(headers['SOAPAction']).toBe('"http://tempuri.org/Add"')
    expect(add.request.body.content).toContain('<tns:Add>')
    expect(add.request.body.content).toContain('<tns:intA></tns:intA>')
    expect(add.request.body.content).toContain('<tns:intB></tns:intB>')
  })
})

describe('importWsdl on the real daehosting TemperatureConversions service', () => {
  const result = importWsdl(temperature)

  it('emits a single set of SOAP operations (no 1.1/1.2 duplicates)', () => {
    const names = result.requests.map((r) => r.request.name)
    // Each operation appears exactly once.
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('CelsiusToFahrenheit')
  })

  it('builds a sendable CelsiusToFahrenheit request: param expanded + mandatory SOAPAction', () => {
    const c2f = result.requests.find((r) => r.request.name === 'CelsiusToFahrenheit')!
    expect(c2f.request.method).toBe('post')
    expect(c2f.request.url).toBe(
      'http://webservices.daehosting.com/services/TemperatureConversions.wso'
    )
    const headers = Object.fromEntries(c2f.request.headers.map((h) => [h.name, h.value]))
    expect(headers['Content-Type']).toBe('text/xml; charset=utf-8')
    // SOAPAction is empty in this WSDL but the header must still be sent (SOAP 1.1).
    expect(headers['SOAPAction']).toBe('""')
    // The nCelsius parameter is expanded from the schema, so the body is sendable.
    expect(c2f.request.body.content).toContain('<tns:CelsiusToFahrenheit>')
    expect(c2f.request.body.content).toContain('<tns:nCelsius></tns:nCelsius>')
  })
})
