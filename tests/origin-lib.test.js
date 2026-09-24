import { describe, it, expect } from 'vitest';
import {
    createOriginDraft, normalizeOriginDraft, applyDraftPatch, validateOriginDraft,
    getAllowedRaces, canBeTurned, getPursuerPlan, computeLevers, computeRuntimeRules,
    getVisibleBlanks, getVisibleModifiers, buildOriginArchitectPrompts, parseOriginArchitectResponse,
    extractJsonObject, buildOriginRecord, buildOriginInjectionBlock, buildOriginPlayerCardHints,
    buildOriginCharacterSheetHints, buildOriginOpeningMessage, formatOriginSummary, ORIGIN_IDS,
} from '../src/features/origin/origin-lib.js';
import { ORIGINS } from '../src/features/origin/origin-data.js';

/** A minimal complete draft for each origin (every required modifier chosen). */
const REQUIRED = {
    exiled_royal: { exileReason: 'framed', markType: 'heirloom' },
    vampire_lord: { slumberPrimary: 'weariness', kingdomAtSlumber: 'peace', legacy: 'art', awakenedBy: 'adventurers', currentTreatment: 'unknown_mythical' },
    freed_minion: { beforeDeath: 'soldier', undeadType: 'revenant', decayProgression: 'worsening', lichKnowledge: 'no' },
    oathbreaker: { oathHolderType: 'god', oathRepresented: 'justice', holderStatusGod: 'silent', curseType: 'armor_lock', curseSource: 'oath' },
    cultist: { role: 'follower', orientation: 'knowledge', whyLeft: 'vision', primaryPursuer: 'cult', legalStatus: 'mixed' },
    artifact_bound: { priorOccupation: 'farmer', form: 'bladed', entity: 'demon', personality: ['mentor'], power: 'knowledge', cost: 'memories' },
    abandoned_champion: { abandonReason: 'discarded' },
    defector_spy: { specialty: 'espionage', affiliation: 'independent', reason: 'saw_person', orgAwareness: 'knows', leverageType: 'blackmail' },
};

function completeDraft(origin, extra = {}) {
    return normalizeOriginDraft(createOriginDraft({
        origin,
        race: origin === 'vampire_lord' ? 'vampire' : 'human',
        modifiers: { ...REQUIRED[origin], ...(extra.modifiers || {}) },
        nation: { government: 'absolute_monarchy', vibes: ['wealth'], ...(extra.nation || {}) },
        ...Object.fromEntries(Object.entries(extra).filter(([k]) => !['modifiers', 'nation'].includes(k))),
    }));
}

describe('origin data', () => {
    it('defines all eight origins from the spec', () => {
        expect(ORIGIN_IDS).toEqual(['exiled_royal', 'vampire_lord', 'freed_minion', 'oathbreaker', 'cultist', 'artifact_bound', 'abandoned_champion', 'defector_spy']);
    });

    it('every complete draft validates cleanly', () => {
        for (const origin of ORIGIN_IDS) {
            const result = validateOriginDraft(completeDraft(origin));
            expect({ origin, errors: result.errors, conflicts: result.conflicts }).toEqual({ origin, errors: [], conflicts: [] });
        }
    });
});

