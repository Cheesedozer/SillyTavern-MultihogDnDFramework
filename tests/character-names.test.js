import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    CHARACTER_NAME_POOLS,
    pickGenreCharacterName,
} from '../src/state/character-names.js';

describe('genre character-name pools', () => {
    it('keeps the non-fantasy pools and drops the static fantasy pool', () => {
        expect(CHARACTER_NAME_POOLS.realistic.firstNames).toContain('Harper');
        expect(CHARACTER_NAME_POOLS.realistic.surnames).toContain('Callahan');
        expect(CHARACTER_NAME_POOLS.scifi.firstNames).toContain('ARIA-7');
        expect(CHARACTER_NAME_POOLS.horror.surnames).toContain('Wormwood');
        expect(CHARACTER_NAME_POOLS.fantasy).toBeUndefined();
    });

    it('chooses a first-name / surname combination from the requested non-fantasy genre', () => {
        expect(pickGenreCharacterName('realistic', { random: () => 0, recent: [] })).toBe('Eleanor Miller');
        expect(pickGenreCharacterName('scifi', { random: () => 0, recent: [] })).toBe('Jax Vance');
        expect(pickGenreCharacterName('horror', { random: () => 0, recent: [] })).toBe('Abigail Blackwood');
    });

    it('routes fantasy, empty and unknown genres to the grounded fantasy generator', () => {
        for (const genre of ['fantasy', '', 'unknown']) {
            const name = pickGenreCharacterName(genre, { random: () => 0, recent: [] });
            expect(Object.values(CHARACTER_NAME_POOLS).some(pool => pool.firstNames.includes(name.split(' ')[0]))).toBe(false);
            expect(name.length).toBeGreaterThan(0);
        }
    });

    it('avoids repeating a recent non-fantasy roll', () => {
        const recent = ['Eleanor Miller'];
        let calls = 0;
        const name = pickGenreCharacterName('realistic', { random: () => (calls++ < 2 ? 0 : 0.5), recent });
        expect(name).not.toBe('Eleanor Miller');
    });

    it('lets Instant Action use an optional typed/rolled name or let the AI choose', () => {
        const quickStartSource = readFileSync(new URL('../quickstart.js', import.meta.url), 'utf8');
        const creatorSource = readFileSync(new URL('../character-creator.js', import.meta.url), 'utf8');
        const rendererSource = readFileSync(new URL('../renderer.js', import.meta.url), 'utf8');

        expect(rendererSource).toContain('id="rt-quickstart-name" placeholder="Optional — enter, roll, or let AI choose"');
        expect(rendererSource).toContain('id="rt-quickstart-roll-name"');
        expect(rendererSource).toContain('id="rt-quickstart-begin"');
        expect(quickStartSource).toMatch(/selectedName = pickGenreCharacterName\(selectedGenre\)/);
        expect(quickStartSource).toMatch(/selectedName = nameInput\.value\.trim\(\)/);
        expect(quickStartSource).toMatch(/runQuickStart\(selectedGenre, rootEl, selectedName, instructionsInput\?\.value \|\| ''\)/);
        expect(quickStartSource).toMatch(/const nameVal = String\(selectedName \|\| ''\)\.trim\(\)/);
        expect(quickStartSource).not.toContain('Roll a character name before starting.');
        expect(quickStartSource).toMatch(/if \(!selectedGenre\) return;/);
        expect(quickStartSource).not.toMatch(/if \(!selectedGenre \|\| !selectedName\) return;/);
        expect(quickStartSource).toMatch(/generateQuickStartCharacter\(\{[\s\S]*?\bnameVal,/);
        expect(creatorSource).toMatch(/buildCharacterGenerationPrompt\(\{\s*nameVal: opts\.nameVal,/);
    });

    it('lets Other Ways reroll by selected genre and reuse the accepted name', () => {
        const cardEventsSource = readFileSync(new URL('../src/ui/panel/card-events.js', import.meta.url), 'utf8');

        expect(cardEventsSource).toMatch(/selectedOnboardingName = pickGenreCharacterName\(genre\)/);
        expect(cardEventsSource).toMatch(/selectedOnboardingName = onboardingRolledName\.value\.trim\(\)/);
        expect(cardEventsSource).toMatch(/const selectedName = selectedOnboardingName/);
        expect(cardEventsSource).toMatch(/clearOnboardingName\(\)/);
        expect(cardEventsSource).toContain('Roll a character name before generating.');
    });

    it('lets Character Creator and Origin Start roll with genre, gender and race', () => {
        const creatorSource = readFileSync(new URL('../character-creator.js', import.meta.url), 'utf8');
        const originSource = readFileSync(new URL('../src/features/origin/origin-wizard.js', import.meta.url), 'utf8');

        expect(creatorSource).not.toContain('CHARACTER_CREATOR_NAME_ADDITIONS');
        expect(creatorSource).not.toContain('Aethelgard');
        expect(creatorSource).toMatch(/pickGenreCharacterName\(genreSelect\?\.value \|\| 'fantasy', \{ gender, race: species \}\)/);
        expect(originSource).toMatch(/pickGenreCharacterName\('fantasy', \{ gender: draft\.gender, race \}\)/);
    });
});
