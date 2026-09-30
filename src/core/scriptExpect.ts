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
 * Failures throw an Error with a Chai-like message ("expected 404 to equal
 * 200"), which `test()` records as a failed test.
 */

function show(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  if (value === undefined) return 'undefined'
  if (typeof value === 'function') return '[Function]'
  if (value instanceof RegExp) return String(value)
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
  if (Array.isArray(a) !== Array.isArray(b)) return false
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
  return typeof value
}

function sizeOf(value: unknown): number | undefined {
  if (typeof value === 'string' || Array.isArray(value)) return value.length
  if (value instanceof Map || value instanceof Set) return value.size
  if (value && typeof value === 'object') return Object.keys(value).length
  return undefined
}

function includes(haystack: unknown, needle: unknown, deep: boolean): boolean {
  if (typeof haystack === 'string') return haystack.includes(String(needle))
  if (Array.isArray(haystack)) {
    return haystack.some((item) => (deep ? deepEqual(item, needle) : Object.is(item, needle)))
  }
  if (haystack && typeof haystack === 'object' && needle && typeof needle === 'object') {
    // Object subset: every key of the needle is present with an equal value.
    return Object.entries(needle).every(([k, v]) =>
      deepEqual((haystack as Record<string, unknown>)[k], v)
    )
  }
  return false
}

export class Assertion {
  private negate = false
  private deepFlag = false

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
  get does(): this {
    return this
  }
  get still(): this {
    return this
  }
  get own(): this {
    return this
  }

  get not(): this {
    this.negate = !this.negate
    return this
  }
  get deep(): this {
    this.deepFlag = true
    return this
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

  // Methods.
  equal(expected: unknown): this {
    const pass = this.deepFlag ? deepEqual(this.actual, expected) : Object.is(this.actual, expected)
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
  a(type: string): this {
    const want = type.toLowerCase()
    return this.check(
      typeName(this.actual) === want,
      `${this.subject} to be a ${want}`,
      `${this.subject} not to be a ${want}`
    )
  }
  an(type: string): this {
    return this.a(type)
  }
  instanceOf(ctor: new (...args: never[]) => unknown): this {
    return this.check(
      this.actual instanceof ctor,
      `${this.subject} to be an instance of ${ctor.name}`,
      `${this.subject} to not be an instance of ${ctor.name}`
    )
  }
  include(needle: unknown): this {
    return this.check(
      includes(this.actual, needle, this.deepFlag),
      `${this.subject} to include ${show(needle)}`,
      `${this.subject} to not include ${show(needle)}`
    )
  }
  includes(needle: unknown): this {
    return this.include(needle)
  }
  contain(needle: unknown): this {
    return this.include(needle)
  }
  contains(needle: unknown): this {
    return this.include(needle)
  }
  property(name: string, ...value: unknown[]): this {
    const obj = this.actual as Record<string, unknown> | null | undefined
    const has = obj != null && typeof obj === 'object' && name in obj
    if (value.length === 0) {
      return this.check(
        has,
        `${this.subject} to have property '${name}'`,
        `${this.subject} to not have property '${name}'`
      )
    }
    const got = has ? obj![name] : undefined
    const pass = has && (this.deepFlag ? deepEqual(got, value[0]) : Object.is(got, value[0]))
    return this.check(
      pass,
      `expected property '${name}' of ${show(this.actual)} to be ${show(value[0])}, got ${show(got)}`,
      `expected property '${name}' of ${show(this.actual)} to not be ${show(value[0])}`
    )
  }
  keys(...names: unknown[]): this {
    const list = (names.length === 1 && Array.isArray(names[0]) ? names[0] : names).map(String)
    const obj = this.actual as Record<string, unknown> | null
    const pass = obj != null && typeof obj === 'object' && list.every((k) => k in obj)
    return this.check(
      pass,
      `${this.subject} to have keys ${show(list)}`,
      `${this.subject} to not have keys ${show(list)}`
    )
  }
  key(name: string): this {
    return this.keys(name)
  }
  lengthOf(n: number): this {
    const size = sizeOf(this.actual)
    return this.check(
      size === n,
      `${this.subject} to have a length of ${n} but got ${size}`,
      `${this.subject} to not have a length of ${n}`
    )
  }
  length(n: number): this {
    return this.lengthOf(n)
  }
  above(n: number): this {
    return this.check(
      (this.actual as number) > n,
      `${this.subject} to be above ${n}`,
      `${this.subject} to be at most ${n}`
    )
  }
  gt(n: number): this {
    return this.above(n)
  }
  greaterThan(n: number): this {
    return this.above(n)
  }
  below(n: number): this {
    return this.check(
      (this.actual as number) < n,
      `${this.subject} to be below ${n}`,
      `${this.subject} to be at least ${n}`
    )
  }
  lt(n: number): this {
    return this.below(n)
  }
  lessThan(n: number): this {
    return this.below(n)
  }
  least(n: number): this {
    return this.check(
      (this.actual as number) >= n,
      `${this.subject} to be at least ${n}`,
      `${this.subject} to be below ${n}`
    )
  }
  gte(n: number): this {
    return this.least(n)
  }
  most(n: number): this {
    return this.check(
      (this.actual as number) <= n,
      `${this.subject} to be at most ${n}`,
      `${this.subject} to be above ${n}`
    )
  }
  lte(n: number): this {
    return this.most(n)
  }
  within(low: number, high: number): this {
    const v = this.actual as number
    return this.check(
      v >= low && v <= high,
      `${this.subject} to be within ${low}..${high}`,
      `${this.subject} to not be within ${low}..${high}`
    )
  }
  match(re: RegExp): this {
    return this.check(
      re.test(String(this.actual)),
      `${this.subject} to match ${String(re)}`,
      `${this.subject} not to match ${String(re)}`
    )
  }
  oneOf(list: unknown[]): this {
    const pass = list.some((item) =>
      this.deepFlag ? deepEqual(item, this.actual) : Object.is(item, this.actual)
    )
    return this.check(
      pass,
      `${this.subject} to be one of ${show(list)}`,
      `${this.subject} to not be one of ${show(list)}`
    )
  }
  members(list: unknown[]): this {
    const actual = Array.isArray(this.actual) ? this.actual : []
    const pass =
      actual.length === list.length &&
      list.every((item) => actual.some((a) => deepEqual(a, item)))
    return this.check(
      pass,
      `${this.subject} to have the same members as ${show(list)}`,
      `${this.subject} to not have the same members as ${show(list)}`
    )
  }
}

/** `expect(value, message?)`, Chai style. */
export function expect(actual: unknown, message?: string): Assertion {
  return new Assertion(actual, message)
}
