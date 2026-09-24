import { describe, it, expect } from 'vitest';
import {
    createEmptyLedger, buildLedgerFromSkeleton, importOriginIntoLedger, applyLedgerOps,
    checkShiftPrerequisites, computeRhythm, normalizeBrief, parseOocOverrides, applyOverridesToBrief,
    formatPulse, buildLedgerDigest, buildCampaignNarratorBlock, tempoPacingMode, advanceAct,
    resolveLedgerForChat,
} from '../src/features/campaign/campaign-ledger.js';

const SKELETON = {
    visible: { premise: 'A drowned kingdom stirs.', tone: 'BG3 but grimmer', startingSituation: 'Harrowgate docks', companions: [{ name: 'Ilse', surface: 'Wry smuggler' }] },
    anchors: { centralQuestion: 'Who drowned Aurel?', campaignThreat: 'The Tide Choir', threatLayers: ['cult', 'god', 'the player\'s bloodline'] },
    acts: [
        { act: 1, name: 'Salt', pillar: 'The flooded abbey', faceAntagonist: 'Abbess Morrow', hub: 'The Gull Inn', seedsNeeded: ['s1'] },
        { act: 2, summary: 'Descent into the Choir' },
        { act: 3, summary: 'The city of bells' },
        { act: 4, summary: 'The last tide' },
    ],
    ambiguousAlly: { name: 'Ilse', surface: 'smuggler', hiddenGoal: 'Serves the Choir' },
    clocks: [{ key: 'k1', owner: 'Tide Choir', segments: 6, ticksOn: 'Each new moon', onFill: { size: 'Turn', polarity: 'negative', text: 'The abbey floods' } }],
    arcs: [{ key: 'a1', name: 'The flooded abbey', type: 'Main', status: 'Known', clock: 'k1', questTitle: 'Drain the Abbey' }],
    seeds: [{ key: 's1', planted: 'Salt crust on the abbess\'s rings', intendedPayoff: 'She is a Choir priest', size: 'Turn', arc: 'a1' }],
    companions: [{ name: 'Ilse', surface: 'Wry smuggler', secret: 'Choir informant', crisisAct: 2, arc: 'a1' }],
    npcs: [{ name: 'Abbess Morrow', agenda: 'Flood the lowlands', attitude: 'polite' }],
    locations: [{ name: 'Gull Inn', surface: 'Loud', secret: 'Smuggler tunnel', thread: 'Tunnel leads to the abbey' }],
};

const ORIGIN = {
    originLabel: 'Oathbreaker Knight',
    questCount: 7,
    levers: { social: ['x'], personal: ['y'] },
    profile: {
        identity: { name: 'Seren Vale' },
        socialLever: { description: 'Blackened plate', whoRecognizes: 'Tyrr faithful', typicalReaction: 'Scorn' },
        personalLevers: [{ name: 'Armor-lock', description: 'Cannot remove armor', severity: 'severe', currentPressure: 'Sores' }],
        pursuers: [{ identity: 'Inquisitor Maelis', motive: 'kill', awareness: 'closing_in', plan: 'Ambush at the ford', leverage: 'her brother' }],
        originArc: { summary: 'Break or accept the curse' },
        secrets: [{ secret: 'Tyrr engineered the breaking', seedIdeas: ['a gilded sigil'] }],
        nation: { name: 'Aurelmark', government: 'Absolute monarchy', cultureVibes: ['Wealth-focused'], recordedFacts: ['Debt-bondage exists'] },
        worldThreatTieIn: 'The order serves the Choir',
    },
};

const ledger0 = () => buildLedgerFromSkeleton(SKELETON, { intake: { dice: 'auto', originQuests: 7 } });

