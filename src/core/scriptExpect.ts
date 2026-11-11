/**
 * A small, dependency-free subset of Chai's BDD `expect` API, enough to run
 * the assertions people actually write in Postman (`pm.expect`), Insomnia
 * (`insomnia.expect`) and Bruno (`expect`) tests:
 *
 *   expect(x).to.equal(1)            expect(x).to.eql({ a: 1 })
 *   expect(x).to.be.a('string')      expect(x).to.include('ok')
 *   expect(x).to.have.property('id') expect(list).to.have.lengthOf(3)
 *   expect(n).to.be.above(2)         expect(s).to.match(/^ok/)
 *   expect(x).to.be.oneOf([1, 2])    expect(x).to.not.be.empty
 *   expect(x).to.be.true / .false / .null / .undefined / .ok / .exist
 *
 * It follows Chai 4 where a test would otherwise pass or fail differently:
 * a word Chai does not know throws ("Invalid Chai property"), `.keys` means
 * exactly those keys unless `.include` or `.any` says otherwise, `.equal` is
 * `===`, `.property(name)` goes on with the property's value, and `.length`
 * chains into `.above` and friends. The `Assertion` class is the one list of
 * the vocabulary: every public member is a word a script may use.
 *
 * Failures throw an Error with a Chai-like message ("expected 404 to equal
 * 200"), which `test()` records as a failed test.
 */

function show(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  if (value === undefined || typeof value === 'number') return String(value)
  if (typeof value === 'function') return '[Function]'
  if (value instanceof RegExp || value instanceof Date) return String(value)
  if (value instanceof Map || value instanceof Set) return show([...value])
  try {
    const text = JSON.stringify(value)
    return text.length > 120 ? `${text.slice(0, 117)}...` : text
  } catch {
    return String(value)
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  // Dates, regexps, maps and sets have no own keys: compare what they hold.
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime())
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && String(a) === String(b)
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false
    return true
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false
    const rest = [...b]
    return [...a].every((v) => rest.some((w) => deepEqual(v, w)))
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && a.length !== (b as unknown[]).length) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  )
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (value instanceof RegExp) return 'regexp'
  if (value instanceof Date) return 'date'
  if (value instanceof Map) return 'map'
  if (value instanceof Set) return 'set'
  if (value instanceof Promise) return 'promise'
  if (value instanceof Error) return 'error'
  return typeof value
}

function sizeOf(value: unknown): number | undefined {
  if (typeof value === 'string' || Array.isArray(value)) return value.length
  if (value instanceof Map || value instanceof Set) return value.size
  if (value && typeof value === 'object') return Object.keys(value).length
  return undefined
}

/** The keys `.keys` compares, or null when the value has none. */
function keysOf(value: unknown): string[] | null {
  if (value instanceof Map || value instanceof Set) return [...value.keys()].map(String)
  if (value && typeof value === 'object') return Object.keys(value)
  return null
}

function includes(haystack: unknown, needle: unknown, deep: boolean): boolean {
  const same = (item: unknown) => (deep ? deepEqual(item, needle) : item === needle)
  if (typeof haystack === 'string') return haystack.includes(String(needle))
  if (Array.isArray(haystack)) return haystack.some(same)
  if (haystack instanceof Set) return [...haystack].some(same)
  if (haystack instanceof Map) return [...haystack.values()].some(same)
  if (haystack && typeof haystack === 'object' && needle && typeof needle === 'object') {
    // Object subset: every key of the needle is present with an equal value.
    return Object.entries(needle).every(([k, v]) =>
      deepEqual((haystack as Record<string, unknown>)[k], v)
    )
  }
  return false
}

/** `a.b[0].c` resolved step by step, as Chai's `.nested.property` reads it. */
function nestedProperty(root: unknown, path: string): { has: boolean; value: unknown } {
  let current: unknown = root
  for (const step of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (current == null || !(step in Object(current))) return { has: false, value: undefined }
    current = (current as Record<string, unknown>)[step]
  }
  return { has: true, value: current }
}

