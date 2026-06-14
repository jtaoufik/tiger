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

// Dual-binding WSDL: one portType, one SOAP 1.1 binding and one SOAP 1.2 binding.
const dualBinding = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                  xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"
                  xmlns:tns="http://example.com/dual"
                  name="DualService"
                  targetNamespace="http://example.com/dual">
  <wsdl:message name="HelloIn">
    <wsdl:part name="parameters" element="tns:Hello"/>
  </wsdl:message>
  <wsdl:portType name="DualPort">
    <wsdl:operation name="Hello">
      <wsdl:input message="tns:HelloIn"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="DualSoap11" type="tns:DualPort">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="Hello">
      <soap:operation soapAction="http://example.com/dual/Hello" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:binding name="DualSoap12" type="tns:DualPort">
    <soap12:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="Hello">
      <soap12:operation soapAction="http://example.com/dual/Hello12" style="document"/>
      <wsdl:input><soap12:body use="literal"/></wsdl:input>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="DualService">
    <wsdl:port name="Soap11Port" binding="tns:DualSoap11">
      <soap:address location="https://example.com/dual11.svc"/>
    </wsdl:port>
    <wsdl:port name="Soap12Port" binding="tns:DualSoap12">
      <soap12:address location="https://example.com/dual12.svc"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`

describe('importWsdl (dual binding — per-binding SOAP version detection)', () => {
  it('correctly tags the 1.1 binding with text/xml and SOAPAction, the 1.2 binding with application/soap+xml and no SOAPAction', () => {
    const result = importWsdl(dualBinding)
    expect(result.requests).toHaveLength(2)
    const [op11, op12] = result.requests
    const h11 = Object.fromEntries(op11.request.headers.map((h) => [h.name, h.value]))
    const h12 = Object.fromEntries(op12.request.headers.map((h) => [h.name, h.value]))

    // SOAP 1.1 binding
    expect(h11['Content-Type']).toBe('text/xml; charset=utf-8')
    expect(h11['SOAPAction']).toBe('"http://example.com/dual/Hello"')

    // SOAP 1.2 binding
    expect(h12['Content-Type']).toContain('application/soap+xml')
    expect(h12['SOAPAction']).toBeUndefined()
  })
})

// No-soapAction: operation with soapAction="" should produce no SOAPAction header.
const soap11NoAction = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                  xmlns:tns="http://example.com/noaction"
                  name="NoActionService"
                  targetNamespace="http://example.com/noaction">
  <wsdl:message name="PingIn">
    <wsdl:part name="parameters" element="tns:Ping"/>
  </wsdl:message>
  <wsdl:portType name="NoActionPort">
    <wsdl:operation name="Ping">
      <wsdl:input message="tns:PingIn"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="NoActionBinding" type="tns:NoActionPort">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="Ping">
      <soap:operation soapAction="" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="NoActionService">
    <wsdl:port name="NoActionPort" binding="tns:NoActionBinding">
      <soap:address location="https://example.com/noaction.svc"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`

describe('importWsdl (empty SOAPAction)', () => {
  it('omits the SOAPAction header when soapAction is empty', () => {
    const result = importWsdl(soap11NoAction)
    expect(result.requests).toHaveLength(1)
    const [op] = result.requests
    const headers = Object.fromEntries(op.request.headers.map((h) => [h.name, h.value]))
    expect(headers['Content-Type']).toBe('text/xml; charset=utf-8')
    expect(headers['SOAPAction']).toBeUndefined()
  })

  it('omits the SOAPAction header when no soap:operation child is present', () => {
    // No soapAction attribute at all — soapAction will be ''
    const noOpChild = soap11NoAction.replace(
      '<soap:operation soapAction="" style="document"/>',
      ''
    )
    const result = importWsdl(noOpChild)
    const [op] = result.requests
    const names = op.request.headers.map((h) => h.name)
    expect(names).not.toContain('SOAPAction')
  })
})

describe('importWsdl (robustness)', () => {
  it('returns empty requests for empty string input', () => {
    const result = importWsdl('')
    expect(result.requests).toEqual([])
  })

  it('returns empty requests for nonsense XML', () => {
    const result = importWsdl('<nonsense/>')
    expect(result.requests).toEqual([])
  })
})
