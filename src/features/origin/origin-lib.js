// ─────────────────────────────────────────────────────────────────────────
// Origin System — pure rules (Origin System Specification §1–§10).
//
// Everything here is deterministic and host-free so it can be unit-tested:
//   • draft shape + defaults          createOriginDraft / normalizeOriginDraft
//   • what the wizard shows           getVisibleBlanks / getVisibleModifiers / getPursuerPlan
//   • selection conflicts (§1.2)      validateOriginDraft → { errors, conflicts, notes }
//   • levers + runtime rules (§1.3)   computeLevers / computeRuntimeRules
//   • the one LLM pass                buildOriginArchitectPrompts / parseOriginArchitectResponse
//   • downstream outputs              buildOriginRecord / buildOriginInjectionBlock /
//                                     buildOriginCharacterSheetHints / buildOriginPlayerCardHints /
//                                     buildOriginOpeningMessage / formatOriginSummary
// Secrets live only in the record; the player-facing outputs never include them.
// ─────────────────────────────────────────────────────────────────────────

import {
    RACES, GOVERNMENTS, CULTURE_VIBES, ORIGINS, ORIGIN_IDS, VAMPIRE_RACE_ORIGINS,
    SILKBORN_DESCRIPTION, SILKBORN_SEVERANCE_RULES, TURNED_RULES,
    ALLIES_OPTIONS, SLAVERY_OPTIONS, FEEDING_STANCE, VAMPIRE_TREATMENT,
    PURSUER_MOTIVES, PURSUER_AWARENESS, FAMILY_FATES, TIME_ELAPSED_LABELS,
    CULTIST_PURSUER_LABELS, CUSTOM_RACE_FIELDS,
} from './origin-data.js';

export const ORIGIN_RECORD_VERSION = 1;
export const ORIGIN_QUEST_COUNT_MIN = 5;
export const ORIGIN_QUEST_COUNT_MAX = 10;
export const ORIGIN_QUEST_COUNT_DEFAULT = 7;
export const ORIGIN_MAX_FAMILY = 4;
export const ORIGIN_MAX_SECRETS = 2;

const clone = (value) => JSON.parse(JSON.stringify(value));
const str = (value) => (value == null ? '' : String(value)).trim();

// ── Draft ─────────────────────────────────────────────────────────────────

function emptyPursuerOverride() {
    return { identity: '', affiliation: '', motive: '', resources: '', awareness: '', leverage: '' };
}

/** A blank wizard draft. Every key the wizard writes exists here. */
export function createOriginDraft(overrides = {}) {
    const draft = {
        version: ORIGIN_RECORD_VERSION,
        // §2 universal blanks
        name: '', apparentAge: '', trueAge: '', gender: '', orientation: '',
        currentLocation: '', timeElapsed: '',
        // §2 universal modifiers
        race: '', origin: '', allies: 'scattered', secrets: 'on',
        // §3.2 Turned
        turned: false, feedingStance: 'restrained', vampireTreatment: '',
        // §3.4 custom race
        customRace: { name: '', appearance: '', lifespan: '', habitat: '', cultureTendencies: '', trait: '', living: 'yes', canRule: false },
        // §7 origin-specific
        modifiers: {}, blanks: {}, family: [],
        // §4 Core Nation Block (+ Now snapshot overrides for Then/Now origins)
        nation: {
            name: '', majorityRace: '', government: '', vibes: [], deathSub: '', environment: '',
            slavery: 'ai', vampireRuled: 'no', bloodFarms: 'off', divineBloodline: false,
            now: { name: '', government: '', vibes: '' },
        },
        // §8 Pursuer Block — AI-filled unless overridden
        pursuerToggle: 'off', secondaryToggle: 'off',
        pursuerOverrides: { primary: emptyPursuerOverride(), secondary: emptyPursuerOverride() },
        // Reused Character Creator fields (Q11)
        appearance: '', personality: '', talents: '', additional: '',
        className: '__story__', classOther: '', level: 1, gearTier: 'auto',
        // Output options
        questCount: ORIGIN_QUEST_COUNT_DEFAULT, wordCount: 150,
        createStPersona: true, sendStarter: true,
    };
    return deepMerge(draft, overrides || {});
}

function deepMerge(base, patch) {
    for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
            deepMerge(base[key], value);
        } else {
            base[key] = clone(value === undefined ? null : value);
        }
    }
    return base;
}

/** Set a dotted path (`nation.government`, `modifiers.legacy`) on a draft copy. */
export function setDraftPath(draft, path, value) {
    const next = clone(draft);
    const parts = String(path).split('.');
    let cursor = next;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
        cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
    return next;
}

/** Apply a conflict choice's `{ path: value }` patch. */
export function applyDraftPatch(draft, patch) {
    let next = draft;
    for (const [path, value] of Object.entries(patch || {})) next = setDraftPath(next, path, value);
    return normalizeOriginDraft(next);
}

export function getOrigin(originId) {
    return ORIGINS[originId] || null;
}

export function getRace(raceId) {
    return RACES.find(r => r.id === raceId) || null;
}

/** Display label for the character's race, including a custom race's name and Turned. */
export function describeRace(draft) {
    const base = draft.race === 'custom'
        ? (str(draft.customRace?.name) || 'Custom race')
        : (getRace(draft.race)?.label || '');
    return draft.turned && base ? `${base} (Turned vampire)` : base;
}

function raceLabelById(raceId, draft) {
    if (raceId === 'custom') return str(draft?.customRace?.name) || 'Custom race';
    return getRace(raceId)?.label || raceId || '';
}

/** Living for compatibility checks; Turned counts as not living (§3.2). */
export function isBaseRaceLiving(draft) {
    if (draft.race === 'custom') return draft.customRace?.living !== 'no';
    return getRace(draft.race)?.living !== false;
}

/** Race ids an origin permits (§3.5). `custom` is included where the rules allow it. */
export function getAllowedRaces(originId) {
    const origin = getOrigin(originId);
    if (!origin) return RACES.map(r => r.id);
    if (origin.races === 'vampire_only') return ['vampire'];
    if (origin.races === 'any_ruling') return RACES.map(r => r.id);
    // living_* origins: every living race plus custom (checked for living later)
    return RACES.filter(r => r.living || r.id === 'custom').map(r => r.id);
}

/** Turned is available to every origin except Vampire Lord and Freed Undead Minion, and never to a born vampire. */
export function canBeTurned(draft) {
    if (!draft.origin || draft.origin === 'vampire_lord' || draft.origin === 'freed_minion') return false;
    if (draft.race === 'vampire') return false;
    if (draft.race === 'custom' && draft.customRace?.living === 'no') return false;
    return true;
}

export function hasThenNow(draft) {
    return !!getOrigin(draft.origin)?.nationThenNow;
}

/** Default majority race for the Core Nation Block (§4). */
export function defaultMajorityRace(draft) {
    const origin = getOrigin(draft.origin);
    if (origin?.defaultMajorityRace) return origin.defaultMajorityRace;
    return draft.race || '';
}

/** Vampires hold power when the nation is vampire-majority or the player says so. */
export function vampiresHoldPower(draft) {
    return draft.nation.majorityRace === 'vampire' || draft.nation.vampireRuled === 'yes';
}