describe('draft defaults and normalization', () => {
    it('applies optional modifier defaults (spec: skipped optional → default)', () => {
        const d = completeDraft('vampire_lord');
        expect(d.modifiers.memory).toBe('fragmented');
        expect(d.modifiers.power).toBe('weakened');
        expect(d.modifiers.feedingStance).toBe('restrained');
        expect(d.allies).toBe('scattered');
        expect(d.secrets).toBe('on');
    });

    it('defaults the majority race to the character race, or Vampire for the Vampire Lord', () => {
        expect(completeDraft('oathbreaker', { race: 'dwarf' }).nation.majorityRace).toBe('dwarf');
        expect(completeDraft('vampire_lord').nation.majorityRace).toBe('vampire');
    });

    it('drops modifiers and blanks that no longer apply', () => {
        let d = completeDraft('cultist', { modifiers: { allegiance: 'secret', secretBurden: 'killing' }, blanks: { burdenDetail: 'x' } });
        expect(d.modifiers.secretBurden).toBe('killing');
        expect(d.blanks.burdenDetail).toBe('x');
        d = normalizeOriginDraft({ ...d, modifiers: { ...d.modifiers, allegiance: 'truly_left' } });
        expect(d.modifiers.secretBurden).toBeUndefined();
        expect(d.blanks.burdenDetail).toBeUndefined();
    });

    it('shows oath-holder status options for the chosen holder type only', () => {
        const d = completeDraft('oathbreaker', { modifiers: { oathHolderType: 'order', holderStatusOrder: 'splintered' } });
        const ids = getVisibleModifiers(d).map(m => m.id);
        expect(ids).toContain('holderStatusOrder');
        expect(ids).not.toContain('holderStatusGod');
        expect(ids).not.toContain('holderStatusLiege');
    });

    it('shows conditional blanks (prophecy, cult, custom archetype)', () => {
        const vl = completeDraft('vampire_lord', { modifiers: { slumberPrimary: 'hiding', slumberSecondary: 'prophecy', awakenedBy: 'cult' } });
        const ids = getVisibleBlanks(vl).map(b => b.id);
        expect(ids).toEqual(expect.arrayContaining(['prophecy', 'cultName']));
        expect(ids).not.toContain('catastrophe');
    });

    it('clamps quest count to 5–10', () => {
        expect(normalizeOriginDraft({ questCount: 99 }).questCount).toBe(10);
        expect(normalizeOriginDraft({ questCount: 1 }).questCount).toBe(5);
    });

    it('blood farms only when vampires hold power', () => {
        expect(normalizeOriginDraft({ origin: 'oathbreaker', race: 'human', nation: { bloodFarms: 'on' } }).nation.bloodFarms).toBe('off');
        expect(normalizeOriginDraft({ origin: 'oathbreaker', race: 'human', nation: { bloodFarms: 'on', vampireRuled: 'yes' } }).nation.bloodFarms).toBe('on');
        expect(completeDraft('vampire_lord', { nation: { bloodFarms: 'on' } }).nation.bloodFarms).toBe('on');
    });
});

describe('race compatibility (§3.5)', () => {
    it('Vampire Lord is vampire-only; only Royal and Vampire Lord may be Vampire', () => {
        expect(getAllowedRaces('vampire_lord')).toEqual(['vampire']);
        expect(getAllowedRaces('exiled_royal')).toContain('vampire');
        for (const o of ['freed_minion', 'oathbreaker', 'cultist', 'artifact_bound', 'abandoned_champion', 'defector_spy']) {
            expect(getAllowedRaces(o)).not.toContain('vampire');
            expect(getAllowedRaces(o)).toContain('silkborn');
        }
    });

    it('clears an incompatible race when the origin changes', () => {
        expect(normalizeOriginDraft({ origin: 'cultist', race: 'vampire' }).race).toBe('');
    });

    it('Turned is unavailable to the Vampire Lord, Freed Minion, and born vampires', () => {
        expect(canBeTurned({ origin: 'oathbreaker', race: 'elf', customRace: {} })).toBe(true);
        expect(canBeTurned({ origin: 'freed_minion', race: 'elf', customRace: {} })).toBe(false);
        expect(canBeTurned({ origin: 'vampire_lord', race: 'vampire', customRace: {} })).toBe(false);
        expect(canBeTurned({ origin: 'exiled_royal', race: 'vampire', customRace: {} })).toBe(false);
        expect(normalizeOriginDraft({ origin: 'freed_minion', race: 'elf', turned: true }).turned).toBe(false);
    });

    it('Turned requires the regional vampire treatment', () => {
        const d = completeDraft('oathbreaker', { turned: true });
        expect(validateOriginDraft(d).errors.map(e => e.field)).toContain('vampireTreatment');
        expect(validateOriginDraft({ ...d, vampireTreatment: 'tolerated' }).ok).toBe(true);
    });

    it('custom non-living race: Royal asks to confirm it can rule; others must make it living', () => {
        const royal = completeDraft('exiled_royal', { race: 'custom', customRace: { name: 'Hollowkin', living: 'no' } });
        const c1 = validateOriginDraft(royal).conflicts.find(c => c.id === 'custom_race_rule');
        expect(c1).toBeTruthy();
        expect(validateOriginDraft(applyDraftPatch(royal, c1.choices[0].patch)).ok).toBe(true);

        const spy = completeDraft('defector_spy', { race: 'custom', customRace: { name: 'Hollowkin', living: 'no' } });
        expect(validateOriginDraft(spy).conflicts.map(c => c.id)).toContain('custom_race_living');
    });
});

