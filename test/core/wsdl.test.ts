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
    // No <types> schema here, so the body falls back to a placeholder comment.
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

// A document/literal service whose <types> schema declares the operation's
// parameters. They must be expanded into the request body so it is sendable.
const withParams = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                  xmlns:xs="http://www.w3.org/2001/XMLSchema"
                  xmlns:tns="http://example.com/temp"
                  name="TempService"
                  targetNamespace="http://example.com/temp">
  <wsdl:types>
    <xs:schema targetNamespace="http://example.com/temp">
      <xs:element name="CelsiusToFahrenheit">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="nCelsius" type="xs:decimal"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="C2FIn">
    <wsdl:part name="parameters" element="tns:CelsiusToFahrenheit"/>
  </wsdl:message>
  <wsdl:portType name="TempPort">
    <wsdl:operation name="CelsiusToFahrenheit">
      <wsdl:input message="tns:C2FIn"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="TempBinding" type="tns:TempPort">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="CelsiusToFahrenheit">
      <soap:operation soapAction="" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="TempService">
    <wsdl:port name="TempPort" binding="tns:TempBinding">
      <soap:address location="https://example.com/temp.wso"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`

describe('importWsdl (parameter expansion)', () => {
  it('expands the operation parameters into the body from the <types> schema', () => {
    const [op] = importWsdl(withParams).requests
    expect(op.request.body.content).toContain('<tns:CelsiusToFahrenheit>')
    expect(op.request.body.content).toContain('<tns:nCelsius></tns:nCelsius>')
    // With real params expanded, there is no placeholder comment.
    expect(op.request.body.content).not.toContain('<!-- fill in fields -->')
  })

  it('still sends a (mandatory) SOAPAction header even when soapAction is empty', () => {
    const [op] = importWsdl(withParams).requests
    const headers = Object.fromEntries(op.request.headers.map((h) => [h.name, h.value]))
    expect(headers['Content-Type']).toBe('text/xml; charset=utf-8')
    expect(headers['SOAPAction']).toBe('""')
  })
})

// Dual-binding WSDL: one portType, a SOAP 1.1 binding and a SOAP 1.2 binding.
// The importer should emit a single (SOAP 1.1) set of operations, not duplicates.
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

describe('importWsdl (dual binding)', () => {
  it('emits a single SOAP 1.1 set of operations, not 1.1 + 1.2 duplicates', () => {
    const result = importWsdl(dualBinding)
    expect(result.requests).toHaveLength(1)
    const [op] = result.requests
    expect(op.request.name).toBe('Hello')
    expect(op.request.url).toBe('https://example.com/dual11.svc')
    const headers = Object.fromEntries(op.request.headers.map((h) => [h.name, h.value]))
    expect(headers['Content-Type']).toBe('text/xml; charset=utf-8')
    expect(headers['SOAPAction']).toBe('"http://example.com/dual/Hello"')
  })
})

// A SOAP service that also exposes a non-SOAP HTTP GET binding (common for .asmx
// services). The HTTP binding must be ignored - it is not a SOAP request.
const withHttpBinding = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                  xmlns:http="http://schemas.xmlsoap.org/wsdl/http/"
                  xmlns:tns="http://example.com/mix"
                  name="MixService"
                  targetNamespace="http://example.com/mix">
  <wsdl:message name="OpIn"><wsdl:part name="parameters" element="tns:Op"/></wsdl:message>
  <wsdl:portType name="MixPort">
    <wsdl:operation name="Op"><wsdl:input message="tns:OpIn"/></wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="MixSoap" type="tns:MixPort">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="Op">
      <soap:operation soapAction="urn:Op" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:binding name="MixHttpGet" type="tns:MixPort">
    <http:binding verb="GET"/>
    <wsdl:operation name="Op"><http:operation location="/Op"/></wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="MixService">
    <wsdl:port name="SoapPort" binding="tns:MixSoap">
      <soap:address location="https://example.com/mix.asmx"/>
    </wsdl:port>
    <wsdl:port name="HttpPort" binding="tns:MixHttpGet">
      <http:address location="https://example.com/mix.asmx"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`

describe('importWsdl (non-SOAP binding)', () => {
  it('ignores HTTP GET/POST bindings and only emits SOAP requests', () => {
    const result = importWsdl(withHttpBinding)
    expect(result.requests).toHaveLength(1)
    const [op] = result.requests
    expect(op.request.method).toBe('post')
    const headers = Object.fromEntries(op.request.headers.map((h) => [h.name, h.value]))
    expect(headers['SOAPAction']).toBe('"urn:Op"')
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