export function getVisibleBlanks(draft) {
    const origin = getOrigin(draft.origin);
    if (!origin) return [];
    return origin.blanks.filter(b => !b.showIf || b.showIf(draft));
}

export function getVisibleModifiers(draft) {
    const origin = getOrigin(draft.origin);
    if (!origin) return [];
    return origin.modifiers.filter(m => !m.showIf || m.showIf(draft));
}

/**
 * Fill defaults and drop values that no longer apply. Idempotent; the wizard
 * calls it after every change so hidden fields never leak into the prompt.
 */
export function normalizeOriginDraft(input) {
    const draft = createOriginDraft(input || {});
    const origin = getOrigin(draft.origin);

    if (!canBeTurned(draft)) draft.turned = false;
    if (draft.origin && draft.race && !getAllowedRaces(draft.origin).includes(draft.race)) draft.race = '';

    // Only keep modifiers/blanks that belong to the current origin and are visible.
    const modifiers = {};
    const blanks = {};
    if (origin) {
        for (const mod of origin.modifiers) {
            const visible = !mod.showIf || mod.showIf({ ...draft, modifiers: { ...draft.modifiers } });
            if (!visible) continue;
            let value = draft.modifiers[mod.id];
            if (mod.multi) {
                value = Array.isArray(value) ? value.filter(v => mod.options.some(o => o.value === v)).slice(0, mod.multi.max) : [];
            } else if (!mod.options.some(o => o.value === value)) {
                value = mod.default ?? '';
            }
            modifiers[mod.id] = value;
        }
        for (const blank of origin.blanks) blanks[blank.id] = str(draft.blanks[blank.id]) ? draft.blanks[blank.id] : '';
    }
    draft.modifiers = modifiers;
    // Re-run visibility now that defaults exist (e.g. showIf reading a defaulted modifier).
    if (origin) {
        for (const mod of origin.modifiers) {
            if (mod.showIf && !mod.showIf(draft)) delete draft.modifiers[mod.id];
        }
        for (const blank of origin.blanks) {
            if (blank.showIf && !blank.showIf({ ...draft, blanks })) delete blanks[blank.id];
        }
    }
    draft.blanks = blanks;

    if (!origin?.family) draft.family = [];
    draft.family = (draft.family || []).slice(0, ORIGIN_MAX_FAMILY).map(member => ({
        name: str(member?.name), relation: str(member?.relation),
        fate: FAMILY_FATES.some(f => f.value === member?.fate) ? member.fate : '',
    }));

    if (!draft.nation.majorityRace) draft.nation.majorityRace = defaultMajorityRace(draft);
    draft.nation.vibes = (draft.nation.vibes || []).filter(v => CULTURE_VIBES.some(c => c.id === v)).slice(0, 2);
    if (!draft.nation.vibes.includes('death')) draft.nation.deathSub = '';
    if (!vampiresHoldPower(draft)) draft.nation.bloodFarms = 'off';
    if (draft.nation.government !== 'theocracy') draft.nation.divineBloodline = false;

    if (!draft.turned) draft.vampireTreatment = '';
    const qc = Number.parseInt(draft.questCount, 10);
    draft.questCount = Number.isFinite(qc) ? Math.max(ORIGIN_QUEST_COUNT_MIN, Math.min(ORIGIN_QUEST_COUNT_MAX, qc)) : ORIGIN_QUEST_COUNT_DEFAULT;
    const wc = Number.parseInt(draft.wordCount, 10);
    draft.wordCount = Number.isFinite(wc) ? Math.max(50, Math.min(5000, wc)) : 150;
    return draft;
}

// ── Pursuers (§8) ─────────────────────────────────────────────────────────

/** True when the Vampire Lord's Pursuer Block is forced on (§7.2 Uses). */
export function vampireLordPursuerForced(draft) {
    const m = draft.modifiers || {};
    return m.currentTreatment === 'feared_hunted'
        || m.slumberPrimary === 'hiding' || m.slumberSecondary === 'hiding'
        || m.awakenedBy === 'desperate';
}

/**
 * The Pursuer Blocks this character gets, in order (primary first).
 * @returns {{ slot: 'primary'|'secondary', label: string, leverageRequired: boolean }[]}
 */
export function getPursuerPlan(draft) {
    const origin = getOrigin(draft.origin);
    if (!origin) return [];
    const m = draft.modifiers || {};
    const plan = [];
    const push = (label, extra = {}) => plan.push({
        slot: plan.length === 0 ? 'primary' : 'secondary',
        label,
        leverageRequired: !!extra.leverageRequired,
    });

    switch (origin.pursuers.mode) {
        case 'vampire_lord':
            if (vampireLordPursuerForced(draft) || draft.pursuerToggle === 'on') {
                push(origin.pursuers.primary);
                if (draft.secondaryToggle === 'on') push('A second pursuer');
            }
            break;
        case 'cultist':
            if (m.primaryPursuer) push(CULTIST_PURSUER_LABELS[m.primaryPursuer] || m.primaryPursuer);
            if (m.secondaryPursuer && m.secondaryPursuer !== 'none' && m.secondaryPursuer !== m.primaryPursuer) {
                push(CULTIST_PURSUER_LABELS[m.secondaryPursuer] || m.secondaryPursuer);
            }
            break;
        case 'artifact':
            if (m.claimants !== 'none') push(origin.pursuers.primary);
            break;
        case 'champion':
            if (m.replacement === 'rival') push('The replacement champion (rival successor)');
            else if (m.replacement === 'hostile') push('The replacement champion (hostile)');
            if (m.hunted === 'yes') push('Those wronged in fulfilling the destiny');
            break;
        default:
            if (draft.origin === 'exiled_royal' && m.kingdomStatus === 'destroyed') push('The one who destroyed the kingdom');
            else push(origin.pursuers.primary, { leverageRequired: origin.pursuers.leverageRequired });
    }
    return plan;
}

// ── Validation: errors, selection conflicts, notes (§1.2) ─────────────────

/**
 * @typedef {{ field: string, message: string }} OriginError
 * @typedef {{ id: string, message: string, choices: { label: string, patch: Record<string, any> }[] }} OriginConflict
 */

/**
 * Check a draft before generation. `errors` block generation (missing required
 * choices). `conflicts` are selection conflicts that also block, each with the
 * choices the player picks between (spec: "ask the player which choice to keep").
 * `notes` are automatic adjustments the prompt applies and the UI explains.
 * @returns {{ errors: OriginError[], conflicts: OriginConflict[], notes: string[], ok: boolean }}
 */
