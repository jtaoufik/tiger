import { describe, expect as vi, it } from 'vitest'
import { deepEqual, expect } from '../../src/core/scriptExpect'

/** The message a Chai-style assertion throws, or null when it passes. */
const failure = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (e) {
    return (e as Error).message
  }
}

describe('Chai words the subset does not know', () => {
  it('throw instead of passing silently', () => {
    vi(failure(() => (expect(false) as any).to.be.truthy)).toBe('Invalid Chai property: truthy')
    vi(failure(() => (expect(1) as any).to.exists)).toBe('Invalid Chai property: exists')
    vi(failure(() => (expect({}) as any).to.have.length.foo)).toBe('Invalid Chai property: foo')
  })

  it('do not include the rest of the Chai 4 vocabulary', () => {
    vi(failure(() => expect(5).to.be.finite)).toBeNull()
    vi(failure(() => expect(NaN).to.not.be.finite)).toBeNull()
    vi(failure(() => expect(Infinity).to.be.finite)).toBe('expected Infinity to be a finite number')
    vi(failure(() => expect('5').to.be.finite)).toBe("expected '5' to be a finite number")
    vi(failure(() => expect(Object.freeze({})).to.be.frozen)).toBeNull()
    vi(failure(() => expect({}).to.be.frozen)).toBe('expected {} to be frozen')
    vi(failure(() => expect(Object.seal({})).to.be.sealed)).toBeNull()
    vi(failure(() => expect({}).to.not.be.sealed)).toBeNull()
    vi(failure(() => expect({}).to.be.extensible)).toBeNull()
    vi(failure(() => expect(Object.preventExtensions({})).to.be.extensible)).toBe('expected {} to be extensible')
    vi(failure(() => expect((function () { return arguments })()).to.be.arguments)).toBeNull()
    vi(failure(() => expect([]).to.be.arguments)).toBe('expected [] to be arguments but got array')

    vi(failure(() => expect({ go() {} }).to.respondTo('go'))).toBeNull()
    vi(failure(() => expect({ go: 1 }).to.respondTo('go'))).toBe("expected {\"go\":1} to respond to 'go'")
    class Cat {
      meow(): void {}
      static purr(): void {}
    }
    vi(failure(() => expect(Cat).to.respondTo('meow'))).toBeNull()
    vi(failure(() => expect(Cat).itself.to.respondTo('purr'))).toBeNull()
    vi(failure(() => expect(Cat).itself.to.not.respondTo('meow'))).toBeNull()
    vi(failure(() => expect(Cat).to.respondsTo('purr'))).toBe("expected [Function] to respond to 'purr'")

    const obj = { a: 1 }
    vi(failure(() => expect(obj).to.have.ownPropertyDescriptor('a'))).toBeNull()
    vi(failure(() => expect(obj).to.haveOwnPropertyDescriptor('a', { value: 1, writable: true, enumerable: true, configurable: true }))).toBeNull()
    vi(failure(() => expect(obj).to.have.ownPropertyDescriptor('a', { value: 2 }))).toMatch(/^expected the own property descriptor for 'a' on .* to match/)
    vi(failure(() => expect(obj).to.have.ownPropertyDescriptor('b'))).toBe("expected {\"a\":1} to have an own property descriptor for 'b'")
    vi(failure(() => expect(obj).to.have.ownPropertyDescriptor('a').that.has.property('value', 1))).toBeNull()

    const counter = { n: 0, s: 'a' }
    const inc = () => (counter.n += 2)
    const dec = () => (counter.n -= 1)
    vi(failure(() => expect(inc).to.change(counter, 'n'))).toBeNull()
    vi(failure(() => expect(inc).to.increase(counter, 'n').by(2))).toBeNull()
    vi(failure(() => expect(dec).to.decrease(counter, 'n').by(1))).toBeNull()
    vi(failure(() => expect(dec).to.change(counter, 'n').by(1))).toBeNull()
    vi(failure(() => expect(() => undefined).to.not.change(counter, 'n'))).toBeNull()
    vi(failure(() => expect(() => undefined).to.change(counter, 's'))).toBe('expected .s to change')
    vi(failure(() => expect(inc).to.increase(counter, 'n').by(3))).toBe('expected .n to increase by 3')
    vi(failure(() => expect(inc).to.decrease(counter, 'n'))).toBe('expected .n to decrease')
    vi(failure(() => expect(inc).to.increases(() => counter.n).by(2))).toBeNull()
    vi(failure(() => expect(5).to.be.above(1).by(2))).toBe('expected .by to follow .change, .increase or .decrease')

    vi(failure(() => expect.fail())).toBe('expect.fail()')
    vi(failure(() => expect.fail('nope'))).toBe('nope')
    vi(failure(() => expect.fail(1, 2, 'custom'))).toBe('custom')
  })

  it('leave the names tooling reads alone', () => {
    const a = expect(1) as any
    vi(a.then).toBeUndefined()
    vi(JSON.stringify(a)).toBeTypeOf('string')
  })
})