/**
 * A Chai chainable method: `.length(3)` calls it, `.length.above(2)` sets its
 * flag and goes on with the assertion. Reads go to the assertion itself, so a
 * word it does not know still throws.
 */
function chainable<T extends object, A extends unknown[]>(
  self: T,
  onChain: () => void,
  call: (...args: A) => unknown
): Chain<T, A> {
  const target = function () {} as unknown as Chain<T, A>
  return new Proxy(target, {
    get(_t, prop) {
      onChain()
      const value = (self as Record<PropertyKey, unknown>)[prop]
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(self) : value
    },
    apply: (_t, _this, args) => call(...(args as A))
  })
}

/** An assertion that can also be called: `.length(3)` and `.length.above(2)`. */
type Chain<T, A extends unknown[]> = T & ((...args: A) => T)

export class Assertion {
  private negate = false
  private deepFlag = false
  private anyFlag = false
  private containsFlag = false
  private nestedFlag = false
  private ownFlag = false
  private lengthFlag = false
  private orderedFlag = false
  private itselfFlag = false
  /** What `.change`/`.increase`/`.decrease` saw, for `.by(delta)`. */
  private delta?: { kind: 'change' | 'increase' | 'decrease'; before: number; after: number; what: string }

  constructor(
    private readonly actual: unknown,
    private readonly message?: string
  ) {}

  private check(pass: boolean, positive: string, negative: string): this {
    if (pass === this.negate) {
      const text = this.negate ? negative : positive
      throw new Error(this.message ? `${this.message}: ${text}` : text)
    }
    return this
  }

  private get subject(): string {
    return `expected ${show(this.actual)}`
  }

  /** Chai goes on with a new subject after `.property()` and `.throw()`. */
  private derive(actual: unknown): Assertion {
    return expect(actual, this.message)
  }

  /** What `.above` and friends compare: the value, or its length after `.length`. */
  private measure(): { value: number; what: string } {
    if (this.lengthFlag) return { value: sizeOf(this.actual) ?? NaN, what: `${this.subject} to have a length` }
    return { value: this.actual as number, what: this.subject }
  }

  // Language chains: readable, no behaviour.
  get to(): this {
    return this
  }
  get be(): this {
    return this
  }
  get been(): this {
    return this
  }
  get is(): this {
    return this
  }
  get that(): this {
    return this
  }
  get which(): this {
    return this
  }
  get and(): this {
    return this
  }
  get has(): this {
    return this
  }
  get have(): this {
    return this
  }
  get with(): this {
    return this
  }
  get at(): this {
    return this
  }
  get of(): this {
    return this
  }
  get same(): this {
    return this
  }
  get but(): this {
    return this
  }
  get does(): this {
    return this
  }
  get still(): this {
    return this
  }
  get also(): this {
    return this
  }

  // Flags.
  get not(): this {
    this.negate = !this.negate
    return this
  }
  get deep(): this {
    this.deepFlag = true
    return this
  }
  get nested(): this {
    this.nestedFlag = true
    return this
  }
  get own(): this {
    this.ownFlag = true
    return this
  }
  get any(): this {
    this.anyFlag = true
    return this
  }
  get all(): this {
    this.anyFlag = false
    return this
  }
  get ordered(): this {
    this.orderedFlag = true
    return this
  }
  get itself(): this {
    this.itselfFlag = true
    return this
  }

  // Chainable methods: a flag when read, an assertion when called.
  get length(): Chain<this, [n: number]> {
    return chainable(this, () => (this.lengthFlag = true), (n) => this.sizeIs(n))
  }
  get lengthOf(): Chain<this, [n: number]> {
    return this.length
  }
  get include(): Chain<this, [needle: unknown]> {
    return chainable(this, () => (this.containsFlag = true), (needle) => this.includeValue(needle))
  }
  get includes(): Chain<this, [needle: unknown]> {
    return this.include
  }
  get contain(): Chain<this, [needle: unknown]> {
    return this.include
  }
  get contains(): Chain<this, [needle: unknown]> {
    return this.include
  }
  get a(): Chain<this, [type: string]> {
    return chainable(this, () => undefined, (type) => this.typeOf(type))
  }
  get an(): Chain<this, [type: string]> {
    return this.a
  }