export function validateOriginDraft(input) {
    const draft = normalizeOriginDraft(input);
    /** @type {OriginError[]} */ const errors = [];
    /** @type {OriginConflict[]} */ const conflicts = [];
    /** @type {string[]} */ const notes = [];
    const origin = getOrigin(draft.origin);

    if (!origin) errors.push({ field: 'origin', message: 'Choose an origin.' });
    if (!draft.race) errors.push({ field: 'race', message: origin ? `Choose a race allowed for the ${origin.label}.` : 'Choose a race.' });

    if (draft.race === 'custom' && !str(draft.customRace.name)) {
        errors.push({ field: 'customRace.name', message: 'Name your custom race.' });
    }
    if (origin && draft.race === 'custom' && draft.customRace.living === 'no') {
        if (origin.races === 'any_ruling') {
            if (!draft.customRace.canRule) {
                conflicts.push({
                    id: 'custom_race_rule',
                    message: 'An Exiled Royal with a non-living custom race needs your confirmation that this race can rule a nation.',
                    choices: [
                        { label: 'Yes — this race can rule a nation', patch: { 'customRace.canRule': true } },
                        { label: 'Make the race living', patch: { 'customRace.living': 'yes' } },
                    ],
                });
            }
        } else {
            conflicts.push({
                id: 'custom_race_living',
                message: `The ${origin.label} requires a living race.`,
                choices: [
                    { label: 'Make the custom race living', patch: { 'customRace.living': 'yes' } },
                    { label: 'Choose another race', patch: { race: '' } },
                ],
            });
        }
    }
    if (draft.turned && !str(draft.vampireTreatment)) {
        errors.push({ field: 'vampireTreatment', message: 'Turned: choose how the current region treats vampires.' });
    }

    if (origin) {
        for (const mod of getVisibleModifiers(draft)) {
            const value = draft.modifiers[mod.id];
            if (mod.multi) {
                if (mod.required && (!Array.isArray(value) || value.length < mod.multi.min)) {
                    errors.push({ field: `modifiers.${mod.id}`, message: `${mod.label}: pick ${mod.multi.min}–${mod.multi.max}.` });
                }
            } else if (mod.required && !value) {
                errors.push({ field: `modifiers.${mod.id}`, message: `Choose: ${mod.label}.` });
            }
        }
        if (origin.family) {
            draft.family.forEach((member, i) => {
                if ((member.name || member.relation) && !member.fate) {
                    errors.push({ field: `family.${i}.fate`, message: `Choose a fate for ${member.name || `family member ${i + 1}`}.` });
                }
            });
        }
    }

    // §4 Core Nation Block
    if (origin) {
        if (!draft.nation.majorityRace) errors.push({ field: 'nation.majorityRace', message: 'Choose the origin nation\'s majority race.' });
        if (!draft.nation.government) errors.push({ field: 'nation.government', message: 'Choose the origin nation\'s government.' });
        if (!draft.nation.vibes.length) errors.push({ field: 'nation.vibes', message: 'Pick 1–2 culture vibes for the origin nation.' });
        if (draft.nation.vibes.includes('death') && !draft.nation.deathSub) {
            errors.push({ field: 'nation.deathSub', message: 'Death-focused needs a sub-option.' });
        }
    }
    if (draft.nation.vibes.includes('matriarchal') && draft.nation.vibes.includes('patriarchal')) {
        conflicts.push({
            id: 'matriarchal_patriarchal',
            message: 'Matriarchal and Patriarchal cannot be selected together.',
            choices: [
                { label: 'Keep Matriarchal', patch: { 'nation.vibes': draft.nation.vibes.filter(v => v !== 'patriarchal') } },
                { label: 'Keep Patriarchal', patch: { 'nation.vibes': draft.nation.vibes.filter(v => v !== 'matriarchal') } },
            ],
        });
    }
    const gov = GOVERNMENTS.find(g => g.id === draft.nation.government);
    if (draft.nation.government === 'hive_sovereignty' && draft.nation.majorityRace && draft.nation.majorityRace !== 'silkborn') {
        conflicts.push({
            id: 'hive_needs_silkborn',
            message: 'Hive Sovereignty exists only in Silkborn-majority nations.',
            choices: [
                { label: 'Keep Hive Sovereignty (Silkborn majority)', patch: { 'nation.majorityRace': 'silkborn' } },
                { label: `Keep ${raceLabelById(draft.nation.majorityRace, draft)} majority (change government)`, patch: { 'nation.government': '' } },
            ],
        });
    }
    if (draft.nation.majorityRace === 'silkborn' && draft.nation.government && draft.nation.government !== 'hive_sovereignty') {
        conflicts.push({
            id: 'silkborn_needs_hive',
            message: "A Silkborn nation's government is always Hive Sovereignty.",
            choices: [
                { label: 'Use Hive Sovereignty', patch: { 'nation.government': 'hive_sovereignty' } },
                { label: `Keep ${gov?.label || 'this government'} (change majority race)`, patch: { 'nation.majorityRace': '' } },
            ],
        });
    }
    if (origin?.requiresRulingLine && gov) {
        if (gov.rulingLine === false) {
            conflicts.push({
                id: 'royal_needs_ruling_line',
                message: `An Exiled Royal needs a government with a ruling line; a ${gov.label} has none.`,
                choices: [
                    { label: 'Keep Exiled Royal (change government)', patch: { 'nation.government': '' } },
                    { label: `Keep ${gov.label} (change origin)`, patch: { origin: '' } },
                ],
            });
        } else if (gov.rulingLine === 'divine' && !draft.nation.divineBloodline) {
            conflicts.push({
                id: 'theocracy_divine_bloodline',
                message: 'A Theocracy has a ruling line only through a divine bloodline.',
                choices: [
                    { label: 'The high priesthood follows a divine bloodline', patch: { 'nation.divineBloodline': true } },
                    { label: 'Change government', patch: { 'nation.government': '' } },
                ],
            });
        }
    }

    // §7 origin selection conflicts
    const m = draft.modifiers;
    if (draft.origin === 'freed_minion' && m.decayProgression === 'static' && m.lichKnowledge === 'no') {
        conflicts.push({
            id: 'minion_needs_lever',
            message: 'A Freed Undead Minion needs worsening decay or retained lich-knowledge (or both) — otherwise there is no Personal Pressure Lever.',
            choices: [
                { label: 'Decay is worsening', patch: { 'modifiers.decayProgression': 'worsening' } },
                { label: 'They retained lich-knowledge', patch: { 'modifiers.lichKnowledge': 'yes' } },
            ],
        });
    }
    if (draft.origin === 'oathbreaker' && m.curseVisibility === 'hidden'
        && m.curseType && !['armor_lock', 'slow_transformation', 'compulsion'].includes(m.curseType)) {
        conflicts.push({
            id: 'curse_cannot_hide',
            message: 'Animal transformation and a split personality cause public incidents — they cannot stay hidden.',
            choices: [
                { label: 'Keep the curse (make it visible)', patch: { 'modifiers.curseVisibility': 'visible' } },
                { label: 'Keep it hidden (choose another curse)', patch: { 'modifiers.curseType': '' } },
            ],
        });
    }
    if (draft.origin === 'vampire_lord' && m.slumberSecondary && m.slumberSecondary !== 'none' && m.slumberSecondary === m.slumberPrimary) {
        conflicts.push({
            id: 'slumber_secondary_same',
            message: 'The secondary reason for slumber must differ from the primary.',
            choices: [{ label: 'Drop the secondary reason', patch: { 'modifiers.slumberSecondary': 'none' } }],
        });
    }
    if (draft.origin === 'cultist' && m.secondaryPursuer && m.secondaryPursuer !== 'none' && m.secondaryPursuer === m.primaryPursuer) {
        conflicts.push({
            id: 'cultist_pursuer_same',
            message: 'The secondary pursuer must differ from the primary.',
            choices: [{ label: 'Drop the secondary pursuer', patch: { 'modifiers.secondaryPursuer': 'none' } }],
        });
    }
    if (draft.origin === 'defector_spy' && m.leverageType === 'loved_one_inside' && draft.allies === 'abandoned') {
        conflicts.push({
            id: 'spy_leverage_allies',
            message: 'Leverage "someone they love, still inside" conflicts with Allies "fully abandoned, no remaining ties".',
            choices: [
                { label: 'Keep the leverage (allies scattered)', patch: { allies: 'scattered' } },
                { label: 'Keep allies abandoned (change leverage)', patch: { 'modifiers.leverageType': '' } },
            ],
        });
    }

    // Automatic adjustments the prompt applies (not blocking).
    if (draft.origin === 'exiled_royal' && m.kingdomStatus === 'destroyed') {
        notes.push("The kingdom is destroyed, so the usurper does not rule it: they become the one who destroyed it, and their claim becomes their reason for destroying it.");
    }
    if (draft.nation.bloodFarms === 'on') {
        notes.push('Blood farms require a substantial living population; the AI records that population as a fact of the nation.');
    }
    if (draft.origin === 'vampire_lord' && vampireLordPursuerForced(draft)) {
        notes.push('The Pursuer Block is on because vampires are hunted, the lord slumbered in hiding, or they were awakened to stop a threat.');
    }

    return { errors, conflicts, notes, ok: errors.length === 0 && conflicts.length === 0 };
}