describe('selection conflicts (§1.2)', () => {
    const conflictIds = (d) => validateOriginDraft(d).conflicts.map(c => c.id);

    it('Matriarchal and Patriarchal cannot coexist; each choice resolves it', () => {
        const d = completeDraft('cultist', { nation: { vibes: ['matriarchal', 'patriarchal'] } });
        const conflict = validateOriginDraft(d).conflicts.find(c => c.id === 'matriarchal_patriarchal');
        expect(conflict.choices).toHaveLength(2);
        const kept = applyDraftPatch(d, conflict.choices[0].patch);
        expect(kept.nation.vibes).toEqual(['matriarchal']);
        expect(validateOriginDraft(kept).ok).toBe(true);
    });

    it('Freed Minion must have worsening decay or lich-knowledge', () => {
        const d = completeDraft('freed_minion', { modifiers: { decayProgression: 'static', lichKnowledge: 'no' } });
        expect(conflictIds(d)).toContain('minion_needs_lever');
        const fixed = applyDraftPatch(d, validateOriginDraft(d).conflicts[0].choices[1].patch);
        expect(fixed.modifiers.lichKnowledge).toBe('yes');
        expect(validateOriginDraft(fixed).ok).toBe(true);
    });

    it('a hidden curse must be armor-lock, slow transformation or compulsion', () => {
        expect(conflictIds(completeDraft('oathbreaker', { modifiers: { curseType: 'animal', curseVisibility: 'hidden' } }))).toContain('curse_cannot_hide');
        expect(conflictIds(completeDraft('oathbreaker', { modifiers: { curseType: 'compulsion', curseVisibility: 'hidden' } }))).not.toContain('curse_cannot_hide');
    });

    it('Defector Spy loved-one leverage conflicts with fully abandoned allies', () => {
        const d = completeDraft('defector_spy', { allies: 'abandoned', modifiers: { leverageType: 'loved_one_inside' } });
        expect(conflictIds(d)).toContain('spy_leverage_allies');
    });

    it('Exiled Royal needs a ruling line; Theocracy needs a divine bloodline', () => {
        expect(conflictIds(completeDraft('exiled_royal', { nation: { government: 'republic' } }))).toContain('royal_needs_ruling_line');
        const theo = completeDraft('exiled_royal', { nation: { government: 'theocracy' } });
        expect(conflictIds(theo)).toContain('theocracy_divine_bloodline');
        expect(validateOriginDraft({ ...theo, nation: { ...theo.nation, divineBloodline: true } }).ok).toBe(true);
        expect(conflictIds(completeDraft('oathbreaker', { nation: { government: 'republic' } }))).toEqual([]);
    });

    it('Hive Sovereignty and Silkborn majority go together', () => {
        expect(conflictIds(completeDraft('oathbreaker', { nation: { government: 'hive_sovereignty' } }))).toContain('hive_needs_silkborn');
        expect(conflictIds(completeDraft('oathbreaker', { race: 'silkborn', nation: { government: 'republic' } }))).toContain('silkborn_needs_hive');
        expect(validateOriginDraft(completeDraft('exiled_royal', { race: 'silkborn', nation: { government: 'hive_sovereignty' } })).ok).toBe(true);
    });

    it('secondary slumber reason and cultist pursuer must differ from the primary', () => {
        expect(conflictIds(completeDraft('vampire_lord', { modifiers: { slumberSecondary: 'weariness' } }))).toContain('slumber_secondary_same');
        expect(conflictIds(completeDraft('cultist', { modifiers: { secondaryPursuer: 'cult' } }))).toContain('cultist_pursuer_same');
    });

    it('reports missing required modifiers, vibes and family fates as errors', () => {
        const d = normalizeOriginDraft(createOriginDraft({ origin: 'exiled_royal', race: 'elf', family: [{ name: 'Aldric', relation: 'brother' }] }));
        const fields = validateOriginDraft(d).errors.map(e => e.field);
        expect(fields).toEqual(expect.arrayContaining(['modifiers.exileReason', 'modifiers.markType', 'nation.government', 'nation.vibes', 'family.0.fate']));
        expect(fields).not.toContain('modifiers.kingdomStatus'); // has a default
    });

    it('death-focused requires a sub-option', () => {
        const d = completeDraft('cultist', { nation: { vibes: ['death'] } });
        expect(validateOriginDraft(d).errors.map(e => e.field)).toContain('nation.deathSub');
        expect(validateOriginDraft({ ...d, nation: { ...d.nation, deathSub: 'reverence' } }).ok).toBe(true);
    });

    it('notes the destroyed-kingdom adjustment', () => {
        const d = completeDraft('exiled_royal', { modifiers: { kingdomStatus: 'destroyed' } });
        expect(validateOriginDraft(d).notes.join(' ')).toMatch(/destroyed it/);
        expect(getPursuerPlan(d)[0].label).toBe('The one who destroyed the kingdom');
    });
});

