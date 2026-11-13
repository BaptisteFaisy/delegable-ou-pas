/**
 * i18n parity and honesty (SPEC §20 "Interface bilingue", §7 rule 4; recipe 10).
 *
 * Two catalogues, exactly the same keys: a test compares them and fails on any
 * difference (a hole or an orphan). A missing key renders the key, never
 * `undefined`. The four conclusions and the four recommendations each have a
 * label, "we don't know" included.
 */
import { describe, expect, it } from 'vitest';
import {
  MESSAGES_EN,
  MESSAGES_FR,
  createTranslator,
  translate,
  type MessageKey,
} from '../../src/i18n/index.js';
import { CONCLUSIONS } from '../../src/types.js';
import { CONFIDENCES, GUARDRAILS, RECOMMENDATIONS } from '../../src/types-advice.js';

describe('i18n key parity (SPEC §20)', () => {
  it('has exactly the same keys in English and in French', () => {
    const en = Object.keys(MESSAGES_EN).sort();
    const fr = Object.keys(MESSAGES_FR).sort();
    expect(fr).toEqual(en);
  });

  it('has no duplicate key in either catalogue', () => {
    for (const catalogue of [MESSAGES_EN, MESSAGES_FR]) {
      const keys = Object.keys(catalogue);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('has no empty message in either catalogue', () => {
    for (const catalogue of [MESSAGES_EN, MESSAGES_FR]) {
      for (const value of Object.values(catalogue)) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('translate (SPEC §20)', () => {
  it('renders a key that is absent as the key itself, never undefined', () => {
    const missing = 'this.key.does.not.exist' as MessageKey;
    expect(translate('fr', missing)).toBe('this.key.does.not.exist');
    expect(translate('en', missing)).toBe('this.key.does.not.exist');
  });

  it('interpolates parameters and keeps an absent parameter visible', () => {
    expect(translate('en', 'stats.sample', { n: 41 })).toBe('n = 41');
    expect(translate('en', 'stats.sample')).toBe('n = {n}');
  });

  it('translates the same key differently in the two languages', () => {
    expect(translate('en', 'recommendation.delegate')).not.toBe(
      translate('fr', 'recommendation.delegate'),
    );
  });

  it('builds a translator bound to one language', () => {
    const t = createTranslator('fr');
    expect(t('recommendation.keep-human')).toBe(MESSAGES_FR['recommendation.keep-human']);
  });
});

describe('the four conclusions and recommendations are labelled (SPEC §7 rule 4, §8)', () => {
  it('gives each recommendation a literal French label', () => {
    const fr = createTranslator('fr');
    expect(RECOMMENDATIONS.map((value) => fr(`recommendation.${value}`))).toEqual([
      'À confier à un agent',
      'Agent, relecture renforcée',
      'À garder pour un humain',
      'Pas assez de recul',
    ]);
  });

  it('gives each recommendation an English label', () => {
    const en = createTranslator('en');
    expect(RECOMMENDATIONS.map((value) => en(`recommendation.${value}`))).toEqual([
      'Delegate to an agent',
      'Agent, hardened review',
      'Keep with a human',
      'Not enough history',
    ]);
  });

  it('labels "we do not know" like the three other conclusions, in both languages', () => {
    const en = createTranslator('en');
    const fr = createTranslator('fr');
    for (const conclusion of CONCLUSIONS) {
      expect(en(`conclusion.${conclusion}`).length).toBeGreaterThan(0);
      expect(fr(`conclusion.${conclusion}`).length).toBeGreaterThan(0);
    }
    expect(fr('conclusion.not-enough-data')).toBe('On ne sait pas');
    expect(en('conclusion.not-enough-data')).toBe("We don't know");
  });

  it('labels every confidence level and every guardrail', () => {
    const en = createTranslator('en');
    for (const confidence of CONFIDENCES) {
      expect(en(`confidence.${confidence}`)).not.toBe(`confidence.${confidence}`);
    }
    for (const guardrail of GUARDRAILS) {
      expect(en(`guardrail.${guardrail}`)).not.toBe(`guardrail.${guardrail}`);
    }
  });
});