describe('building the Ledger (§12.1)', () => {
    it('assigns ids and remaps skeleton keys', () => {
        const l = ledger0();
        expect(l.clocks[0].id).toBe('C01');
        expect(l.arcs[0].clock).toBe('C01');
        expect(l.seeds[0].arc).toBe('A01');
        expect(l.acts[0].seedsNeeded).toEqual(['S01']);
        expect(l.companions[0]).toMatchObject({ name: 'Ilse', arc: 'A01', planned: true });
        expect(l.acts.map(a => a.detail)).toEqual(['full', 'outline', 'silhouette', 'silhouette']);
        expect(l.brief.actStage).toBe('Arrival');
    });

    it('imports an origin per §15', () => {
        const l = buildLedgerFromSkeleton(SKELETON, { origin: ORIGIN });
        const lever = l.clocks.find(c => c.id === l.character.leverClocks[0]);
        expect(lever.onFill.size).toBe('Upheaval'); // severe
        const pursuer = l.clocks.find(c => c.id === l.character.pursuerClocks[0]);
        expect(pursuer).toMatchObject({ segments: 8, filled: 5, known: false }); // closing in
        expect(l.arcs.some(a => a.type === 'Faction' && a.clock === pursuer.id)).toBe(true);
        const originArc = l.arcs.find(a => a.type === 'Origin');
        expect(originArc.questCount).toBe(7);
        expect(l.character.recognitionRules[0]).toMatch(/Blackened plate; recognized by Tyrr faithful/);
        expect(l.character.originSecrets).toEqual(['Tyrr engineered the breaking']);
        expect(l.seeds.find(s => s.status === 'idea').size).toBe('Upheaval');
        expect(l.canon.join(' ')).toMatch(/Aurelmark/);
        expect(l.canon).toContain('Debt-bondage exists');
    });
});

describe('Seed → Sign → Shift (§6.2)', () => {
    it('Ripple needs one seed; Turn needs a seed 2+ scenes old plus a sign', () => {
        let l = ledger0();
        expect(checkShiftPrerequisites(l, 'Ripple', []).ok).toBe(false);
        expect(checkShiftPrerequisites(l, 'Ripple', ['S01']).ok).toBe(true);
        expect(checkShiftPrerequisites(l, 'Turn', ['S01']).reason).toMatch(/2 scenes/);
        l = applyLedgerOps(l, [{ op: 'scene', boundary: true, tension: 2 }, { op: 'scene', boundary: true, tension: 2 }]).ledger;
        expect(checkShiftPrerequisites(l, 'Turn', ['S01']).reason).toMatch(/Sign/);
        l = applyLedgerOps(l, [{ op: 'sign', seed: 'S01', text: 'She flinches at holy water' }]).ledger;
        expect(checkShiftPrerequisites(l, 'Turn', ['S01']).ok).toBe(true);
    });

    it('Upheaval needs 3 seeds across 2 chapters and a sign', () => {
        let l = ledger0();
        l = applyLedgerOps(l, [{ op: 'seed', planted: 'a', size: 'Upheaval' }, { op: 'seed', planted: 'b', size: 'Upheaval' }]).ledger;
        expect(checkShiftPrerequisites(l, 'Upheaval', ['S01', 'S02', 'S03']).reason).toMatch(/2 different chapters/);
        l.campaign.chapterCount = 1;
        l = applyLedgerOps(l, [{ op: 'seed', planted: 'c' }, { op: 'sign', seed: 'S04', text: 'x' }]).ledger;
        expect(checkShiftPrerequisites(l, 'Upheaval', ['S01', 'S02', 'S04']).ok).toBe(true);
    });

    it('an unseeded shift is still logged, but flagged with a changelog entry', () => {
        const { ledger, warnings } = applyLedgerOps(ledger0(), [{ op: 'shift', size: 'Turn', polarity: 'negative', text: 'The inn burns', seeds: [] }]);
        expect(ledger.shifts[0].unseeded).toBe(true);
        expect(warnings.join(' ')).toMatch(/unseeded/);
        expect(ledger.changelog.at(-1)).toMatch(/unseeded Turn/);
    });

    it('a Turn on an arc ends the chapter and pays off its seeds', () => {
        let l = ledger0();
        l = applyLedgerOps(l, [{ op: 'scene', boundary: true, tension: 2 }, { op: 'scene', boundary: true, tension: 3 }, { op: 'sign', seed: 'S01', text: 'x' }]).ledger;
        const r = applyLedgerOps(l, [{ op: 'shift', size: 'Turn', polarity: 'negative', text: 'The abbess is unmasked', seeds: ['S01'], arc: 'A01' }]);
        expect(r.events.chapterEnded).toBe(true);
        expect(r.ledger.arcs[0].chapter).toBe(2);
        expect(r.ledger.seeds[0].status).toBe('paid');
        expect(r.ledger.campaign.negativeTurnStreak).toBe(1);
    });
});