describe('pursuers (§8)', () => {
    it('Vampire Lord pursuer is forced when hunted/hiding/desperate, optional otherwise', () => {
        expect(getPursuerPlan(completeDraft('vampire_lord'))).toEqual([]);
        expect(getPursuerPlan(completeDraft('vampire_lord', { pursuerToggle: 'on' }))).toHaveLength(1);
        expect(getPursuerPlan(completeDraft('vampire_lord', { modifiers: { currentTreatment: 'feared_hunted' } }))).toHaveLength(1);
        expect(getPursuerPlan(completeDraft('vampire_lord', { modifiers: { awakenedBy: 'desperate' }, secondaryToggle: 'on' }))).toHaveLength(2);
    });

    it('Artifact-Bound has no pursuer without claimants', () => {
        expect(getPursuerPlan(completeDraft('artifact_bound'))).toHaveLength(1);
        expect(getPursuerPlan(completeDraft('artifact_bound', { modifiers: { claimants: 'none' } }))).toEqual([]);
    });

    it('Abandoned Champion gets the replacement and/or those wronged', () => {
        expect(getPursuerPlan(completeDraft('abandoned_champion'))).toEqual([]);
        const both = getPursuerPlan(completeDraft('abandoned_champion', { modifiers: { replacement: 'hostile', hunted: 'yes' } }));
        expect(both.map(p => p.slot)).toEqual(['primary', 'secondary']);
    });

    it('Cultist uses the chosen pursuers; Spy requires leverage', () => {
        const plan = getPursuerPlan(completeDraft('cultist', { modifiers: { secondaryPursuer: 'order' } }));
        expect(plan.map(p => p.label)).toEqual(['Remaining cult members', 'An opposing religious order']);
        expect(getPursuerPlan(completeDraft('defector_spy'))[0].leverageRequired).toBe(true);
    });
});