describe('equal', () => {
  it('is strict equality: NaN is not NaN, 0 is -0', () => {
    vi(failure(() => expect(NaN).to.equal(NaN))).toBe('expected NaN to equal NaN')
    vi(failure(() => expect(0).to.equal(-0))).toBeNull()
    vi(failure(() => expect(1).to.equal(1))).toBeNull()
    vi(failure(() => expect({ a: 1 }).to.deep.equal({ a: 1 }))).toBeNull()
  })
})

describe('deepEqual', () => {
  it('compares dates, regexps, maps, sets and arrays by what they hold', () => {
    vi(deepEqual(new Date(1), new Date(1))).toBe(true)
    vi(deepEqual(new Date(1), new Date(2))).toBe(false)
    vi(deepEqual(/a/g, /a/g)).toBe(true)
    vi(deepEqual(/a/g, /a/i)).toBe(false)
    vi(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
    vi(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
    vi(deepEqual(new Set([{ a: 1 }]), new Set([{ a: 1 }]))).toBe(true)
    vi(deepEqual(new Set([1]), new Set([2]))).toBe(false)
    vi(deepEqual([1, [2]], [1, [2]])).toBe(true)
    vi(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    vi(deepEqual(new Date(1), {})).toBe(false)
    vi(failure(() => expect(new Date(1)).to.eql(new Date(2)))).toMatch(/to deeply equal/)
  })
})

describe('keys', () => {
  const obj = { a: 1, b: 2 }
  it('means exactly those keys by default (and after .all)', () => {
    vi(failure(() => expect(obj).to.have.keys('a', 'b'))).toBeNull()
    vi(failure(() => expect(obj).to.have.all.keys(['b', 'a']))).toBeNull()
    vi(failure(() => expect(obj).to.have.keys('a'))).toBe('expected {"a":1,"b":2} to have all keys ["a"]')
    vi(failure(() => expect(obj).to.have.keys('a', 'b', 'c'))).toMatch(/to have all keys/)
    vi(failure(() => expect(obj).to.not.have.keys('a'))).toBeNull()
  })

  it('means a subset after .include / .contain, and at least one after .any', () => {
    vi(failure(() => expect(obj).to.include.keys('a'))).toBeNull()
    vi(failure(() => expect(obj).to.contain.all.keys('a', 'b'))).toBeNull()
    vi(failure(() => expect(obj).to.include.keys('c'))).toBe('expected {"a":1,"b":2} to contain all keys ["c"]')
    vi(failure(() => expect(obj).to.have.any.keys('c', 'a'))).toBeNull()
    vi(failure(() => expect(obj).to.have.any.keys('c'))).toMatch(/to have any keys/)
    vi(failure(() => expect(obj).to.have.keys({ a: 0, b: 0 }))).toBeNull()
    vi(failure(() => expect(new Map([['k', 1]])).to.have.keys('k'))).toBeNull()
    vi(failure(() => expect(5).to.have.keys('a'))).toMatch(/to have all keys/)
  })
})

describe('property', () => {
  it('goes on with the value of the property', () => {
    vi(failure(() => expect({ id: 5 }).to.have.property('id').that.is.a('number'))).toBeNull()
    vi(failure(() => expect({ id: '5' }).to.have.property('id').that.is.a('number'))).toBe("expected '5' to be a number")
    vi(failure(() => expect({ id: 5 }).to.have.property('id', 5).and.equal(5))).toBeNull()
    vi(failure(() => expect({ id: 5 }).to.have.property('id', 6))).toBe("expected property 'id' of {\"id\":5} to be 6, got 5")
    vi(failure(() => expect({ id: 5 }).to.not.have.property('x'))).toBeNull()
    vi(failure(() => expect({ id: 5 }).to.not.have.property('id', 6))).toBeNull()
    vi(failure(() => expect({ id: 5 }).to.have.property('x'))).toBe("expected {\"id\":5} to have property 'x'")
    vi(failure(() => expect('abc').to.have.property('length', 3))).toBeNull()
  })

  it('reads nested and own properties', () => {
    const o = { a: { b: [{ c: 1 }] } }
    vi(failure(() => expect(o).to.have.nested.property('a.b[0].c', 1))).toBeNull()
    vi(failure(() => expect(o).to.have.nested.property('a.b.0.c').that.equals(1))).toBeNull()
    vi(failure(() => expect(o).to.have.nested.property('a.x.c'))).toBe("expected {\"a\":{\"b\":[{\"c\":1}]}} to have nested property 'a.x.c'")
    vi(failure(() => expect(Object.create({ p: 1 })).to.have.property('p'))).toBeNull()
    vi(failure(() => expect(Object.create({ p: 1 })).to.have.own.property('p'))).toMatch(/own property 'p'/)
    vi(failure(() => expect({ p: 1 }).to.haveOwnProperty('p', 1))).toBeNull()
    vi(failure(() => expect({ p: { q: 1 } }).to.have.deep.property('p', { q: 1 }))).toBeNull()
  })
})

describe('length', () => {
  it('is both a method and a chain into the comparisons', () => {
    vi(failure(() => expect([1, 2, 3]).to.have.length(3))).toBeNull()
    vi(failure(() => expect([1, 2, 3]).to.have.lengthOf(3))).toBeNull()
    vi(failure(() => expect([1, 2, 3]).to.have.length.above(2))).toBeNull()
    vi(failure(() => expect([1, 2, 3]).to.have.lengthOf.below(2))).toBe("expected [1,2,3] to have a length below 2")
    vi(failure(() => expect('abcd').to.have.length.within(2, 4))).toBeNull()
    vi(failure(() => expect('abcd').to.have.length.of.at.least(5))).toMatch(/to have a length at least 5/)
    vi(failure(() => expect([1]).to.have.lengthOf(2))).toBe('expected [1] to have a length of 2 but got 1')
    vi(failure(() => expect([1]).to.not.have.length(2))).toBeNull()
  })
})

describe('string, closeTo, include, members, throw', () => {
  it('string and closeTo', () => {
    vi(failure(() => expect('foobar').to.have.string('oba'))).toBeNull()
    vi(failure(() => expect('foobar').to.have.string('x'))).toBe("expected 'foobar' to contain 'x'")
    vi(failure(() => expect(1.5).to.be.closeTo(1, 0.5))).toBeNull()
    vi(failure(() => expect(1.5).to.be.approximately(1, 0.4))).toBe('expected 1.5 to be close to 1 +/- 0.4')
  })

  it('include is a method and a chain, and knows maps and sets', () => {
    vi(failure(() => expect([1, 2]).to.include(2))).toBeNull()
    vi(failure(() => expect([{ a: 1 }]).to.deep.include({ a: 1 }))).toBeNull()
    vi(failure(() => expect([{ a: 1 }]).to.include({ a: 1 }))).toMatch(/to include/)
    vi(failure(() => expect(new Set([1])).to.include(1))).toBeNull()
    vi(failure(() => expect(new Map([['k', 'v']])).to.contain('v'))).toBeNull()
    vi(failure(() => expect({ a: 1, b: 2 }).to.include({ a: 1 }))).toBeNull()
    vi(failure(() => expect('hello').to.not.contain('x'))).toBeNull()
  })

  it('members, ordered or not', () => {
    vi(failure(() => expect([2, 1]).to.have.members([1, 2]))).toBeNull()
    vi(failure(() => expect([2, 1]).to.have.ordered.members([1, 2]))).toMatch(/ordered members/)
    vi(failure(() => expect([{ a: 1 }]).to.have.deep.members([{ a: 1 }]))).toBeNull()
  })

  it('throw checks a function and goes on with the error', () => {
    const boom = () => {
      throw new TypeError('bad input')
    }
    vi(failure(() => expect(boom).to.throw())).toBeNull()
    vi(failure(() => expect(boom).to.throw('bad'))).toBeNull()
    vi(failure(() => expect(boom).to.throw(/input$/).with.property('name', 'TypeError'))).toBeNull()
    vi(failure(() => expect(boom).to.throw(TypeError))).toBeNull()
    vi(failure(() => expect(boom).to.throw(RangeError))).toMatch(/expected function to throw/)
    vi(failure(() => expect(() => 1).to.not.throw())).toBeNull()
    vi(failure(() => expect(() => 1).to.throw())).toBe('expected function to throw an error but it did not throw')
  })

  it('a / an name maps, sets, promises and errors like Chai', () => {
    vi(failure(() => expect(new Map()).to.be.a('map'))).toBeNull()
    vi(failure(() => expect(new Set()).to.be.a('set'))).toBeNull()
    vi(failure(() => expect(Promise.resolve()).to.be.a('promise'))).toBeNull()
    vi(failure(() => expect(new Error('x')).to.be.an('error'))).toBeNull()
    vi(failure(() => expect([1]).to.be.an('array').that.is.not.empty)).toBeNull()
    vi(failure(() => expect(null).to.be.an('object'))).toBe('expected null to be a object')
  })
})