describe('clocks (§9)', () => {
    it('bounds ticks and fills the clock', () => {
        const { ledger, events } = applyLedgerOps(ledger0(), [{ op: 'tick', clock: 'C01', by: 9 }]);
        expect(ledger.clocks[0].filled).toBe(6);
        expect(ledger.clocks[0].status).toBe('filled');
        expect(events.filled[0].onFill.text).toBe('The abbey floods');
        const again = applyLedgerOps(ledger, [{ op: 'tick', clock: 'C01' }]);
        expect(again.warnings.join(' ')).toMatch(/filled; tick ignored/);
    });

    it('minimum movement ticks one clock at a scene boundary with no ticks', () => {
        const { ledger, warnings } = applyLedgerOps(ledger0(), [{ op: 'scene', boundary: true, tension: 2 }]);
        expect(ledger.clocks[0].filled).toBe(1);
        expect(warnings.join(' ')).toMatch(/minimum movement/);
        const noBoundary = applyLedgerOps(ledger0(), [{ op: 'scene', boundary: false, tension: 2 }]);
        expect(noBoundary.ledger.clocks[0].filled).toBe(0);
    });

    it('resolving a full clock via a shift marks it resolved', () => {
        let l = applyLedgerOps(ledger0(), [{ op: 'tick', clock: 'C01', by: 6 }]).ledger;
        l = applyLedgerOps(l, [{ op: 'shift', size: 'Turn', polarity: 'negative', text: 'The abbey floods', clock: 'C01' }]).ledger;
        expect(l.clocks[0].status).toBe('resolved');
        expect(l.shifts[0].unseeded).toBeUndefined();
    });

    it('rejects unknown ops and ids without losing the rest', () => {
        const { ledger, warnings, applied } = applyLedgerOps(ledger0(), [{ op: 'bogus' }, { op: 'tick', clock: 'C99' }, { op: 'canon', fact: 'The inn has a tunnel.' }]);
        expect(warnings).toHaveLength(2);
        expect(applied).toHaveLength(1);
        expect(ledger.canon).toContain('The inn has a tunnel.');
    });
});

describe('Canon (§12.3)', () => {
    it('is append-only and deduplicated; revisions cannot touch it', () => {
        let r = applyLedgerOps(ledger0(), [{ op: 'canon', fact: 'Ilse has a scar.' }, { op: 'canon', fact: 'ilse has a scar.' }]);
        expect(r.ledger.canon.filter(c => /scar/.test(c))).toHaveLength(1);
        r = applyLedgerOps(r.ledger, [{ op: 'revise', target: 'Ilse has a scar', change: 'no scar' }]);
        expect(r.warnings.join(' ')).toMatch(/Canon never changes/);
        r = applyLedgerOps(r.ledger, [{ op: 'revise', target: 'act 2 pillar', change: 'The drowned cathedral', why: 'player burned the abbey', act: 2, field: 'pillar' }]);
        expect(r.ledger.acts[1].pillar).toBe('The drowned cathedral');
        expect(r.ledger.changelog.at(-1)).toMatch(/player burned the abbey/);
    });
});

describe('rhythm (§5.3) and the Brief', () => {
    const withHistory = (h, extra = {}) => {
        const l = ledger0();
        l.campaign.tensionHistory = h;
        Object.assign(l.campaign, extra);
        return l;
    };

    it('contrast: three high scenes force a drop', () => {
        const l = withHistory([4, 4, 4], { act: 2 });
        const r = computeRhythm(l);
        expect(r.forceMaxTension).toBe(3);
        expect(normalizeBrief({ tension: 4 }, l).tension).toBe(3);
    });

    it('contrast does not apply to Act 4\'s final sequence', () => {
        expect(computeRhythm(withHistory([5, 5, 5], { act: 4, actStage: 'Pillar' })).forceMaxTension).toBeNull();
    });

    it('anti-flatness and polarity balance produce hints', () => {
        const r = computeRhythm(withHistory([2, 2, 2, 2], { negativeTurnStreak: 3 }));
        expect(r.forceChange).toBe(true);
        expect(r.hints.join(' ')).toMatch(/ANTI-FLATNESS/);
        expect(r.hints.join(' ')).toMatch(/POLARITY BALANCE/);
    });

    it('clamps tension to the act range, allowing the Pillar peak', () => {
        const l = ledger0();
        expect(normalizeBrief({ tension: 5 }, l).tension).toBe(3);
        expect(normalizeBrief({ tension: 5, actStage: 'Pillar' }, l).tension).toBe(4);
        expect(normalizeBrief({ tension: 1 }, withHistory([], { act: 4 })).tension).toBe(4);
    });

    it('holds back a payoff that fails §6.2 and shows a Sign instead', () => {
        const b = normalizeBrief({ show: 'Wet footprints', payOff: { size: 'Turn', text: 'The abbess is unmasked', seeds: ['S01'] } }, ledger0());
        expect(b.payOff).toBeNull();
        expect(b.show).toBe('Wet footprints Also: A Sign pointing toward: The abbess is unmasked');
        expect(b.notes[0]).toMatch(/held back/);
    });

    it('telegraph and resolve hints for clocks', () => {
        let l = applyLedgerOps(ledger0(), [{ op: 'tick', clock: 'C01', by: 3 }]).ledger;
        expect(computeRhythm(l).hints.join(' ')).toMatch(/TELEGRAPH: C01/);
        l = applyLedgerOps(l, [{ op: 'tick', clock: 'C01', by: 3 }]).ledger;
        expect(computeRhythm(l).hints.join(' ')).toMatch(/RESOLVE: C01/);
    });

    it('staleness after 15 scenes without a Turn', () => {
        const l = ledger0();
        l.arcs[0].scenesSinceTurn = 15;
        expect(computeRhythm(l).hints.join(' ')).toMatch(/STALENESS: A01/);
    });
});