// ── Levers and runtime rules (§1.3) ───────────────────────────────────────

function optionLabel(options, value) {
    return options.find(o => o.value === value)?.label || value || '';
}

function modifierLabel(originId, modId, value) {
    const mod = getOrigin(originId)?.modifiers.find(x => x.id === modId);
    if (!mod) return value || '';
    if (Array.isArray(value)) return value.map(v => optionLabel(mod.options, v)).join(', ');
    return optionLabel(mod.options, value);
}

/**
 * Guaranteed levers for this draft. Every origin yields at least one of each;
 * fallbacks (§7.4 hidden curse) and race/Turned extras are included.
 * @returns {{ social: string[], personal: string[] }}
 */
export function computeLevers(input) {
    const draft = normalizeOriginDraft(input);
    const origin = getOrigin(draft.origin);
    if (!origin) return { social: [], personal: [] };
    const m = draft.modifiers;
    const social = [];
    const personal = [];

    if (origin.socialLeverFallback && origin.socialLeverFallback.when(draft)) social.push(origin.socialLeverFallback.text);
    else social.push(origin.socialLever);

    switch (draft.origin) {
        case 'vampire_lord':
            personal.push(`The Hunger (feeding stance: ${optionLabel(FEEDING_STANCE, m.feedingStance)}).`);
            if (m.power === 'weakened') personal.push('Power recovery: weakened and recovering.');
            if (m.memory && m.memory !== 'intact') personal.push(`Memory relearning: memory ${optionLabel(getOrigin('vampire_lord').modifiers.find(x => x.id === 'memory').options, m.memory).toLowerCase()}.`);
            break;
        case 'freed_minion':
            if (m.decayProgression === 'worsening') personal.push('The decay clock: the body is worsening.');
            if (m.lichKnowledge === 'yes') personal.push('Corruption from retained lich-knowledge.');
            break;
        case 'oathbreaker':
            personal.push(`The curse: ${modifierLabel('oathbreaker', 'curseType', m.curseType).toLowerCase()} (source: ${modifierLabel('oathbreaker', 'curseSource', m.curseSource).toLowerCase()}; ${m.curseVisibility}).`);
            break;
        case 'artifact_bound':
            personal.push(`The cost of use: ${modifierLabel('artifact_bound', 'cost', m.cost).toLowerCase()}, compounded by the artifact's own agenda.`);
            break;
        case 'abandoned_champion':
            personal.push(`The fading blessing (${m.fadingRate} fade).`);
            break;
        case 'defector_spy':
            personal.push(`The organization's leverage: ${modifierLabel('defector_spy', 'leverageType', m.leverageType).toLowerCase()}.`);
            break;
        default:
            personal.push(origin.personalLever);
    }

    if (draft.race === 'silkborn') personal.push('The residual thread: fragmentary Weave sensations that may let the hive trace them.');
    if (draft.turned) {
        personal.push(`The Hunger (Turned; feeding stance: ${optionLabel(FEEDING_STANCE, draft.feedingStance)}).`);
        social.push(`Vampires in the current region are ${optionLabel(VAMPIRE_TREATMENT, draft.vampireTreatment).toLowerCase()}.`);
    }
    return { social, personal };
}

/** Runtime rules (§1.2) that apply to this character, in portrayal order. */
export function computeRuntimeRules(input) {
    const draft = normalizeOriginDraft(input);
    const origin = getOrigin(draft.origin);
    const rules = [];
    if (draft.race === 'silkborn') rules.push(...SILKBORN_SEVERANCE_RULES);
    if (draft.turned) rules.push(...TURNED_RULES);
    for (const rule of origin?.runtimeRules || []) {
        if (typeof rule === 'string') rules.push(rule);
        else if (rule.when(draft)) rules.push(rule.text);
    }
    return rules;
}

// ── The Origin Architect pass (the one LLM call) ──────────────────────────

