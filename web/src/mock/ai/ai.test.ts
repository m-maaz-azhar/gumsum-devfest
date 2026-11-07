import { describe, expect, it } from 'vitest'
import { computeScore } from './score'
import { FALLBACK_QUESTIONS, leaks, safeQuestion } from './leak'
import { coverage, scoreModel } from './coverage'
import { isFlagged, parseQuery } from './parse'
import { similarity, wordSimilarity } from './text'

const backpack = ['blue Nike water bottle inside', 'keychain shaped like a cat', 'small scratch near the zip']

describe('computeScore (§6.5)', () => {
  it('matches the documented formula', () => {
    expect(
      computeScore({
        details: [
          { idx: 0, verdict: 'match', evidence: '' },
          { idx: 1, verdict: 'none', evidence: '' },
          { idx: 2, verdict: 'partial', evidence: '' },
        ],
        photo_consistency: 'consistent',
        proof_photo: 'supports',
        summary: '',
      }),
    ).toEqual({ score: 68, label: 'Medium' }) // 0.75*0.5 + 0.25 + 0.05 = 0.675 → 68
  })
  it('caps any contradiction at 40', () => {
    const r = computeScore({
      details: [
        { idx: 0, verdict: 'match', evidence: '' },
        { idx: 1, verdict: 'match', evidence: '' },
        { idx: 2, verdict: 'contradiction', evidence: '' },
      ],
      photo_consistency: 'consistent',
      proof_photo: 'none',
      summary: '',
    })
    expect(r.score).toBe(40)
  })
  it('labels High at 75 and above', () => {
    const r = computeScore({ details: [{ idx: 0, verdict: 'match', evidence: '' }], photo_consistency: 'consistent', proof_photo: 'none', summary: '' })
    expect(r).toEqual({ score: 100, label: 'High' })
  })
})

describe('leak check (§6.4)', () => {
  it('rejects questions that contain a private keyword', () => {
    expect(leaks('Was there a cat on it?', backpack)).toBe(true)
    expect(leaks('Is there a Nike logo?', backpack)).toBe(true)
  })
  it('catches near misses (Levenshtein ≤ 1)', () => {
    expect(leaks('Any scratc on it?', backpack)).toBe(true)
    expect(leaks('What about the keychains?', backpack)).toBe(true)
    expect(leaks('What about the keychan?', backpack)).toBe(true)
    expect(leaks('What colour is it?', backpack)).toBe(false)
  })
  it('lets every generic fallback through', () => {
    for (const q of FALLBACK_QUESTIONS) expect(leaks(q, backpack)).toBe(false)
  })
  it('falls back to an unused generic question', () => {
    expect(safeQuestion('Is the bottle blue?', backpack, [])).toBe(FALLBACK_QUESTIONS[0])
    expect(safeQuestion(null, backpack, [FALLBACK_QUESTIONS[0]])).toBe(FALLBACK_QUESTIONS[1])
  })
})

describe('coverage', () => {
  it('asks nothing when every detail is covered', () => {
    const r = coverage(backpack, 'Blue Nike bottle inside, a cat keychain, and a scratch near the zip', [])
    expect(r.uncovered).toEqual([])
    expect(r.next_question).toBeNull()
  })
  it('asks a neutral question about a missing detail', () => {
    const r = coverage(backpack, 'It has my blue Nike bottle inside', [])
    expect(r.covered).toEqual([0])
    expect(r.next_question).toBe('Anything attached to it?')
    expect(leaks(r.next_question!, backpack)).toBe(false)
  })
  it('scores a strong answer High and a contradicting one Low', () => {
    const strong = computeScore(scoreModel(backpack, 'black backpack, blue nike water bottle inside, cat keychain, scratch by the zip', false, ['backpack', 'black']))
    expect(strong.label).toBe('High')
    const weak = computeScore(scoreModel(backpack, 'my laptop is in it. brand new, no marks at all', false, ['backpack', 'black']))
    expect(weak.label).toBe('Low')
  })
})

describe('parseQuery', () => {
  it('splits what and where', () => {
    expect(parseQuery('black bag in atrium mall')).toEqual({ what: 'black bag', where: 'atrium mall' })
    expect(parseQuery('AirPods at the food court')).toEqual({ what: 'AirPods', where: 'food court' })
    expect(parseQuery('red umbrella')).toEqual({ what: 'red umbrella', where: null })
  })
})

describe('trigram similarity', () => {
  it('behaves like pg_trgm', () => {
    expect(similarity('atrium mall', 'Atrium Mall')).toBe(1)
    expect(wordSimilarity('atrium', 'Atrium Cinema')).toBeGreaterThan(0.3)
    expect(wordSimilarity('umbrela', 'red umbrella')).toBeGreaterThan(0.3)
    expect(similarity('cinema', 'expo hall')).toBeLessThan(0.1)
  })
})

describe('moderation', () => {
  it('flags abuse only', () => {
    expect(isFlagged('this is shit')).toBe(true)
    expect(isFlagged('It has a scratch on the side')).toBe(false)
  })
})
