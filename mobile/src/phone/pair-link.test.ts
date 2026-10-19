// pair-link.test.ts — the one accepted shape, and one case per way to be wrong.
//
// The claim this file holds is a SECURITY claim: this app pairs with one host over one scheme at
// one path, and a string that is anything else is refused rather than interpreted. Every refusal
// below is a real thing somebody could put in front of a camera or a paste buffer.

import { APP_PAIR_PREFIX, maskRoomId, parseFragment, parsePairLink, WEB_PAIR_PREFIX } from './pair-link'

const R = 'AbCdEfGhIjKlMnOpQrStUv'
const K = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCde'
const GOOD = `${WEB_PAIR_PREFIX}r=${R}&k=${K}`

describe('the shape it accepts', () => {
  test('the phase-1 pair link, exactly', () => {
    expect(R).toHaveLength(22)
    expect(K).toHaveLength(43)
    expect(parsePairLink(GOOD)).toEqual({ roomId: R, viewKey: K })
  })

  test('the app’s own deep link, with the same fragment', () => {
    expect(parsePairLink(`${APP_PAIR_PREFIX}r=${R}&k=${K}`)).toEqual({ roomId: R, viewKey: K })
  })

  test('the two halves in either order', () => {
    expect(parsePairLink(`${WEB_PAIR_PREFIX}k=${K}&r=${R}`)).toEqual({ roomId: R, viewKey: K })
  })

  test('leading and trailing whitespace is forgiven — a paste carries it', () => {
    expect(parsePairLink(`  ${GOOD}\n`)).toEqual({ roomId: R, viewKey: K })
  })
})

describe('the ways to be wrong, one case each', () => {
  const refusals: [string, string][] = [
    ['another host entirely', `https://example.com/phone/#r=${R}&k=${K}`],
    ['a look-alike host', `https://share.eqzera.com.evil.tld/phone/#r=${R}&k=${K}`],
    ['a subdomain of the real host', `https://a.share.eqzera.com/phone/#r=${R}&k=${K}`],
    ['plain http', `http://share.eqzera.com/phone/#r=${R}&k=${K}`],
    ['a userinfo section', `https://share.eqzera.com@evil.tld/phone/#r=${R}&k=${K}`],
    ['a different path', `https://share.eqzera.com/share/#r=${R}&k=${K}`],
    ['the path without its trailing slash', `https://share.eqzera.com/phone#r=${R}&k=${K}`],
    ['a query string instead of a fragment', `https://share.eqzera.com/phone/?r=${R}&k=${K}`],
    ['the room id in the query and the key in the fragment', `https://share.eqzera.com/phone/?r=${R}#k=${K}`],
    ['no key at all', `${WEB_PAIR_PREFIX}r=${R}`],
    ['no room id at all', `${WEB_PAIR_PREFIX}k=${K}`],
    ['an empty fragment', WEB_PAIR_PREFIX],
    ['a room id one character short', `${WEB_PAIR_PREFIX}r=${R.slice(1)}&k=${K}`],
    ['a room id one character long', `${WEB_PAIR_PREFIX}r=${R}x&k=${K}`],
    ['a key one character short', `${WEB_PAIR_PREFIX}r=${R}&k=${K.slice(1)}`],
    ['a key that is standard base64 rather than base64url', `${WEB_PAIR_PREFIX}r=${R}&k=${K.slice(0, 41) + '+/'}`],
    ['whitespace inside the secret', `${WEB_PAIR_PREFIX}r=${R}&k=${K.slice(0, 20)} ${K.slice(21)}`],
    ['two room ids', `${WEB_PAIR_PREFIX}r=${R}&r=${R}&k=${K}`],
    ['two keys', `${WEB_PAIR_PREFIX}r=${R}&k=${K}&k=${K}`],
    ['the app scheme at the wrong path', `eqzera://open#r=${R}&k=${K}`],
    ['a bare fragment with no link around it', `r=${R}&k=${K}`],
    ['the empty string', ''],
    ['only whitespace', '   '],
    ['something absurdly long', `${GOOD}${'x'.repeat(300)}`]
  ]

  test.each(refusals)('refuses %s', (_name, link) => {
    expect(parsePairLink(link)).toBeNull()
  })
})

describe('the fragment parser on its own', () => {
  test('it ignores fields it does not know', () => {
    expect(parseFragment(`z=1&r=${R}&k=${K}&tab=live`)).toEqual({ roomId: R, viewKey: K })
  })

  test('it ignores a bare token with no equals sign', () => {
    expect(parseFragment(`hello&r=${R}&k=${K}`)).toEqual({ roomId: R, viewKey: K })
  })
})

describe('the masked room id Settings shows', () => {
  test('it keeps four at each end and loses the middle', () => {
    expect(maskRoomId(R)).toBe('AbCd…StUv')
    expect(maskRoomId(R)).not.toContain(R.slice(6, 14))
  })

  test('a short id is left alone rather than turned into nonsense', () => {
    expect(maskRoomId('abc')).toBe('abc')
  })
})