  // Terminal getters.
  get ok(): this {
    return this.check(!!this.actual, `${this.subject} to be truthy`, `${this.subject} to be falsy`)
  }
  get true(): this {
    return this.check(this.actual === true, `${this.subject} to be true`, `${this.subject} to not be true`)
  }
  get false(): this {
    return this.check(this.actual === false, `${this.subject} to be false`, `${this.subject} to not be false`)
  }
  get null(): this {
    return this.check(this.actual === null, `${this.subject} to be null`, `${this.subject} to not be null`)
  }
  get undefined(): this {
    return this.check(
      this.actual === undefined,
      `${this.subject} to be undefined`,
      `${this.subject} to not be undefined`
    )
  }
  get NaN(): this {
    return this.check(Number.isNaN(this.actual), `${this.subject} to be NaN`, `${this.subject} to not be NaN`)
  }
  get exist(): this {
    return this.check(this.actual != null, `${this.subject} to exist`, `${this.subject} to not exist`)
  }
  get empty(): this {
    return this.check(sizeOf(this.actual) === 0, `${this.subject} to be empty`, `${this.subject} not to be empty`)
  }
  get finite(): this {
    return this.check(
      typeof this.actual === 'number' && Number.isFinite(this.actual),
      `${this.subject} to be a finite number`,
      `${this.subject} to not be a finite number`
    )
  }
  // Primitives count as frozen, sealed and not extensible, as in Chai (and ES2015).
  get frozen(): this {
    return this.check(Object.isFrozen(this.actual), `${this.subject} to be frozen`, `${this.subject} to not be frozen`)
  }
  get sealed(): this {
    return this.check(Object.isSealed(this.actual), `${this.subject} to be sealed`, `${this.subject} to not be sealed`)
  }
  get extensible(): this {
    return this.check(
      Object.isExtensible(this.actual),
      `${this.subject} to be extensible`,
      `${this.subject} to not be extensible`
    )
  }
  get arguments(): this {
    const tag = Object.prototype.toString.call(this.actual)
    return this.check(
      tag === '[object Arguments]',
      `${this.subject} to be arguments but got ${typeName(this.actual)}`,
      `${this.subject} to not be arguments`
    )
  }

