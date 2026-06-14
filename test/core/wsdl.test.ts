import { describe, expect, it } from 'vitest'
import { importWsdl } from '../../src/core/import/wsdl'

const soap11 = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                  xmlns:tns="http://example.com/weather"
                  name="Weather"
                  targetNamespace="http://example.com/weather">
  <wsdl:message name="GetWeatherSoapIn">
    <wsdl:part name="parameters" element="tns:GetWeather"/>
  </wsdl:message>
  <wsdl:message name="GetWeatherSoapOut">
    <wsdl:part name="parameters" element="tns:GetWeatherResponse"/>
  </wsdl:message>
  <wsdl:portType name="WeatherSoap">
    <wsdl:operation name="GetWeather">
      <wsdl:input message="tns:GetWeatherSoapIn"/>
      <wsdl:output message="tns:GetWeatherSoapOut"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="WeatherSoap" type="tns:WeatherSoap">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="GetWeather">
      <soap:operation soapAction="http://example.com/weather/GetWeather" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="WeatherService">
    <wsdl:port name="WeatherSoap" binding="tns:WeatherSoap">
      <soap:address location="https://example.com/weather.asmx"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`

const soap12 = `<?xml version="1.0" encoding="utf-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
             xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"
             xmlns:tns="http://example.com/calc"
             name="Calc"
             targetNamespace="http://example.com/calc">
  <message name="AddIn"><part name="parameters" element="tns:Add"/></message>
  <portType name="CalcSoap">
    <operation name="Add"><input message="tns:AddIn"/></operation>
  </portType>
  <binding name="CalcSoap12" type="tns:CalcSoap">
    <soap12:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <operation name="Add">
      <soap12:operation soapAction="http://example.com/calc/Add" style="document"/>
      <input><soap12:body use="literal"/></input>
    </operation>
  </binding>
  <service name="CalcService">
    <port name="CalcSoap12" binding="tns:CalcSoap12">
      <soap12:address location="https://example.com/calc.svc"/>
    </port>
  </service>
</definitions>`

describe('importWsdl (SOAP 1.1)', () => {
  it('reads the service name and source', () => {
    const result = importWsdl(soap11)
    expect(result.name).toBe('WeatherService')
    expect(result.source).toBe('wsdl')
  })

  it('creates one POST request per binding operation under the service folder', () => {
    const result = importWsdl(soap11)
    expect(result.requests).toHaveLength(1)
    const [op] = result.requests
    expect(op.path).toEqual(['WeatherService'])
    expect(op.request.name).toBe('GetWeather')
    expect(op.request.method).toBe('post')
    expect(op.request.url).toBe('https://example.com/weather.asmx')
    expect(op.request.body.type).toBe('xml')
  })

  it('sets text/xml content-type and a quoted SOAPAction header', () => {
    const [op] = importWsdl(soap11).requests
    const headers = Object.fromEntries(op.request.headers.map((h) => [h.name, h.value]))
    expect(headers['Content-Type']).toBe('text/xml; charset=utf-8')
    expect(headers['SOAPAction']).toBe('"http://example.com/weather/GetWeather"')
  })

  it('wraps the resolved request element in a SOAP 1.1 envelope', () => {
    const [op] = importWsdl(soap11).requests
    expect(op.request.body.content).toContain('http://schemas.xmlsoap.org/soap/envelope/')
    expect(op.request.body.content).toContain('xmlns:tns="http://example.com/weather"')
    expect(op.request.body.content).toContain('<tns:GetWeather>')
    expect(op.request.body.content).toContain('<!-- fill in fields -->')
  })
})

describe('importWsdl (SOAP 1.2)', () => {
  it('uses the SOAP 1.2 content-type and envelope namespace', () => {
    const result = importWsdl(soap12)
    expect(result.name).toBe('CalcService')
    const [op] = result.requests
    expect(op.request.url).toBe('https://example.com/calc.svc')
    const headers = Object.fromEntries(op.request.headers.map((h) => [h.name, h.value]))
    expect(headers['Content-Type']).toBe(
      'application/soap+xml; charset=utf-8; action="http://example.com/calc/Add"'
    )
    expect(headers['SOAPAction']).toBeUndefined()
    expect(op.request.body.content).toContain('http://www.w3.org/2003/05/soap-envelope')
    expect(op.request.body.content).toContain('<tns:Add>')
  })
})
