import { describe, expect, it } from 'vitest'
import { importWsdl, type ImportResult } from '../../src/core/import'

const body = (result: ImportResult, name: string) => {
  const found = result.requests.find((r) => r.request.name === name)
  if (!found) throw new Error(`no request ${name}`)
  return found.request.body.content
}

/** An rpc-style service: messages list typed parts, the operation is the wrapper. */
const currency = (operationStyle = '') => `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="CurrencyService"
  targetNamespace="urn:currency-defs"
  xmlns:tns="urn:currency-defs"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns="http://schemas.xmlsoap.org/wsdl/">
  <message name="ConvertRequest">
    <part name="from" type="xsd:string"/>
    <part name="to" type="xsd:string"/>
    <part name="amount" type="xsd:double"/>
  </message>
  <message name="ConvertResponse"><part name="result" type="xsd:double"/></message>
  <message name="RatesRequest"><part name="base" type="xsd:string"/></message>
  <message name="RatesResponse"><part name="rates" type="xsd:string"/></message>
  <portType name="CurrencyPortType">
    <operation name="Convert">
      <input message="tns:ConvertRequest"/>
      <output message="tns:ConvertResponse"/>
    </operation>
    <operation name="Rates">
      <input message="tns:RatesRequest"/>
      <output message="tns:RatesResponse"/>
    </operation>
  </portType>
  <binding name="CurrencyBinding" type="tns:CurrencyPortType">
    <soap:binding style="${operationStyle ? 'document' : 'rpc'}" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="Convert">
      <soap:operation soapAction="urn:currency#Convert"${operationStyle ? ` style="${operationStyle}"` : ''}/>
      <input><soap:body use="encoded" namespace="urn:currency" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/></input>
      <output><soap:body use="encoded" namespace="urn:currency" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/></output>
    </operation>
    <operation name="Rates">
      <soap:operation soapAction="urn:currency#Rates"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>
  <service name="CurrencyService">
    <port name="CurrencyPort" binding="tns:CurrencyBinding">
      <soap:address location="http://localhost:8080/currency"/>
    </port>
  </service>
</definitions>`

describe('WSDL rpc style', () => {
  it('wraps every part in an element named after the operation, in the soap:body namespace', () => {
    expect(body(importWsdl(currency()), 'Convert')).toBe(
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"\n' +
        '               xmlns:tns="urn:currency">\n' +
        '  <soap:Body>\n' +
        '    <tns:Convert soap:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n' +
        '      <from></from>\n' +
        '      <to></to>\n' +
        '      <amount></amount>\n' +
        '    </tns:Convert>\n' +
        '  </soap:Body>\n' +
        '</soap:Envelope>\n'
    )
  })

  it('uses the target namespace when soap:body names none, and no encodingStyle for literal', () => {
    const rates = body(importWsdl(currency()), 'Rates')
    expect(rates).toContain('xmlns:tns="urn:currency-defs"')
    expect(rates).toContain('    <tns:Rates>\n      <base></base>\n    </tns:Rates>\n')
  })

  it('follows the style set on the operation over the binding default', () => {
    const result = importWsdl(currency('rpc'))
    expect(body(result, 'Convert')).toContain('<tns:Convert soap:encodingStyle=')
    // Rates inherits the binding's document style: its message part is the element.
    expect(body(result, 'Rates')).toContain('<tns:base>')
  })
})
