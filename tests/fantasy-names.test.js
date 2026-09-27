import { describe, expect, it } from 'vitest';
import {
    BLOCKED_NAME_PARTS,
    FANTASY_CULTURE_IDS,
    FANTASY_NAME_DATA,
    generateFantasyName,
    parseGenderHint,
    resolveRaceProfile,
} from '../src/state/fantasy-names.js';

/** Deterministic PRNG (mulberry32) so distribution checks are stable. */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function roll(n, options = {}, seed = 1) {
    const random = seeded(seed);
    return Array.from({ length: n }, () => generateFantasyName({ ...options, random, recent: [] }));
}

function allStrings(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(allStrings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
    return [];
}

describe('fantasy name data', () => {
    it('has ten cultures with enough curated names each', () => {
        expect(FANTASY_CULTURE_IDS).toHaveLength(10);
        for (const id of FANTASY_CULTURE_IDS) {
            const culture = FANTASY_NAME_DATA.cultures[id];
            expect(culture.feminine.length, id).toBeGreaterThanOrEqual(24);
            expect(culture.masculine.length, id).toBeGreaterThanOrEqual(26);
            expect(culture.surnames.length, id).toBeGreaterThanOrEqual(15);
            expect(new Set(culture.feminine).size, id).toBe(culture.feminine.length);
            expect(new Set(culture.masculine).size, id).toBe(culture.masculine.length);
        }
    });

    it('contains no blocked, franchise or high-fantasy cliché names', () => {
        const strings = allStrings(FANTASY_NAME_DATA);
        const cliches = ['Moonwhisper', 'Sunstrider', 'Starweaver', 'Ironheart', 'Anvilbreaker', 'Seraphina', 'Nekros', 'Malakor', 'Stormborn', 'Crownguard'];
        for (const part of [...BLOCKED_NAME_PARTS, ...cliches]) {
            expect(strings.filter(s => s.includes(part)), part).toEqual([]);
        }
    });

    it('keeps the grounded names from the old pools', () => {
        const { cultures } = FANTASY_NAME_DATA;
        expect(cultures.gaelic.masculine).toEqual(expect.arrayContaining(['Cormac', 'Tadhg', 'Rowan', 'Kieran']));
        expect(cultures.norse.feminine).toEqual(expect.arrayContaining(['Dagmar', 'Freya', 'Helga']));
        expect(cultures.english.surnames).toEqual(expect.arrayContaining(['Hawthorn', 'Blackwood']));
    });
});

describe('parseGenderHint', () => {
    it.each([
        ['Female', 'feminine'], ['woman', 'feminine'], ['she/her', 'feminine'], ['trans woman', 'feminine'], ['F', 'feminine'],
        ['Male', 'masculine'], ['man', 'masculine'], ['he/him', 'masculine'], ['trans man', 'masculine'],
        ['', null], ['non-binary', null], ['they/them', null], ['genderfluid, he/she', null],
    ])('%s -> %s', (text, expected) => {
        expect(parseGenderHint(text)).toBe(expected);
    });
});

describe('resolveRaceProfile', () => {
    it.each([
        ['dwarf', 'dwarf'], ['Hill Dwarf', 'dwarf'], ['dwarven smith', 'dwarf'], ['Wood Elf', 'elf'], ['Drow', 'elf'],
        ['Half-Elf', 'halfelf'], ['half orc', 'halforc'], ['Orc', 'orc'], ['sorcerer', 'human'], ['Dragonborn', 'dragonborn'],
        ['Tiefling', 'tiefling'], ['silkborn', 'silkborn'], ['Mirefolk', 'human'], ['', 'human'], ['vampire', 'vampire'],
    ])('%s -> %s', (text, expected) => {
        expect(resolveRaceProfile(text)).toBe(expected);
    });
});

describe('generateFantasyName', () => {
    it('produces varied, non-empty names without blocked parts', () => {
        const results = roll(1000);
        const names = results.map(r => r.name);
        expect(new Set(names).size).toBeGreaterThan(900);
        for (const name of names) {
            expect(name.trim()).toBe(name);
            expect(name).not.toMatch(/\s{2}|undefined/);
            expect(BLOCKED_NAME_PARTS.some(part => name.includes(part))).toBe(false);
        }
    });

    it('uses every culture for humans and keeps most rolls as "First Surname"', () => {
        const results = roll(3000, { race: 'human' });
        expect(new Set(results.map(r => r.culture))).toEqual(new Set(FANTASY_CULTURE_IDS));
        const surnameShare = results.filter(r => r.form === 'surname').length / results.length;
        expect(surnameShare).toBeGreaterThan(0.5);
        expect(surnameShare).toBeLessThan(0.7);
        for (const form of ['patronymic', 'place', 'epithet', 'single']) {
            expect(results.some(r => r.form === form), form).toBe(true);
        }
        const mixed = results.filter(r => r.surnameCulture !== r.culture).length / results.length;
        expect(mixed).toBeGreaterThan(0.05);
        expect(mixed).toBeLessThan(0.15);
        const invented = results.filter(r => r.invented).length / results.length;
        expect(invented).toBeGreaterThan(0.05);
        expect(invented).toBeLessThan(0.15);
    });

    it('follows a feminine or masculine gender hint', () => {
        const { cultures } = FANTASY_NAME_DATA;
        for (const r of roll(300, { gender: 'she/her' }, 7).filter(x => !x.invented)) {
            expect(r.gender).toBe('feminine');
            expect(cultures[r.culture].feminine).toContain(r.name.split(' ')[0]);
        }
        for (const r of roll(300, { gender: 'Male' }, 8).filter(x => !x.invented)) {
            expect(r.gender).toBe('masculine');
            expect(cultures[r.culture].masculine).toContain(r.name.split(' ')[0]);
        }
    });

    it('builds gendered patronymics and family names', () => {
        const women = roll(2000, { gender: 'female', race: 'dwarf' }, 3).map(r => r.name);
        expect(women.some(n => /dottir$/.test(n))).toBe(true);
        expect(women.some(n => /sson$/.test(n))).toBe(false);
        const men = roll(2000, { gender: 'male', race: 'dwarf' }, 4).map(r => r.name);
        expect(men.some(n => /sson$/.test(n))).toBe(true);
        expect(men.some(n => /(dottir|ovna)$/.test(n))).toBe(false);
    });

    it('leans dwarves toward Norse, Old English and Slavic cultures', () => {
        const results = roll(2000, { race: 'dwarf' }, 5);
        const lean = results.filter(r => ['norse', 'english', 'slavic'].includes(r.culture)).length / results.length;
        expect(lean).toBeGreaterThan(0.6);
        expect(lean).toBeLessThan(0.85);
    });

    it('uses race-specific naming for dragonborn, orcs, tieflings and silkborn', () => {
        expect(roll(200, { race: 'dragonborn' }, 11).every(r => r.culture === 'dragonborn')).toBe(true);
        const orcs = roll(1000, { race: 'orc' }, 12);
        const orcShare = orcs.filter(r => r.culture === 'orc').length / orcs.length;
        expect(orcShare).toBeGreaterThan(0.6);
        expect(orcShare).toBeLessThan(0.8);
        const tieflings = roll(1000, { race: 'tiefling' }, 13);
        expect(tieflings.some(r => FANTASY_NAME_DATA.tieflingVirtues.includes(r.name.split(' ')[0]))).toBe(true);
        expect(tieflings.some(r => r.culture !== 'tiefling')).toBe(true);
        const silk = roll(1000, { race: 'silkborn' }, 14);
        const hive = silk.filter(r => r.culture === 'silkborn').length / silk.length;
        expect(hive).toBeGreaterThan(0.4);
        expect(hive).toBeLessThan(0.6);
    });

    it('gives gnomes quoted nicknames sometimes', () => {
        expect(roll(1000, { race: 'gnome' }, 15).some(r => /^\S+ "[A-Za-z]+" \S+/.test(r.name))).toBe(true);
    });

    it('does not repeat a name within the recent-roll window', () => {
        const random = seeded(21);
        const recent = [];
        const names = Array.from({ length: 20 }, () => generateFantasyName({ random, recent, race: 'silkborn' }).name);
        expect(new Set(names).size).toBe(20);
        expect(recent).toHaveLength(20);
    });
});