describe('OOC overrides (§5.4)', () => {
    it('parses and applies tempo and rest', () => {
        expect(parseOocOverrides('I sit. (( linger )) ((REST))')).toEqual({ tempo: 'Linger', rest: true });
        const b = applyOverridesToBrief(normalizeBrief({ tension: 3, tempo: 'Flow' }, ledger0()), { tempo: 'Rush', rest: false });
        expect(b.tempo).toBe('Rush');
        expect(tempoPacingMode(b)).toBe('shorter_outputs');
        const rest = applyOverridesToBrief(normalizeBrief({ tension: 3 }, ledger0()), { tempo: null, rest: true });
        expect(rest).toMatchObject({ rest: true, tension: 2, tempo: 'Linger' });
        expect(tempoPacingMode(rest)).toBe('downtime');
    });
});

describe('narrator block, pulse, digest', () => {
    it('the narrator block carries rules, the brief and quest surfacing, never ids', () => {
        const l = ledger0();
        l.brief = normalizeBrief({ tension: 2, tempo: 'Linger', plant: 'Salt on the rings', endOn: 'Whether to follow the abbess', keepHidden: ['The abbess serves the Choir'] }, l);
        const block = buildCampaignNarratorBlock(l, l.brief);
        expect(block).toMatch(/^\[CAMPAIGN\]/);
        expect(block).toMatch(/LINGER/);
        expect(block).toMatch(/Plant \(quietly/);
        expect(block).toMatch(/Emergent Quest Active: Drain the Abbey/);
        expect(block).toMatch(/Keep hidden: The abbess serves the Choir/);
        expect(block).toMatch(/fails forward/);
    });

    it('physical dice mode asks the player to roll', () => {
        const l = buildLedgerFromSkeleton(SKELETON, { intake: { dice: 'physical' } });
        expect(buildCampaignNarratorBlock(l, l.brief)).toMatch(/\(\( Roll a d20 — DC n/);
    });

    it('formats the Pulse from applied events', () => {
        const l = ledger0();
        const r = applyLedgerOps(l, [{ op: 'scene', boundary: true, tension: 3 }, { op: 'tick', clock: 'C01', by: 2 }, { op: 'seed', planted: 'x' }]);
        const pulse = formatPulse(r.ledger, r.events, { tempo: 'Flow', check: '' }, 2);
        expect(pulse).toBe('<!-- PULSE | T2→3 | Flow | Act1·Arrival | ticks: C01 2/6 | seed+: S02 | sign: none | shift: none | check: none -->');
    });

    it('the digest drops paid seeds and resolved clocks and caps Canon', () => {
        const l = ledger0();
        l.canon = Array.from({ length: 60 }, (_, i) => `fact ${i}`);
        l.seeds[0].status = 'paid';
        const d = buildLedgerDigest(l);
        expect(d.seeds).toHaveLength(0);
        expect(d.canon).toHaveLength(40);
        expect(d.canon.at(-1)).toBe('fact 59');
    });
});

describe('act transitions (§13)', () => {
    it('act_exit flags the point of no return; advanceAct resolves dormant arcs and opens the Interlude', () => {
        let l = ledger0();
        l = applyLedgerOps(l, [{ op: 'arc_add', arc: { name: 'Smuggler feud', type: 'Local', status: 'Dormant' } }, { op: 'act_exit', reason: 'The gate closes' }]).ledger;
        expect(l.campaign.actStage).toBe('Exit');
        expect(buildCampaignNarratorBlock(l, normalizeBrief({}, l))).toMatch(/This ends Act 1/);
        const next = advanceAct(l, { dormantOutcomes: { A02: 'The smugglers took the docks' } });
        expect(next.campaign).toMatchObject({ act: 2, actStage: 'Interlude' });
        expect(next.arcs.find(a => a.id === 'A02').status).toBe('Resolved');
        expect(next.pending.worldDirectives[0]).toMatch(/smugglers took the docks/);
        expect(next.acts[1].detail).toBe('full');
        expect(next.acts[2].detail).toBe('outline');
        expect(next.brief).toMatchObject({ rest: true, actStage: 'Interlude' });
        expect(next.pending.actExit).toBeNull();
    });
});

describe('companions (§11)', () => {
    it('an unplanned companion gets a Companion arc on joining', () => {
        const { ledger } = applyLedgerOps(ledger0(), [{ op: 'companion', name: 'Bram', surface: 'Grumpy dwarf', secret: 'Owes the Choir', crisisAct: 3, joined: true }]);
        const bram = ledger.companions.find(c => c.name === 'Bram');
        expect(bram.planned).toBe(false);
        expect(ledger.arcs.find(a => a.id === bram.arc).type).toBe('Companion');
    });
});

describe('swipe rollback', () => {
    it('resolves the ledger from the latest message snapshot for its selected swipe', () => {
        const A = { tag: 'A' }; const B = { tag: 'B' }; const base = { tag: 'base' };
        const chat = [
            { is_user: false, swipe_id: 0, extra: { rpgCampaign: { base: { tag: 'old' }, swipes: { 0: { after: A } } } } },
            { is_user: true, extra: {} },
            { is_user: false, swipe_id: 1, extra: { rpgCampaign: { base, swipes: { 0: { after: B } } } } },
        ];
        expect(resolveLedgerForChat(chat).ledger).toBe(base); // swipe 1 not chronicled yet
        chat[2].swipe_id = 0;
        expect(resolveLedgerForChat(chat).ledger).toBe(B);
        expect(resolveLedgerForChat(chat.slice(0, 2)).ledger).toBe(A);
        expect(resolveLedgerForChat([], 'fb').ledger).toBe('fb');
    });
});

describe('empty ledger', () => {
    it('has sane defaults', () => {
        const l = createEmptyLedger();
        expect(l.campaign).toMatchObject({ act: 1, actStage: 'Arrival', sceneCount: 0 });
        expect(importOriginIntoLedger(l, null)).toBe(l);
    });
});

describe('filled clocks in the Brief (§17.1)', () => {
    it('adds a resolution for every full clock the Director forgot', () => {
        const l = applyLedgerOps(ledger0(), [{ op: 'tick', clock: 'C01', by: 6 }]).ledger;
        expect(normalizeBrief({ offscreen: '' }, l).offscreen).toMatch(/Tide Choir's clock \(C01\) is full — Turn \(negative\): The abbey floods/);
        expect(normalizeBrief({ offscreen: 'The Tide Choir floods the abbey (C01).' }, l).offscreen).toBe('The Tide Choir floods the abbey (C01).');
    });
});

describe('snapshot pruning', () => {
    it('keeps the newest snapshots and stops rollback at a pruned marker', async () => {
        const { pruneLedgerSnapshots } = await import('../src/features/campaign/campaign-ledger.js');
        const chat = Array.from({ length: 5 }, (_, i) => ({ is_user: false, swipe_id: 0, extra: { rpgCampaign: { base: { n: i }, swipes: { 0: { after: { n: i } } } } } }));
        expect(pruneLedgerSnapshots(chat, 2)).toBe(3);
        expect(chat[0].extra.rpgCampaign).toEqual({ pruned: true });
        expect(resolveLedgerForChat(chat).ledger).toEqual({ n: 4 });
        expect(resolveLedgerForChat(chat.slice(0, 3)).source).toBe('pruned');
    });
});