describe('levers and runtime rules (§1.3)', () => {
    it('every origin guarantees at least one social and one personal lever', () => {
        for (const origin of ORIGIN_IDS) {
            const levers = computeLevers(completeDraft(origin));
            expect(levers.social.length, origin).toBeGreaterThan(0);
            expect(levers.personal.length, origin).toBeGreaterThan(0);
        }
    });

    it('hidden curse falls back to the oathbreaker reputation lever', () => {
        const levers = computeLevers(completeDraft('oathbreaker', { modifiers: { curseVisibility: 'hidden' } }));
        expect(levers.social[0]).toMatch(/known to the oath-holder's people/);
    });

    it('Silkborn adds the residual thread; Turned adds the Hunger', () => {
        const silk = computeLevers(completeDraft('cultist', { race: 'silkborn' }));
        expect(silk.personal.join(' ')).toMatch(/residual thread/);
        const turned = computeLevers(completeDraft('cultist', { turned: true, vampireTreatment: 'feared_hunted' }));
        expect(turned.personal.join(' ')).toMatch(/Hunger/);
        expect(turned.social.join(' ')).toMatch(/feared and hunted/);
    });

    it('includes Silkborn severance and conditional origin rules', () => {
        const rules = computeRuntimeRules(completeDraft('defector_spy', { race: 'silkborn', modifiers: { orgAwareness: 'undiscovered' } }));
        expect(rules.join(' ')).toMatch(/"we" instead of "I"/);
        expect(rules.join(' ')).toMatch(/Silkborn spy/);
        expect(rules.join(' ')).toMatch(/racing the moment/);
    });

    it('abstainment legacy with blood farms surfaces the twist', () => {
        const rules = computeRuntimeRules(completeDraft('vampire_lord', { modifiers: { legacy: 'abstainment' }, nation: { bloodFarms: 'on' } }));
        expect(rules.join(' ')).toMatch(/in defiance of everything you stood for/);
    });
});

describe('Origin Architect prompt and parsing', () => {
    const draft = completeDraft('oathbreaker', {
        name: 'Seren Vale', currentLocation: 'Harrowgate',
        blanks: { oathSwornTo: 'Tyrr the Just' },
        pursuerOverrides: { primary: { identity: 'Inquisitor Maelis', motive: 'capture' } },
    });

    it('lists fixed selections, AI-fill markers, levers and secret candidates', () => {
        const { system, user } = buildOriginArchitectPrompts(draft);
        expect(system).toMatch(/Origin Architect/);
        expect(user).toMatch(/ORIGIN: Oathbreaker Knight/);
        expect(user).toMatch(/Name: Seren Vale/);
        expect(user).toMatch(/\[oathSwornTo\] Who the oath was sworn to \(by name\): Tyrr the Just/);
        expect(user).toMatch(/\[howBroken\].*\(AI: fill\)/);
        expect(user).toMatch(/Curse type: Unable to remove their armor/);
        expect(user).toMatch(/Identity: Inquisitor Maelis/);
        expect(user).toMatch(/SECRET CANDIDATES/);
        expect(user).toMatch(/Wealth-focused: Status is measured/);
    });

    it('marks THEN/NOW for the Vampire Lord and omits secrets when off', () => {
        const { user } = buildOriginArchitectPrompts(completeDraft('vampire_lord', { secrets: 'off' }));
        expect(user).toMatch(/THEN\/NOW/);
        expect(user).toMatch(/NOW snapshot/);
        expect(user).not.toMatch(/SECRET CANDIDATES/);
    });

    it('honors a custom system prompt override', () => {
        expect(buildOriginArchitectPrompts(draft, { systemPrompt: 'CUSTOM' }).system).toBe('CUSTOM');
    });

    it('extracts JSON from fenced or chatty replies', () => {
        expect(extractJsonObject('Sure!\n```json\n{"a":{"b":"}"}}\n```')).toEqual({ a: { b: '}' } });
        expect(extractJsonObject('no json here')).toBeNull();
    });

    const reply = JSON.stringify({
        identity: { name: 'Model Name', apparentAge: '34', genderPronouns: 'she/her', title: '' },
        blanks: { oathSwornTo: 'Model God', howBroken: 'She spared the heretic.', whyBroken: 'Mercy.' },
        nation: { name: 'Aurel', outsiderView: 'Rich and pious', dailyLife: 'Markets', then: { name: 'x' } },
        currentLocation: 'Model Town',
        backstory: 'Long story.',
        appearance: 'Scarred; locked in blackened plate.',
        socialLever: { description: 'The black plate', whoRecognizes: 'Tyrr faithful', typicalReaction: 'Scorn' },
        personalLevers: [{ name: 'Armor-lock', description: 'Cannot remove armor', severity: 'severe', currentPressure: 'Sores' }],
        pursuers: [{ slot: 'primary', identity: 'Model Inquisitor', motive: 'kill', awareness: 'closing_in', plan: 'Hunt her' }],
        allies: { named: [{ name: 'Brother Ot', note: 'Old friend' }] },
        currentGoal: 'Find a smith who can open the armor.',
        originArc: { summary: 'Break or accept the curse.' },
        secrets: [{ secret: 'Tyrr engineered the breaking.', seedIdeas: ['a gilded sigil'] }, { secret: 'two' }, { secret: 'three' }],
        openingSituation: 'A tavern goes silent when she enters.',
    });

    it('player selections win over model output; secrets capped at two', () => {
        const profile = parseOriginArchitectResponse(reply, draft);
        expect(profile.identity.name).toBe('Seren Vale');
        expect(profile.blanks.oathSwornTo).toBe('Tyrr the Just');
        expect(profile.blanks.howBroken).toBe('She spared the heretic.');
        expect(profile.currentLocation).toBe('Harrowgate');
        expect(profile.pursuers).toHaveLength(1);
        expect(profile.pursuers[0].identity).toBe('Inquisitor Maelis');
        expect(profile.pursuers[0].motive).toBe('Capture');
        expect(profile.pursuers[0].plan).toBe('Hunt her');
        expect(profile.nation.government).toBe('Absolute monarchy');
        expect(profile.nation.then).toBeNull(); // not a THEN/NOW origin
        expect(profile.secrets).toHaveLength(2);
    });

    it('drops secrets when the toggle is off, and throws on non-JSON', () => {
        expect(parseOriginArchitectResponse(reply, { ...draft, secrets: 'off' }).secrets).toEqual([]);
        expect(() => parseOriginArchitectResponse('I cannot do that', draft)).toThrow(/valid JSON/);
    });

    describe('record outputs', () => {
        const profile = parseOriginArchitectResponse(reply, draft);
        const record = buildOriginRecord(draft, profile, 123);

        it('stores selections, levers, rules and quest count', () => {
            expect(record.createdAt).toBe(123);
            expect(record.originId).toBe('oathbreaker');
            expect(record.questCount).toBe(7);
            expect(record.levers.personal.length).toBeGreaterThan(0);
        });

        it('the [ORIGIN] block carries levers, pursuers and hidden secrets for the narrator', () => {
            const block = buildOriginInjectionBlock(record);
            expect(block.startsWith('[ORIGIN]')).toBe(true);
            expect(block).toMatch(/\[\/ORIGIN\]\n\n$/);
            expect(block).toMatch(/Recognition: The black plate; recognized by Tyrr faithful/);
            expect(block).toMatch(/Armor-lock \(severe\): Sores/);
            expect(block).toMatch(/Inquisitor Maelis/);
            expect(block).toMatch(/HIDDEN — origin secrets/);
            expect(block).toMatch(/Tyrr engineered the breaking/);
        });

        it('player-facing outputs never contain secrets or hidden plans', () => {
            const card = buildOriginPlayerCardHints(record);
            const sheet = JSON.stringify(buildOriginCharacterSheetHints(record));
            const opening = buildOriginOpeningMessage(record);
            for (const text of [card, sheet, opening]) {
                expect(text).not.toMatch(/engineered the breaking/);
                expect(text).not.toMatch(/Hunt her/);
            }
            expect(opening).toMatch(/^Begin the adventure\./);
            expect(opening).toMatch(/tavern goes silent/);
        });

        it('maps the profile onto Character Creator fields', () => {
            const hints = buildOriginCharacterSheetHints(record);
            expect(hints.nameVal).toBe('Seren Vale');
            expect(hints.speciesVal).toBe('Human');
            expect(hints.backgroundVal).toMatch(/^Oathbreaker Knight/);
            expect(hints.classRaw).toBe('__story__');
            expect(hints.level).toBe(1);
        });

        it('the summary hides secrets unless debug reveal is on', () => {
            expect(formatOriginSummary(record)).toMatch(/2 hidden/);
            expect(formatOriginSummary(record)).not.toMatch(/engineered/);
            expect(formatOriginSummary(record, { revealSecrets: true })).toMatch(/engineered the breaking/);
        });
    });
});

describe('spec coverage', () => {
    it('every origin lists secret candidates, an arc and a world-threat tie-in', () => {
        for (const [id, o] of Object.entries(ORIGINS)) {
            expect(o.secretCandidates.length, id).toBeGreaterThan(0);
            expect(o.arc, id).toBeTruthy();
            expect(o.tieIn, id).toBeTruthy();
        }
    });
});