export const ORIGIN_ARCHITECT_SYSTEM_PROMPT = `You are the Origin Architect for a Dungeons & Dragons 5th Edition-flavored fantasy roleplay campaign. The player has used a character-creation wizard. Your job is to finish the character: fill every blank the player left empty, derive the origin nation's details, instantiate the Pursuer Block(s), synthesize the backstory, and — when origin secrets are on — privately create the hidden secrets.

RULES
- Every selection the player made is fixed. Never contradict a chosen modifier, rule or player-written blank; build on them.
- Fill every field marked (AI: fill) with specific, concrete, setting-appropriate content. Never output placeholders, "Unknown", or "TBD".
- Portray standard races in their familiar D&D 5e conception. Treat every culture vibe neutrally as a worldbuilding input.
- The Social Recognition Lever lets NPCs recognize the character; the Personal Pressure Lever forces decisions over time. Make both vivid and playable.
- Pursuers are persistent NPCs or factions with a name, a plan and a motive — not faceless threats. Prefer leverage (a hostage, blackmail, a person they care about, a ruinous secret) over raw force.
- Secrets are facts about the character's own past that the character does NOT know. Base them on the listed secret candidates or invent a better one that fits. Each secret must be revealable through play and must not contradict any selection.
- The opening situation places the character at the Current location, in a concrete moment that shows at least one lever in action and ends on something the player can act on.
- Output ONLY one JSON object matching the schema below. No markdown fences, no commentary.

JSON SCHEMA
{
  "identity": { "name": string, "apparentAge": string, "trueAge": string, "genderPronouns": string, "title": string },
  "blanks": { "<blank id>": string },
  "family": [ { "name": string, "relation": string, "fate": "dead"|"imprisoned"|"hunting"|"aiding"|"unknown", "note": string } ],
  "nation": {
    "name": string, "government": string, "cultureVibes": [string], "environment": string, "slavery": string,
    "outsiderView": string, "dailyLife": string, "recordedFacts": [string],
    "then": { "name": string, "government": string, "cultureVibes": [string], "summary": string } | null,
    "now":  { "name": string, "government": string, "cultureVibes": [string], "summary": string } | null
  },
  "customRace": { "name": string, "appearance": string, "lifespan": string, "habitat": string, "cultureTendencies": string, "trait": string } | null,
  "currentLocation": string,
  "timeElapsed": string,
  "backstory": string,
  "appearance": string,
  "personality": string,
  "voice": string,
  "talents": string,
  "socialLever": { "description": string, "whoRecognizes": string, "typicalReaction": string },
  "personalLevers": [ { "name": string, "description": string, "severity": "minor"|"moderate"|"severe", "currentPressure": string } ],
  "pursuers": [ { "slot": "primary"|"secondary", "identity": string, "affiliation": string, "motive": string, "resources": string, "awareness": "unaware"|"searching_cold"|"closing_in", "leverage": string, "plan": string } ],
  "allies": { "status": string, "named": [ { "name": string, "note": string } ] },
  "currentGoal": string,
  "originArc": { "summary": string },
  "worldThreatTieIn": string,
  "secrets": [ { "secret": string, "seedIdeas": [string] } ],
  "openingSituation": string
}

FIELD NOTES
- "blanks": one key per origin blank id listed in the request, filled or copied verbatim when the player wrote it.
- "family": Exiled Royal only; otherwise []. Keep every family member and fate the player chose; add members only when the player named none (1–4 total).
- "nation.then"/"nation.now": only for origins marked THEN/NOW; otherwise null. "Then" is the nation at slumber or death (use the player's Core Nation Block). "Now" is the nation today — its name, government and vibes may have changed, and the distance between them is story material.
- "customRace": fill only when the race is custom; otherwise null.
- "backstory": 2–4 paragraphs of prose synthesized from every selection.
- "appearance": body and origin-bound items (decay, curse marks, a fused or locked artifact, a worn heirloom). No everyday clothing or gear.
- "talents": narrative capabilities only (no game mechanics).
- "pursuers": exactly one entry per Pursuer Block listed in the request, in the same order, honoring any player overrides; [] when none are listed.
- "secrets": 1–2 entries when origin secrets are on; [] when off.
- "currentGoal": one short, player-facing sentence.`;

function vibeText(vibeId, deathSub) {
    const vibe = CULTURE_VIBES.find(v => v.id === vibeId);
    if (!vibe) return vibeId;
    if (vibe.subOptions) {
        const sub = vibe.subOptions.find(s => s.value === deathSub);
        return sub ? `${vibe.label} — ${sub.label}: ${sub.description}` : vibe.label;
    }
    return `${vibe.label}: ${vibe.description}`;
}

const fill = (value) => (str(value) ? str(value) : '(AI: fill)');

/**
 * Build the system + user prompts for the Origin Architect pass.
 * @param {object} input draft
 * @param {{ systemPrompt?: string }} [opts]
 */