  // Methods.
  equal(expected: unknown): this {
    // Chai's strict equality: NaN never equals NaN, 0 equals -0.
    const pass = this.deepFlag ? deepEqual(this.actual, expected) : this.actual === expected
    return this.check(
      pass,
      `${this.subject} to equal ${show(expected)}`,
      `${this.subject} to not equal ${show(expected)}`
    )
  }
  equals(expected: unknown): this {
    return this.equal(expected)
  }
  eq(expected: unknown): this {
    return this.equal(expected)
  }
  eql(expected: unknown): this {
    return this.check(
      deepEqual(this.actual, expected),
      `${this.subject} to deeply equal ${show(expected)}`,
      `${this.subject} to not deeply equal ${show(expected)}`
    )
  }
  eqls(expected: unknown): this {
    return this.eql(expected)
  }
  private typeOf(type: string): this {
    const want = type.toLowerCase()
    return this.check(
      typeName(this.actual) === want,
      `${this.subject} to be a ${want}`,
      `${this.subject} not to be a ${want}`
    )
  }
  instanceOf(ctor: new (...args: never[]) => unknown): this {
    return this.check(
      this.actual instanceof ctor,
      `${this.subject} to be an instance of ${ctor.name}`,
      `${this.subject} to not be an instance of ${ctor.name}`
    )
  }
  instanceof(ctor: new (...args: never[]) => unknown): this {
    return this.instanceOf(ctor)
  }
  private includeValue(needle: unknown): this {
    return this.check(
      includes(this.actual, needle, this.deepFlag),
      `${this.subject} to include ${show(needle)}`,
      `${this.subject} to not include ${show(needle)}`
    )
  }
  string(text: string): this {
    return this.check(
      typeof this.actual === 'string' && this.actual.includes(text),
      `${this.subject} to contain ${show(text)}`,
      `${this.subject} to not contain ${show(text)}`
    )
  }
  property(name: string, ...value: unknown[]): Assertion {
    const obj = this.actual
    let has: boolean
    let got: unknown
    if (this.nestedFlag) {
      ;({ has, value: got } = nestedProperty(obj, name))
    } else {
      has =
        obj != null &&
        (this.ownFlag ? Object.prototype.hasOwnProperty.call(obj, name) : name in Object(obj))
      got = has ? (Object(obj) as Record<string, unknown>)[name] : undefined
    }
    const kind = this.nestedFlag ? 'nested property' : this.ownFlag ? 'own property' : 'property'
    if (value.length === 0) {
      this.check(has, `${this.subject} to have ${kind} '${name}'`, `${this.subject} to not have ${kind} '${name}'`)
    } else {
      const pass = has && (this.deepFlag ? deepEqual(got, value[0]) : got === value[0])
      this.check(
        pass,
        `expected ${kind} '${name}' of ${show(this.actual)} to be ${show(value[0])}, got ${show(got)}`,
        `expected ${kind} '${name}' of ${show(this.actual)} to not be ${show(value[0])}`
      )
    }
    // As in Chai, the assertion goes on with the property's value.
    return this.derive(got)
  }
  ownProperty(name: string, ...value: unknown[]): Assertion {
    this.ownFlag = true
    return this.property(name, ...value)
  }
  haveOwnProperty(name: string, ...value: unknown[]): Assertion {
    return this.ownProperty(name, ...value)
  }
  /**
   * The descriptor of an own property, deep-compared to `descriptor` when one
   * is given. As in Chai, the assertion goes on with the descriptor.
   */
  ownPropertyDescriptor(name: string, ...descriptor: unknown[]): Assertion {
    const got = this.actual == null ? undefined : Object.getOwnPropertyDescriptor(Object(this.actual), name)
    if (descriptor.length === 0) {
      this.check(
        got !== undefined,
        `${this.subject} to have an own property descriptor for '${name}'`,
        `${this.subject} to not have an own property descriptor for '${name}'`
      )
    } else {
      this.check(
        got !== undefined && deepEqual(got, descriptor[0]),
        `expected the own property descriptor for '${name}' on ${show(this.actual)} to match ${show(descriptor[0])}, got ${show(got)}`,
        `expected the own property descriptor for '${name}' on ${show(this.actual)} to not match ${show(descriptor[0])}`
      )
    }
    return this.derive(got)
  }
  haveOwnPropertyDescriptor(name: string, ...descriptor: unknown[]): Assertion {
    return this.ownPropertyDescriptor(name, ...descriptor)
  }
  /** A method on the object, or on a constructor's prototype unless `.itself`. */
  respondTo(method: string): this {
    const target =
      typeof this.actual === 'function' && !this.itselfFlag
        ? (this.actual as { prototype?: unknown }).prototype
        : this.actual
    const has = target != null && typeof (Object(target) as Record<string, unknown>)[method] === 'function'
    return this.check(has, `${this.subject} to respond to '${method}'`, `${this.subject} to not respond to '${method}'`)
  }
  respondsTo(method: string): this {
    return this.respondTo(method)
  }
  keys(...names: unknown[]): this {
    const first = names[0]
    const list = (
      names.length === 1 && Array.isArray(first)
        ? first
        : names.length === 1 && first && typeof first === 'object'
          ? Object.keys(first)
          : names
    ).map(String)
    const actual = keysOf(this.actual) ?? []
    const has = (k: string) => actual.includes(k)
    // Chai: `.have.keys` means exactly these, `.include.keys` at least these,
    // `.any.keys` at least one of them.
    const pass = this.anyFlag
      ? list.some(has)
      : list.every(has) && (this.containsFlag || actual.length === list.length)
    const words = `${this.containsFlag ? 'contain ' : 'have '}${this.anyFlag ? 'any' : 'all'} keys`
    return this.check(
      keysOf(this.actual) !== null && pass,
      `${this.subject} to ${words} ${show(list)}`,
      `${this.subject} to not ${words} ${show(list)}`
    )
  }
  key(name: string): this {
    return this.keys(name)
  }
  private sizeIs(n: number): this {
    const size = sizeOf(this.actual)
    return this.check(
      size === n,
      `${this.subject} to have a length of ${n} but got ${size}`,
      `${this.subject} to not have a length of ${n}`
    )
  }
  above(n: number): this {
    const m = this.measure()
    return this.check(m.value > n, `${m.what} above ${n}`, `${m.what} at most ${n}`)
  }
  gt(n: number): this {
    return this.above(n)
  }
  greaterThan(n: number): this {
    return this.above(n)
  }
  below(n: number): this {
    const m = this.measure()
    return this.check(m.value < n, `${m.what} below ${n}`, `${m.what} at least ${n}`)
  }
  lt(n: number): this {
    return this.below(n)
  }
  lessThan(n: number): this {
    return this.below(n)
  }
  least(n: number): this {
    const m = this.measure()
    return this.check(m.value >= n, `${m.what} at least ${n}`, `${m.what} below ${n}`)
  }
  gte(n: number): this {
    return this.least(n)
  }
  greaterThanOrEqual(n: number): this {
    return this.least(n)
  }
  most(n: number): this {
    const m = this.measure()
    return this.check(m.value <= n, `${m.what} at most ${n}`, `${m.what} above ${n}`)
  }
  lte(n: number): this {
    return this.most(n)
  }
  lessThanOrEqual(n: number): this {
    return this.most(n)
  }
  within(low: number, high: number): this {
    const m = this.measure()
    return this.check(
      m.value >= low && m.value <= high,
      `${m.what} within ${low}..${high}`,
      `${m.what} to not be within ${low}..${high}`
    )
  }
  closeTo(n: number, delta: number): this {
    const v = this.actual as number
    return this.check(
      typeof v === 'number' && Math.abs(v - n) <= delta,
      `${this.subject} to be close to ${n} +/- ${delta}`,
      `${this.subject} not to be close to ${n} +/- ${delta}`
    )
  }
  approximately(n: number, delta: number): this {
    return this.closeTo(n, delta)
  }
  match(re: RegExp): this {
    return this.check(
      re.test(String(this.actual)),
      `${this.subject} to match ${String(re)}`,
      `${this.subject} not to match ${String(re)}`
    )
  }
  matches(re: RegExp): this {
    return this.match(re)
  }
  oneOf(list: unknown[]): this {
    const pass = list.some((item) => (this.deepFlag ? deepEqual(item, this.actual) : item === this.actual))
    return this.check(
      pass,
      `${this.subject} to be one of ${show(list)}`,
      `${this.subject} to not be one of ${show(list)}`
    )
  }
  members(list: unknown[]): this {
    const actual = Array.isArray(this.actual) ? this.actual : []
    const same = (a: unknown, b: unknown) => (this.deepFlag ? deepEqual(a, b) : a === b)
    const pass =
      actual.length === list.length &&
      (this.orderedFlag
        ? list.every((item, i) => same(actual[i], item))
        : list.every((item) => actual.some((a) => same(a, item))))
    const words = this.orderedFlag ? 'the same ordered members as' : 'the same members as'
    return this.check(
      pass,
      `${this.subject} to have ${words} ${show(list)}`,
      `${this.subject} to not have ${words} ${show(list)}`
    )
  }
  satisfy(matcher: (value: unknown) => unknown): this {
    return this.check(
      !!matcher(this.actual),
      `${this.subject} to satisfy ${show(matcher)}`,
      `${this.subject} to not satisfy ${show(matcher)}`
    )
  }
  satisfies(matcher: (value: unknown) => unknown): this {
    return this.satisfy(matcher)
  }
  /**
   * Call the function subject and watch `target[prop]` (or the value `target()`
   * returns) before and after. `.by(delta)` then checks the size of the change.
   */
  private watch(kind: 'change' | 'increase' | 'decrease', target: unknown, prop?: string): this {
    if (typeof this.actual !== 'function') throw new Error(`${this.subject} to be a function`)
    const read = (): unknown =>
      prop === undefined ? (target as () => unknown)() : (Object(target) as Record<string, unknown>)[prop]
    if (prop === undefined && typeof target !== 'function') throw new Error(`expected ${show(target)} to be a function`)
    const before = read()
    ;(this.actual as () => unknown)()
    const after = read()
    const what = prop === undefined ? 'function' : `.${prop}`
    this.delta = { kind, before: before as number, after: after as number, what }
    const pass =
      kind === 'change'
        ? !deepEqual(before, after)
        : kind === 'increase'
          ? (after as number) > (before as number)
          : (after as number) < (before as number)
    return this.check(pass, `expected ${what} to ${kind}`, `expected ${what} to not ${kind}`)
  }
  change(target: unknown, prop?: string): this {
    return this.watch('change', target, prop)
  }
  changes(target: unknown, prop?: string): this {
    return this.change(target, prop)
  }
  increase(target: unknown, prop?: string): this {
    return this.watch('increase', target, prop)
  }
  increases(target: unknown, prop?: string): this {
    return this.increase(target, prop)
  }
  decrease(target: unknown, prop?: string): this {
    return this.watch('decrease', target, prop)
  }
  decreases(target: unknown, prop?: string): this {
    return this.decrease(target, prop)
  }
  by(delta: number): this {
    const d = this.delta
    if (!d) throw new Error('expected .by to follow .change, .increase or .decrease')
    // Chai: `.change(...).by(n)` is a change of n either way, the others are signed.
    const diff = d.kind === 'change' ? Math.abs(d.after - d.before) : d.kind === 'increase' ? d.after - d.before : d.before - d.after
    return this.check(
      diff === delta,
      `expected ${d.what} to ${d.kind} by ${delta}`,
      `expected ${d.what} to not ${d.kind} by ${delta}`
    )
  }
  throw(expected?: string | RegExp | (new (...args: never[]) => unknown)): Assertion {
    if (typeof this.actual !== 'function') throw new Error(`${this.subject} to be a function`)
    let error: unknown
    let threw = false
    try {
      ;(this.actual as () => unknown)()
    } catch (e) {
      threw = true
      error = e
    }
    const text = error instanceof Error ? error.message : String(error)
    const matches =
      expected === undefined
        ? true
        : typeof expected === 'string'
          ? text.includes(expected)
          : expected instanceof RegExp
            ? expected.test(text)
            : error instanceof expected
    const want = expected === undefined ? 'an error' : `an error like ${show(expected)}`
    this.check(
      threw && matches,
      `expected function to throw ${want}${threw ? ` but got '${text}'` : ' but it did not throw'}`,
      `expected function to not throw ${want}`
    )
    return this.derive(error)
  }
  throws(expected?: string | RegExp | (new (...args: never[]) => unknown)): Assertion {
    return this.throw(expected)
  }
  Throw(expected?: string | RegExp | (new (...args: never[]) => unknown)): Assertion {
    return this.throw(expected)
  }
}

/** Names tooling reads from any object, which are not misspelled assertions. */
const PASSTHROUGH = new Set<string>(['then', 'toJSON', 'inspect', 'constructor', 'valueOf', 'toString', 'asymmetricMatch', 'nodeType'])

/**
 * `expect(value, message?)`, Chai style. A word the vocabulary does not have
 * throws instead of passing silently: `expect(x).to.be.truthy` used to be a
 * test that could never fail.
 */
export function expect(actual: unknown, message?: string): Assertion {
  const assertion = new Assertion(actual, message)
  return new Proxy(assertion, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !(prop in target) && !PASSTHROUGH.has(prop)) {
        throw new Error(`Invalid Chai property: ${prop}`)
      }
      return Reflect.get(target, prop, receiver)
    }
  })
}

/** `expect.fail(message?)` or `expect.fail(actual, expected, message?)`, as in Chai. */
expect.fail = (...args: unknown[]): never => {
  const message = args.length <= 1 ? args[0] : args[2]
  throw new Error(typeof message === 'string' && message ? message : 'expect.fail()')
}