export function buildOriginArchitectPrompts(input, opts = {}) {
    const draft = normalizeOriginDraft(input);
    const origin = getOrigin(draft.origin);
    if (!origin) throw new Error('Choose an origin before generating.');
    const race = getRace(draft.race);
    const levers = computeLevers(draft);
    const rules = computeRuntimeRules(draft);
    const { notes } = validateOriginDraft(draft);
    const lines = [];
    const add = (line = '') => lines.push(line);

    add(`ORIGIN: ${origin.label}${origin.nationThenNow ? ' (THEN/NOW nation snapshots)' : ''}`);
    add(`Origin arc direction: ${origin.arc}`);
    add(`World-threat tie-in default: ${origin.tieIn}`);
    add();
    add('── UNIVERSAL FIELDS ──');
    add(`Name: ${fill(draft.name)}`);
    add(`Apparent age: ${fill(draft.apparentAge)}`);
    const longLived = draft.turned || draft.race === 'vampire' || draft.origin === 'freed_minion' || ['elf', 'dwarf', 'gnome', 'halfling', 'aasimar'].includes(draft.race);
    add(`True age: ${str(draft.trueAge) || (longLived ? '(AI: fill)' : '(same as apparent age unless the story needs otherwise)')}`);
    add(`Gender and pronouns: ${fill(draft.gender)}`);
    if (str(draft.orientation)) add(`Sexual orientation: ${draft.orientation}`);
    add(`Current location (where the campaign begins; separate from the origin nation): ${fill(draft.currentLocation)}`);
    if (TIME_ELAPSED_LABELS[draft.origin]) add(`${TIME_ELAPSED_LABELS[draft.origin]}: ${fill(draft.timeElapsed)}`);
    add(`Allies: ${optionLabel(ALLIES_OPTIONS, draft.allies)}`);
    add(`Origin secrets: ${draft.secrets === 'on' ? `ON — create 1–${ORIGIN_MAX_SECRETS} hidden secrets` : 'OFF — return "secrets": []'}`);
    add();
    add('── RACE ──');
    if (draft.race === 'custom') {
        add('Race: CUSTOM (fill "customRace"; the finished definition becomes Canon)');
        for (const field of CUSTOM_RACE_FIELDS) add(`  ${field.label}: ${fill(draft.customRace[field.id])}`);
        add(`  Living: ${draft.customRace.living === 'no' ? 'No' : 'Yes'}`);
    } else if (race) {
        add(`Race: ${race.label} — lifespan ${race.lifespan}; habitat: ${race.habitat}; NPCs notice: ${race.notice}`);
        if (race.id === 'silkborn') add(`Silkborn: ${SILKBORN_DESCRIPTION} This character is severed from the Weave.`);
    }
    if (draft.turned) {
        add(`TURNED: a living ${describeRace({ ...draft, turned: false })} who has since become a vampire. Feeding stance: ${optionLabel(FEEDING_STANCE, draft.feedingStance)}. Vampires in the current region: ${optionLabel(VAMPIRE_TREATMENT, draft.vampireTreatment)}.`);
    }
    add();
    add('── ORIGIN MODIFIERS (fixed) ──');
    for (const mod of getVisibleModifiers(draft)) {
        add(`${mod.label}: ${modifierLabel(draft.origin, mod.id, draft.modifiers[mod.id]) || '(none)'}`);
    }
    add();
    add('── ORIGIN BLANKS (ids in brackets; copy player text verbatim, fill the rest) ──');
    for (const blank of getVisibleBlanks(draft)) add(`[${blank.id}] ${blank.label}: ${fill(draft.blanks[blank.id])}`);
    if (origin.family) {
        const named = draft.family.filter(f => f.name || f.relation);
        if (named.length) {
            add('Family members (keep these and their fates):');
            for (const f of named) add(`  - ${f.name || '(AI: name)'} — ${f.relation || '(AI: relation)'} — fate: ${optionLabel(FAMILY_FATES, f.fate)}`);
        } else {
            add('Family members: (AI: create 1–4 named relatives who matter, each with a fate)');
        }
    }
    add();
    add(`── CORE NATION BLOCK${origin.nationThenNow ? ' — THEN (at slumber/death)' : ''} ──`);
    const gov = GOVERNMENTS.find(g => g.id === draft.nation.government);
    add(`Nation name: ${fill(draft.nation.name)}`);
    add(`Majority race: ${raceLabelById(draft.nation.majorityRace, draft)}`);
    add(`Government: ${gov ? `${gov.label} — ${gov.description}` : '(AI: fill)'}${draft.nation.divineBloodline ? ' The high priesthood follows a divine bloodline.' : ''}`);
    add(`Culture vibes: ${draft.nation.vibes.map(v => vibeText(v, draft.nation.deathSub)).join(' | ')}`);
    add(`Environment: ${str(draft.nation.environment) || `(AI: default to the majority race's habitat${getRace(draft.nation.majorityRace)?.habitat ? `: ${getRace(draft.nation.majorityRace).habitat}` : ''})`}`);
    add(`Slavery: ${optionLabel(SLAVERY_OPTIONS, draft.nation.slavery)}${draft.nation.slavery === 'ai' ? ' (you may leave it unrevealed, to be discovered later)' : ''}`);
    if (vampiresHoldPower(draft)) add(`Vampires hold power. Blood farms: ${draft.nation.bloodFarms === 'on' ? 'ON — record the substantial living population they require in "recordedFacts"' : 'off'}`);
    if (origin.nationThenNow) {
        add('NOW snapshot (the nation today):');
        add(`  Name: ${fill(draft.nation.now.name)}`);
        add(`  Government: ${fill(draft.nation.now.government)}`);
        add(`  Culture vibes: ${fill(draft.nation.now.vibes)}`);
    }
    add('Derive: how outsiders view the nation, and daily life / aesthetics / architecture.');
    add();
    add('── PURSUER BLOCKS ──');
    const plan = getPursuerPlan(draft);
    if (!plan.length) add('None — return "pursuers": [].');
    for (const p of plan) {
        const o = draft.pursuerOverrides[p.slot] || emptyPursuerOverride();
        add(`${p.slot.toUpperCase()}: ${p.label}${p.leverageRequired ? ' (leverage REQUIRED)' : ''}`);
        add(`  Identity: ${fill(o.identity)} | Affiliation: ${fill(o.affiliation)} | Motive: ${o.motive ? optionLabel(PURSUER_MOTIVES, o.motive) : '(AI: choose from capture, kill, reclaim something, silence, recruit back, replace, seize or reclaim leadership)'}`);
        add(`  Resources: ${fill(o.resources)} | Current awareness: ${o.awareness ? optionLabel(PURSUER_AWARENESS, o.awareness) : '(AI: choose)'} | Leverage: ${fill(o.leverage)}`);
    }
    add();
    add('── LEVERS (guaranteed; make them concrete) ──');
    for (const s of levers.social) add(`Social Recognition: ${s}`);
    for (const p of levers.personal) add(`Personal Pressure: ${p}`);
    if (rules.length) {
        add();
        add('── RUNTIME RULES (respect them in the profile) ──');
        for (const r of rules) add(`- ${r}`);
    }
    if (notes.length) {
        add();
        add('── AUTOMATIC ADJUSTMENTS ──');
        for (const n of notes) add(`- ${n}`);
    }
    if (draft.secrets === 'on') {
        add();
        add(`── SECRET CANDIDATES ──`);
        for (const c of origin.secretCandidates) add(`- ${c}`);
    }
    add();
    add('── PLAYER-WRITTEN CHARACTER DETAILS ──');
    add(`Appearance: ${fill(draft.appearance)}`);
    add(`Personality: ${fill(draft.personality)}`);
    add(`Talents and abilities: ${fill(draft.talents)}`);
    if (str(draft.additional)) add(`Additional: ${draft.additional}`);
    add(`Origin arc length: ${draft.questCount} personal quests (the campaign plans them later; write only the arc summary now).`);

    const system = str(opts.systemPrompt) || ORIGIN_ARCHITECT_SYSTEM_PROMPT;
    return { system, user: lines.join('\n') };
}

/** Pull the first balanced JSON object out of a model reply (handles fences and chatter). */
export function extractJsonObject(text) {
    const raw = String(text || '').replace(/```(?:json)?/gi, '');
    const start = raw.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(raw.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

const arr = (value) => (Array.isArray(value) ? value : []);
const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/**
 * Parse and normalize the Origin Architect reply. Player selections always win
 * over what the model wrote for the same field.
 * @throws {Error} when no usable JSON object is present
 */
export function parseOriginArchitectResponse(text, input) {
    const parsed = extractJsonObject(text);
    if (!parsed) throw new Error('The Origin Architect did not return valid JSON. Try again, or use a stronger Character Creation model.');
    const draft = normalizeOriginDraft(input || {});
    const identity = obj(parsed.identity);
    const nation = obj(parsed.nation);
    const pick = (playerValue, modelValue) => str(playerValue) || str(modelValue);

    const blanks = {};
    for (const blank of getVisibleBlanks(draft)) blanks[blank.id] = pick(draft.blanks[blank.id], obj(parsed.blanks)[blank.id]);

    const snapshot = (s) => (s && typeof s === 'object') ? {
        name: str(s.name), government: str(s.government),
        cultureVibes: arr(s.cultureVibes).map(str).filter(Boolean), summary: str(s.summary),
    } : null;

    const plan = getPursuerPlan(draft);
    const modelPursuers = arr(parsed.pursuers);
    const pursuers = plan.map((slot, i) => {
        const m = obj(modelPursuers.find(p => p?.slot === slot.slot) || modelPursuers[i]);
        const o = draft.pursuerOverrides[slot.slot] || emptyPursuerOverride();
        const awareness = pick(o.awareness, m.awareness);
        return {
            slot: slot.slot,
            role: slot.label,
            identity: pick(o.identity, m.identity) || slot.label,
            affiliation: pick(o.affiliation, m.affiliation),
            motive: o.motive ? optionLabel(PURSUER_MOTIVES, o.motive) : str(m.motive),
            resources: pick(o.resources, m.resources),
            awareness: PURSUER_AWARENESS.some(a => a.value === awareness) ? awareness : 'searching_cold',
            leverage: pick(o.leverage, m.leverage),
            plan: str(m.plan),
        };
    });

    let family = [];
    if (getOrigin(draft.origin)?.family) {
        const named = draft.family.filter(f => f.name || f.relation);
        const modelFamily = arr(parsed.family).map(f => ({
            name: str(f?.name), relation: str(f?.relation),
            fate: FAMILY_FATES.some(x => x.value === f?.fate) ? f.fate : 'unknown', note: str(f?.note),
        })).filter(f => f.name);
        family = named.length
            ? named.map((f, i) => ({
                name: f.name || modelFamily[i]?.name || '',
                relation: f.relation || modelFamily[i]?.relation || '',
                fate: f.fate,
                note: modelFamily.find(x => x.name && x.name === f.name)?.note || modelFamily[i]?.note || '',
            }))
            : modelFamily.slice(0, ORIGIN_MAX_FAMILY);
    }

    const socialLever = obj(parsed.socialLever);
    return {
        identity: {
            name: pick(draft.name, identity.name) || 'Unnamed',
            apparentAge: pick(draft.apparentAge, identity.apparentAge),
            trueAge: pick(draft.trueAge, identity.trueAge),
            genderPronouns: pick(draft.gender, identity.genderPronouns),
            title: pick(draft.blanks.title, identity.title),
        },
        blanks,
        family,
        nation: {
            name: pick(draft.nation.name, nation.name),
            majorityRace: raceLabelById(draft.nation.majorityRace, draft),
            government: GOVERNMENTS.find(g => g.id === draft.nation.government)?.label || str(nation.government),
            cultureVibes: draft.nation.vibes.map(v => {
                const vibe = CULTURE_VIBES.find(c => c.id === v);
                const sub = vibe?.subOptions?.find(s => s.value === draft.nation.deathSub);
                return sub ? `${vibe.label} (${sub.label})` : (vibe?.label || v);
            }),
            environment: pick(draft.nation.environment, nation.environment),
            slavery: draft.nation.slavery === 'ai' ? str(nation.slavery) || "AI's discretion" : optionLabel(SLAVERY_OPTIONS, draft.nation.slavery),
            bloodFarms: draft.nation.bloodFarms === 'on',
            outsiderView: str(nation.outsiderView),
            dailyLife: str(nation.dailyLife),
            recordedFacts: arr(nation.recordedFacts).map(str).filter(Boolean),
            then: hasThenNow(draft) ? snapshot(nation.then) : null,
            now: hasThenNow(draft) ? snapshot(nation.now) : null,
        },
        customRace: draft.race === 'custom' ? {
            ...Object.fromEntries(CUSTOM_RACE_FIELDS.map(f => [f.id, pick(draft.customRace[f.id], obj(parsed.customRace)[f.id])])),
            living: draft.customRace.living !== 'no',
        } : null,
        currentLocation: pick(draft.currentLocation, parsed.currentLocation),
        timeElapsed: TIME_ELAPSED_LABELS[draft.origin] ? pick(draft.timeElapsed, parsed.timeElapsed) : '',
        backstory: str(parsed.backstory),
        appearance: str(parsed.appearance) || str(draft.appearance),
        personality: str(parsed.personality) || str(draft.personality),
        voice: str(parsed.voice),
        talents: str(parsed.talents) || str(draft.talents),
        socialLever: {
            description: str(socialLever.description),
            whoRecognizes: str(socialLever.whoRecognizes),
            typicalReaction: str(socialLever.typicalReaction),
        },
        personalLevers: arr(parsed.personalLevers).map(l => ({
            name: str(l?.name), description: str(l?.description),
            severity: ['minor', 'moderate', 'severe'].includes(l?.severity) ? l.severity : 'moderate',
            currentPressure: str(l?.currentPressure),
        })).filter(l => l.name || l.description),
        pursuers,
        allies: {
            status: optionLabel(ALLIES_OPTIONS, draft.allies),
            named: draft.allies === 'abandoned' ? [] : arr(obj(parsed.allies).named).map(a => ({ name: str(a?.name), note: str(a?.note) })).filter(a => a.name),
        },
        currentGoal: str(parsed.currentGoal),
        originArc: { summary: str(obj(parsed.originArc).summary) || getOrigin(draft.origin).arc },
        worldThreatTieIn: str(parsed.worldThreatTieIn) || getOrigin(draft.origin).tieIn,
        secrets: draft.secrets === 'on'
            ? arr(parsed.secrets).map(s => ({ secret: str(s?.secret ?? s), seedIdeas: arr(s?.seedIdeas).map(str).filter(Boolean) }))
                .filter(s => s.secret).slice(0, ORIGIN_MAX_SECRETS)
            : [],
        openingSituation: str(parsed.openingSituation),
    };
}

// ── Record and downstream outputs ─────────────────────────────────────────

/**
 * The per-chat Origin record stored in chatStates[chatId].origin. It is the
 * §15 input for the campaign Ledger: levers become clocks, pursuers become
 * factions, the recognition rule becomes an NPC reaction rule.
 */
export function buildOriginRecord(input, profile, now = Date.now()) {
    const draft = normalizeOriginDraft(input);
    const origin = getOrigin(draft.origin);
    const levers = computeLevers(draft);
    return {
        version: ORIGIN_RECORD_VERSION,
        createdAt: now,
        originId: draft.origin,
        originLabel: origin?.label || draft.origin,
        race: describeRace(draft),
        raceId: draft.race,
        turned: !!draft.turned,
        selections: draft,
        profile,
        levers,
        runtimeRules: computeRuntimeRules(draft),
        questCount: draft.questCount,
        // Phase 2 (campaign system) reads these; the quests themselves are planned there.
        arc: { questCount: draft.questCount, quests: [] },
    };
}

const bullet = (items) => items.filter(Boolean).map(i => `- ${i}`).join('\n');

/**
 * Compact narrator block injected every turn next to [PLAYER_CHARACTER].
 * Hidden-tier content (pursuer plans, secrets) is labeled for the narrator only.
 */
export function buildOriginInjectionBlock(record) {
    if (!record?.profile) return '';
    const p = record.profile;
    const lines = [];
    lines.push('[ORIGIN]');
    lines.push(`Origin: ${record.originLabel}${p.identity?.title ? ` — ${p.identity.title}` : ''} | Race: ${record.race}`);
    const nation = p.nation || {};
    const nationBits = [nation.government, (nation.cultureVibes || []).join(', ')].filter(Boolean).join('; ');
    if (nation.name) lines.push(`Origin nation: ${nation.name}${nationBits ? ` (${nationBits})` : ''}${nation.outsiderView ? ` — outsiders see it as: ${nation.outsiderView}` : ''}`);
    if (nation.now?.name) lines.push(`That nation today: ${nation.now.name}${nation.now.summary ? ` — ${nation.now.summary}` : ''}`);
    if (p.currentGoal) lines.push(`Current goal: ${p.currentGoal}`);

    const recognition = [p.socialLever?.description, p.socialLever?.whoRecognizes && `recognized by ${p.socialLever.whoRecognizes}`, p.socialLever?.typicalReaction && `typical reaction: ${p.socialLever.typicalReaction}`].filter(Boolean).join('; ');
    lines.push(`Recognition: ${recognition || (record.levers?.social || []).join(' ')}`);
    const pressure = (p.personalLevers || []).length
        ? p.personalLevers.map(l => `${l.name || 'Pressure'} (${l.severity})${l.currentPressure ? `: ${l.currentPressure}` : l.description ? `: ${l.description}` : ''}`)
        : (record.levers?.personal || []);
    lines.push('Pressure levers (keep them felt; they force decisions over time):');
    lines.push(bullet(pressure));

    if ((p.pursuers || []).length) {
        lines.push('Pursuers (persistent; they act on their own plans off-screen and surface through rumors, agents and evidence):');
        lines.push(bullet(p.pursuers.map(x => `${x.identity} — ${x.role}; motive: ${x.motive || 'unknown'}; awareness: ${(PURSUER_AWARENESS.find(a => a.value === x.awareness)?.label || x.awareness)}${x.leverage ? `; leverage: ${x.leverage}` : ''}${x.plan ? `; plan (hidden): ${x.plan}` : ''}`)));
    }
    if ((record.runtimeRules || []).length) {
        lines.push('Runtime rules:');
        lines.push(bullet(record.runtimeRules));
    }
    lines.push(`Origin arc: ${p.originArc?.summary || ''}`.trim());
    if ((p.secrets || []).length) {
        lines.push('HIDDEN — origin secrets. The character does not know these. Never state, confirm or hint at them outright; plant only subtle, deniable seeds until play reveals them:');
        lines.push(bullet(p.secrets.map(s => s.secret)));
    }
    lines.push('[/ORIGIN]');
    return `${lines.filter(Boolean).join('\n')}\n\n`;
}

/** Map the finished profile onto the Character Creator's sheet prompt fields (Q9/Q11). */
export function buildOriginCharacterSheetHints(record) {
    const draft = record.selections;
    const p = record.profile;
    const originLine = `${record.originLabel}${p.identity.title ? ` (${p.identity.title})` : ''}`;
    const nationLine = p.nation?.name ? ` from ${p.nation.name}` : '';
    return {
        nameVal: p.identity.name,
        genderVal: p.identity.genderPronouns,
        ageVal: [p.identity.apparentAge, p.identity.trueAge && p.identity.trueAge !== p.identity.apparentAge ? `true age ${p.identity.trueAge}` : ''].filter(Boolean).join(', '),
        orientationVal: str(draft.orientation),
        speciesVal: record.race,
        traitsVal: p.personality,
        abilitiesVal: p.talents,
        backgroundVal: `${originLine}${nationLine}. ${p.backstory}`.slice(0, 2400),
        appearanceVal: p.appearance,
        additionalVal: [
            str(draft.additional),
            `Current location: ${p.currentLocation}.`,
            p.currentGoal ? `Current goal: ${p.currentGoal}.` : '',
            'Origin-bound items and marks belong in the character sheet; do not invent a [QUESTS] or [PARTY] block.',
        ].filter(Boolean).join(' '),
        classRaw: draft.className || '__story__',
        classOtherVal: str(draft.classOther),
        level: draft.level === 'none' || draft.level === null ? null : (Number.parseInt(draft.level, 10) || 1),
        gearTier: draft.gearTier || 'auto',
    };
}

/** Player-facing profile summary for the Player Card generator. Never includes secrets or hidden plans. */
export function buildOriginPlayerCardHints(record) {
    const p = record.profile;
    const nation = p.nation || {};
    const parts = [
        '\n\n--- ORIGIN PROFILE (use it; keep every fact consistent) ---',
        `Origin: ${record.originLabel}${p.identity.title ? ` — ${p.identity.title}` : ''}`,
        `Race: ${record.race}`,
        nation.name ? `Origin nation: ${nation.name} (${[nation.government, (nation.cultureVibes || []).join(', ')].filter(Boolean).join('; ')})` : '',
        `Current location: ${p.currentLocation}`,
        `Backstory: ${p.backstory}`,
        `Appearance (body and origin-bound items): ${p.appearance}`,
        p.personality ? `Personality: ${p.personality}` : '',
        p.voice ? `Voice: ${p.voice}` : '',
        p.socialLever?.description ? `How others recognize them: ${p.socialLever.description}` : '',
        (p.personalLevers || []).length ? `Pressures they live with: ${p.personalLevers.map(l => l.name || l.description).join('; ')}` : '',
        p.currentGoal ? `Current goal: ${p.currentGoal}` : '',
        'Do not reveal pursuers\' hidden plans or anything the character does not know.',
    ];
    return parts.filter(Boolean).join('\n');
}

/** Opening user message (like Instant Action's) grounding the narrator in the origin's first scene. */
export function buildOriginOpeningMessage(record) {
    const p = record.profile;
    const situation = str(p.openingSituation) || `${p.identity.name} arrives at ${p.currentLocation || 'the starting location'}.`;
    return `Begin the adventure.\n\nOpening situation (${record.originLabel}): ${situation}`;
}

/**
 * Plain-text summary for the /origin view. Secrets appear only when revealSecrets
 * is true (debug mode, Q6); otherwise their count is shown.
 */
export function formatOriginSummary(record, { revealSecrets = false } = {}) {
    if (!record?.profile) return 'No origin recorded for this chat.';
    const p = record.profile;
    const out = [];
    out.push(`${p.identity.name} — ${record.originLabel}${p.identity.title ? ` (${p.identity.title})` : ''}`);
    out.push(`Race: ${record.race}`);
    if (p.identity.apparentAge) out.push(`Age: ${p.identity.apparentAge}${p.identity.trueAge && p.identity.trueAge !== p.identity.apparentAge ? ` (true age ${p.identity.trueAge})` : ''}`);
    if (p.nation?.name) out.push(`Origin nation: ${p.nation.name} — ${[p.nation.government, (p.nation.cultureVibes || []).join(', ')].filter(Boolean).join('; ')}`);
    if (p.nation?.now?.name) out.push(`Now: ${p.nation.now.name}${p.nation.now.summary ? ` — ${p.nation.now.summary}` : ''}`);
    if (p.currentLocation) out.push(`Current location: ${p.currentLocation}`);
    if (p.currentGoal) out.push(`Current goal: ${p.currentGoal}`);
    out.push('');
    out.push(`Recognition: ${p.socialLever?.description || (record.levers?.social || []).join(' ')}`);
    out.push('Pressures:');
    for (const l of (p.personalLevers || []).length ? p.personalLevers.map(x => `${x.name} (${x.severity})`) : record.levers.personal) out.push(`  • ${l}`);
    if ((p.pursuers || []).length) {
        out.push('Pursuers:');
        for (const x of p.pursuers) out.push(`  • ${x.identity} — ${x.role}${revealSecrets && x.plan ? ` [plan: ${x.plan}]` : ''}`);
    }
    if ((p.family || []).length) {
        out.push('Family:');
        for (const f of p.family) out.push(`  • ${f.name} (${f.relation}) — ${optionLabel(FAMILY_FATES, f.fate)}`);
    }
    out.push(`Allies: ${p.allies?.status || ''}${(p.allies?.named || []).length ? ` — ${p.allies.named.map(a => a.name).join(', ')}` : ''}`);
    out.push(`Origin arc (${record.questCount} quests): ${p.originArc?.summary || ''}`);
    out.push('');
    const secrets = p.secrets || [];
    if (!secrets.length) out.push('Origin secrets: none');
    else if (revealSecrets) {
        out.push('Origin secrets (DEBUG — spoilers):');
        for (const s of secrets) out.push(`  • ${s.secret}`);
    } else {
        out.push(`Origin secrets: ${secrets.length} hidden (revealed only through play; turn on Debug Mode to peek).`);
    }
    return out.join('\n');
}

/** Option lists re-exported for the wizard UI. */
export const ORIGIN_OPTION_LISTS = {
    ALLIES_OPTIONS, SLAVERY_OPTIONS, FEEDING_STANCE, VAMPIRE_TREATMENT,
    PURSUER_MOTIVES, PURSUER_AWARENESS, FAMILY_FATES,
};
export { ORIGIN_IDS };
