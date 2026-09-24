// ─────────────────────────────────────────────────────────────────────────
// Campaign Structure — the Ledger and the rules code enforces on it.
// (Campaign Structure Specification §2–§16.)
//
// The Ledger is structured JSON owned by code. Agents never rewrite it
// wholesale on ordinary turns: the Chronicler returns a list of operations,
// and applyLedgerOps() validates and applies them. That is where the spec's
// hard rules live, so a model that forgets them cannot break the campaign:
//   • clocks stay within their segments; a full clock must be resolved (§9)
//   • Seed → Sign → Shift prerequisites per Shift size (§6.2)
//   • Canon is append-only; revisions of Mutable facts go to the changelog (§12.3)
//   • rhythm: contrast, anti-flatness, single peak, polarity balance (§5.3, §6.1)
//   • act tension ranges and default tempo (§4.2)
//   • minimum movement: at least one clock ticks per scene boundary (§9.2)
//   • telegraph: a clock half full has produced a Sign (§9.3)
// Pure module: no DOM, no settings, no LLM.
// ─────────────────────────────────────────────────────────────────────────

export const LEDGER_VERSION = 1;

export const ACT_STAGES = ['Arrival', 'Hub', 'Spread', 'Orbit', 'Echo', 'Convergence', 'Pillar', 'Exit', 'Interlude'];
export const TEMPOS = ['Rush', 'Flow', 'Linger'];
export const SHIFT_SIZES = ['Ripple', 'Turn', 'Upheaval'];
export const ARC_TYPES = ['Main', 'Local', 'Companion', 'Origin', 'Faction'];
export const ARC_STATUSES = ['Dormant', 'Known', 'Active', 'Resolved', 'Lost'];
export const CLOCK_SIZES = [4, 6, 8];

/** §4.2 — tension range, default tempo and the job of each act. */
export const ACT_PROFILES = {
    1: { name: 'Discovery', range: [1, 3], pillarPeak: 4, tempo: 'Flow', job: 'Let the player discover who they are, recruit companions, and learn the world\'s rules. Many new threads.' },
    2: { name: 'Descent', range: [2, 4], pillarPeak: 5, tempo: 'Flow', job: 'Raise the stakes, test the player, deliver the midpoint reveal (a recontextualizing Upheaval). Some new threads.' },
    3: { name: 'Convergence', range: [2, 4], pillarPeak: 5, tempo: 'Flow', job: 'Pay off most arcs and companion crises; factions collide. Few new threads, many resolving.' },
    4: { name: 'Reckoning', range: [4, 5], pillarPeak: 5, tempo: 'Flow', job: 'Close threads; the campaign threat is faced. Closing only. Rush only for transit.' },
    epilogue: { name: 'Epilogue', range: [1, 2], pillarPeak: 2, tempo: 'Linger', job: 'Show consequences per arc and companion. No new threads.' },
};

export const STALENESS_SCENES = 15;
export const KNOWN_ARC_LIMIT = 5;
export const TENSION_HISTORY_LENGTH = 12;
export const CANON_DIGEST_LIMIT = 40;

const clone = (v) => JSON.parse(JSON.stringify(v));
const str = (v) => (v == null ? '' : String(v)).trim();
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const clampInt = (v, lo, hi, fallback) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
const pickEnum = (v, list, fallback) => {
    const s = str(v).toLowerCase();
    return list.find(x => x.toLowerCase() === s) ?? fallback;
};

export function actProfile(act) {
    return ACT_PROFILES[act] || ACT_PROFILES[1];
}

// ── Construction ──────────────────────────────────────────────────────────

export function createEmptyLedger(settings = {}) {
    return {
        version: LEDGER_VERSION,
        campaign: {
            act: 1,
            actStage: 'Arrival',
            inFictionDate: '',
            sceneCount: 0,
            chapterCount: 0,
            tensionHistory: [],
            negativeTurnStreak: 0,
            upheavalsThisAct: 0,
            turnIndex: 0,
            settings: {
                protagonistDeath: false,
                dice: 'auto',
                originSecrets: true,
                originQuests: 7,
                ...obj(settings),
            },
        },
        visible: { premise: '', tone: '', startingSituation: '', companions: [] },
        anchors: { centralQuestion: '', campaignThreat: '', threatLayers: [], layersRevealed: 0 },
        acts: [],
        arcs: [],
        clocks: [],
        seeds: [],
        shifts: [],
        npcs: [],
        companions: [],
        character: { recognitionRules: [], originSecrets: [], leverClocks: [], pursuerClocks: [] },
        world: { nations: [], customRaces: [], locations: [] },
        canon: [],
        changelog: [],
        pending: { worldDirectives: [], actExit: null },
        brief: null,
        counters: { arc: 0, clock: 0, seed: 0 },
    };
}

function nextId(ledger, kind) {
    const prefix = { arc: 'A', clock: 'C', seed: 'S' }[kind];
    ledger.counters[kind] = (ledger.counters[kind] || 0) + 1;
    return `${prefix}${String(ledger.counters[kind]).padStart(2, '0')}`;
}

function normalizeOnFill(v) {
    const o = obj(v);
    if (typeof v === 'string') return { size: 'Ripple', polarity: 'negative', text: str(v) };
    return {
        size: pickEnum(o.size, SHIFT_SIZES, 'Ripple'),
        polarity: pickEnum(o.polarity, ['positive', 'negative', 'mixed'], 'negative'),
        text: str(o.text),
    };
}

function makeClock(ledger, input) {
    const c = obj(input);
    const segments = CLOCK_SIZES.includes(Number(c.segments)) ? Number(c.segments) : 6;
    return {
        id: nextId(ledger, 'clock'),
        owner: str(c.owner) || 'Unknown',
        segments,
        filled: clampInt(c.filled, 0, segments, 0),
        ticksOn: str(c.ticksOn),
        onFill: normalizeOnFill(c.onFill),
        known: !!c.known,
        status: 'running',
        signed: !!c.signed,
        lastTickScene: 0,
    };
}

function makeArc(ledger, input) {
    const a = obj(input);
    return {
        id: nextId(ledger, 'arc'),
        name: str(a.name) || 'Untitled arc',
        type: pickEnum(a.type, ARC_TYPES, 'Local'),
        status: pickEnum(a.status, ARC_STATUSES, 'Dormant'),
        act: a.act === 'all' ? 'all' : clampInt(a.act, 1, 4, ledger.campaign.act),
        chapter: clampInt(a.chapter, 1, 99, 1),
        nextChapters: arr(a.nextChapters).map(str).filter(Boolean).slice(0, 10),
        tension: clampInt(a.tension, 1, 5, 2),
        clock: str(a.clock),
        hooks: arr(a.hooks).map(str).filter(Boolean).slice(0, 6),
        questTitle: str(a.questTitle),
        scenesSinceTurn: 0,
        surfaced: false,
    };
}

function makeSeed(ledger, input) {
    const s = obj(input);
    return {
        id: nextId(ledger, 'seed'),
        planted: str(s.planted || s.detail),
        intendedPayoff: str(s.intendedPayoff || s.payoff),
        size: pickEnum(s.size, SHIFT_SIZES, 'Ripple'),
        arc: str(s.arc),
        scene: ledger.campaign.sceneCount,
        chapter: ledger.campaign.chapterCount,
        signs: [],
        status: 'planted',
        retroactive: !!s.retroactive,
    };
}

function upsertByName(list, input, fields) {
    const name = str(input?.name);
    if (!name) return null;
    let row = list.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (!row) {
        row = { name };
        list.push(row);
    }
    for (const f of fields) if (input[f] !== undefined && input[f] !== null && str(input[f]) !== '') row[f] = typeof input[f] === 'boolean' ? input[f] : (Array.isArray(input[f]) ? input[f] : (typeof input[f] === 'number' ? input[f] : str(input[f])));
    return row;
}

const NPC_FIELDS = ['agenda', 'attitude', 'status', 'location', 'note'];
const COMPANION_FIELDS = ['surface', 'secret', 'crisisAct', 'arc', 'opinion', 'status', 'planned', 'joined'];
const LOCATION_FIELDS = ['surface', 'secret', 'thread', 'secretFound'];

/**
 * Build a Ledger from the Architect's session-zero skeleton (§12.1, §18),
 * then fold in the Origin record (§15). IDs are assigned by code; references
 * between skeleton items use the Architect's own keys and are remapped here.
 */
export function buildLedgerFromSkeleton(skeleton, { origin = null, intake = {} } = {}) {
    const sk = obj(skeleton);
    const questCount = clampInt(intake.originQuests ?? origin?.questCount, 5, 10, 7);
    const ledger = createEmptyLedger({
        protagonistDeath: !!intake.protagonistDeath,
        dice: intake.dice === 'physical' ? 'physical' : 'auto',
        originSecrets: intake.originSecrets !== false,
        originQuests: questCount,
    });
    const visible = obj(sk.visible);
    ledger.visible = {
        premise: str(visible.premise),
        tone: str(visible.tone),
        startingSituation: str(visible.startingSituation),
        companions: arr(visible.companions).map(c => ({ name: str(c?.name), surface: str(c?.surface) })).filter(c => c.name),
    };
    const anchors = obj(sk.anchors);
    ledger.anchors = {
        centralQuestion: str(anchors.centralQuestion),
        campaignThreat: str(anchors.campaignThreat),
        threatLayers: arr(anchors.threatLayers).map(str).filter(Boolean),
        layersRevealed: 0,
    };
    ledger.acts = [1, 2, 3, 4].map(n => {
        const a = obj(arr(sk.acts).find(x => Number(x?.act) === n));
        return {
            act: n,
            name: str(a.name) || actProfile(n).name,
            detail: n === 1 ? 'full' : n === 2 ? 'outline' : 'silhouette',
            pillar: str(a.pillar),
            faceAntagonist: str(a.faceAntagonist),
            hub: str(a.hub),
            territory: str(a.territory),
            summary: str(a.summary),
            seedsNeeded: [],
        };
    });
    ledger.ambiguousAlly = obj(sk.ambiguousAlly).name ? {
        name: str(sk.ambiguousAlly.name),
        surface: str(sk.ambiguousAlly.surface),
        hiddenGoal: str(sk.ambiguousAlly.hiddenGoal),
    } : null;

    const keyMap = {};
    for (const c of arr(sk.clocks)) {
        const clock = makeClock(ledger, c);
        if (c?.key) keyMap[str(c.key)] = clock.id;
        ledger.clocks.push(clock);
    }
    for (const a of arr(sk.arcs)) {
        const arc = makeArc(ledger, { ...a, clock: keyMap[str(a?.clock)] || '' });
        if (a?.key) keyMap[str(a.key)] = arc.id;
        ledger.arcs.push(arc);
    }
    for (const s of arr(sk.seeds)) {
        const seed = makeSeed(ledger, { ...s, arc: keyMap[str(s?.arc)] || '' });
        if (s?.key) keyMap[str(s.key)] = seed.id;
        ledger.seeds.push(seed);
    }
    for (const a of ledger.acts) {
        const raw = obj(arr(sk.acts).find(x => Number(x?.act) === a.act));
        a.seedsNeeded = arr(raw.seedsNeeded).map(k => keyMap[str(k)]).filter(Boolean);
    }
    for (const c of arr(sk.companions)) {
        upsertByName(ledger.companions, { ...c, arc: keyMap[str(c?.arc)] || '', planned: true, joined: false }, COMPANION_FIELDS);
    }
    for (const n of arr(sk.npcs)) upsertByName(ledger.npcs, n, NPC_FIELDS);
    for (const l of arr(sk.locations)) upsertByName(ledger.world.locations, { ...l, secretFound: false }, LOCATION_FIELDS);
    ledger.canon = [];
    if (origin) importOriginIntoLedger(ledger, origin, questCount);
    ledger.brief = normalizeBrief(sk.brief || {
        scene: 'new: the opening scene',
        tension: 1,
        tempo: 'Linger',
        tempoReason: 'Arrival: first impressions of the act\'s new rules',
        actStage: 'Arrival',
        endOn: 'A first choice at the starting location',
    }, ledger);
    return ledger;
}

// ── §15 Origin Interface ──────────────────────────────────────────────────

const SEVERITY_TO_SIZE = { minor: 'Ripple', moderate: 'Turn', severe: 'Upheaval' };
const AWARENESS_TO_FILL = { unaware: 0, searching_cold: 2, closing_in: 5 };

/**
 * Map an Origin record onto the Ledger (§15):
 *   Personal Pressure Lever → a clock owned by the character (negative Shift sized by severity)
 *   Pursuer Block          → a faction clock + a Faction arc; awareness sets the start position
 *   Social Recognition     → an NPC reaction rule
 *   Personal quests        → the Origin arc (quest count = chapters)
 *   Origin secrets         → hidden facts revealed as Upheavals
 *   Nation / custom race   → World section, Canon from creation
 */
export function importOriginIntoLedger(ledger, origin, questCount = 7) {
    const p = obj(origin?.profile);
    if (!origin || !p.identity) return ledger;
    const name = str(p.identity.name) || 'The protagonist';

    const levers = arr(p.personalLevers).length
        ? p.personalLevers
        : arr(origin.levers?.personal).map(text => ({ name: text, description: text, severity: 'moderate' }));
    for (const lever of levers) {
        const size = SEVERITY_TO_SIZE[lever.severity] || 'Turn';
        const clock = makeClock(ledger, {
            owner: `${name} — ${str(lever.name) || 'Personal pressure'}`,
            segments: 6,
            ticksOn: str(lever.description) || 'Time, and every use or indulgence of the pressure',
            onFill: { size, polarity: 'negative', text: `${str(lever.name) || 'The pressure'} comes due: ${str(lever.currentPressure || lever.description)}` },
            known: true,
        });
        ledger.clocks.push(clock);
        ledger.character.leverClocks.push(clock.id);
    }

    for (const pursuer of arr(p.pursuers)) {
        const clock = makeClock(ledger, {
            owner: str(pursuer.identity) || 'Pursuer',
            segments: 8,
            filled: AWARENESS_TO_FILL[pursuer.awareness] ?? 2,
            ticksOn: `The pursuer's plan advances: ${str(pursuer.plan) || str(pursuer.motive)}`,
            onFill: { size: 'Turn', polarity: 'negative', text: `${str(pursuer.identity)} catches up (${str(pursuer.motive)})${pursuer.leverage ? `, using ${pursuer.leverage}` : ''}` },
            known: false,
        });
        ledger.clocks.push(clock);
        ledger.character.pursuerClocks.push(clock.id);
        ledger.arcs.push(makeArc(ledger, { name: `Pursuit: ${str(pursuer.identity)}`, type: 'Faction', status: 'Dormant', act: 'all', clock: clock.id, tension: 2 }));
    }

    const rec = obj(p.socialLever);
    const recognition = [str(rec.description), rec.whoRecognizes && `recognized by ${rec.whoRecognizes}`, rec.typicalReaction && `typical reaction: ${rec.typicalReaction}`].filter(Boolean).join('; ');
    if (recognition) ledger.character.recognitionRules.push(recognition);
    for (const s of arr(origin.levers?.social)) if (!recognition) ledger.character.recognitionRules.push(s);

    const originArc = makeArc(ledger, {
        name: `Origin: ${str(origin.originLabel)}`,
        type: 'Origin',
        status: 'Known',
        act: 'all',
        tension: 2,
        nextChapters: [str(p.originArc?.summary)].filter(Boolean),
    });
    originArc.questCount = questCount;
    originArc.questsResolved = 0;
    ledger.arcs.push(originArc);

    ledger.character.originSecrets = arr(p.secrets).map(s => str(s.secret)).filter(Boolean);
    for (const secret of arr(p.secrets)) {
        for (const idea of arr(secret.seedIdeas).slice(0, 1)) {
            const seed = makeSeed(ledger, { planted: `(not yet planted) ${idea}`, intendedPayoff: `Origin secret revealed: ${secret.secret}`, size: 'Upheaval', arc: originArc.id });
            seed.status = 'idea';
            ledger.seeds.push(seed);
        }
    }
    if (str(p.worldThreatTieIn)) ledger.character.worldThreatTieIn = str(p.worldThreatTieIn);

    const nation = obj(p.nation);
    if (nation.name) {
        ledger.world.nations.push({
            name: nation.name, government: nation.government, cultureVibes: arr(nation.cultureVibes),
            outsiderView: nation.outsiderView, now: nation.now || null,
        });
        addCanon(ledger, `${name} comes from ${nation.name} (${[nation.government, arr(nation.cultureVibes).join(', ')].filter(Boolean).join('; ')}).`);
        for (const fact of arr(nation.recordedFacts)) addCanon(ledger, fact);
    }
    if (p.customRace?.name) {
        ledger.world.customRaces.push(clone(p.customRace));
        addCanon(ledger, `${p.customRace.name}: ${[p.customRace.appearance, p.customRace.lifespan && `lifespan ${p.customRace.lifespan}`].filter(Boolean).join('; ')}`);
    }
    return ledger;
}

// ── Canon / changelog ─────────────────────────────────────────────────────

function addCanon(ledger, fact) {
    const text = str(fact);
    if (!text) return false;
    if (ledger.canon.some(c => c.toLowerCase() === text.toLowerCase())) return false;
    ledger.canon.push(text);
    return true;
}

// ── Seeding rules (§6.2) ──────────────────────────────────────────────────

/**
 * Can a Shift of this size pay off from these Seeds right now?
 * @returns {{ ok: boolean, reason: string }}
 */
export function checkShiftPrerequisites(ledger, size, seedIds = []) {
    const seeds = arr(seedIds).map(id => ledger.seeds.find(s => s.id === id)).filter(s => s && s.status !== 'idea');
    const scene = ledger.campaign.sceneCount;
    const signs = seeds.reduce((n, s) => n + s.signs.length, 0);
    if (size === 'Ripple') {
        return seeds.length >= 1 ? { ok: true, reason: '' } : { ok: false, reason: 'a Ripple needs at least 1 Seed' };
    }
    if (size === 'Turn') {
        if (!seeds.some(s => scene - s.scene >= 2)) return { ok: false, reason: 'a Turn needs a Seed planted at least 2 scenes earlier' };
        if (signs < 1) return { ok: false, reason: 'a Turn needs at least 1 Sign' };
        return { ok: true, reason: '' };
    }
    if (size === 'Upheaval') {
        if (seeds.length < 3) return { ok: false, reason: 'an Upheaval needs at least 3 Seeds' };
        if (new Set(seeds.map(s => s.chapter)).size < 2) return { ok: false, reason: 'an Upheaval needs Seeds from at least 2 different chapters' };
        if (signs < 1) return { ok: false, reason: 'an Upheaval needs at least 1 Sign' };
        return { ok: true, reason: '' };
    }
    return { ok: false, reason: `unknown Shift size "${size}"` };
}

// ── Operations ────────────────────────────────────────────────────────────

/**
 * Apply the Chronicler's operations. Invalid operations are skipped with a
 * warning instead of throwing, so one bad op never loses the rest of a turn.
 * @returns {{ ledger: object, applied: object[], warnings: string[], events: object }}
 */
export function applyLedgerOps(input, ops, { scene = null } = {}) {
    const ledger = clone(input);
    const applied = [];
    const warnings = [];
    const events = { ticks: [], filled: [], seeds: [], signs: [], shifts: [], canon: 0, boundary: false, turn: false, upheaval: false, chapterEnded: false, actExit: null };
    let boundarySeen = false;
    let tickedThisBoundary = false;
    const warn = (msg) => warnings.push(msg);
    const findClock = (id) => ledger.clocks.find(c => c.id === str(id));
    const findArc = (id) => ledger.arcs.find(a => a.id === str(id) || a.name.toLowerCase() === str(id).toLowerCase());
    const findSeed = (id) => ledger.seeds.find(s => s.id === str(id));

    const tick = (clock, by, reason) => {
        if (clock.status !== 'running') {
            warn(`${clock.id} is ${clock.status}; tick ignored`);
            return;
        }
        const before = clock.filled;
        clock.filled = Math.max(0, Math.min(clock.segments, clock.filled + by));
        clock.lastTickScene = ledger.campaign.sceneCount;
        events.ticks.push({ id: clock.id, from: before, to: clock.filled, segments: clock.segments, reason: str(reason) });
        if (by > 0) tickedThisBoundary = true;
        if (clock.filled >= clock.segments) {
            clock.status = 'filled';
            events.filled.push({ id: clock.id, owner: clock.owner, onFill: clock.onFill });
        }
    };

    for (const raw of arr(ops)) {
        const op = obj(raw);
        const kind = str(op.op);
        try {
            switch (kind) {
                case 'scene': {
                    const tension = clampInt(op.tension, 1, 5, null);
                    if (op.boundary) {
                        boundarySeen = true;
                        events.boundary = true;
                        ledger.campaign.sceneCount += 1;
                        for (const a of ledger.arcs) if (['Known', 'Active'].includes(a.status)) a.scenesSinceTurn += 1;
                        if (tension !== null) ledger.campaign.tensionHistory.push(tension);
                    } else if (tension !== null) {
                        const h = ledger.campaign.tensionHistory;
                        if (h.length) h[h.length - 1] = tension; else h.push(tension);
                    }
                    ledger.campaign.tensionHistory = ledger.campaign.tensionHistory.slice(-TENSION_HISTORY_LENGTH);
                    if (str(op.date)) ledger.campaign.inFictionDate = str(op.date);
                    if (op.actStage && ACT_STAGES.includes(op.actStage)) ledger.campaign.actStage = op.actStage;
                    break;
                }
                case 'tick': {
                    const clock = findClock(op.clock);
                    if (!clock) { warn(`tick: unknown clock ${op.clock}`); continue; }
                    tick(clock, clampInt(op.by ?? 1, -8, 8, 1), op.reason);
                    break;
                }
                case 'clock_add': {
                    const clock = makeClock(ledger, op.clock || op);
                    ledger.clocks.push(clock);
                    events.ticks.push({ id: clock.id, from: 0, to: clock.filled, segments: clock.segments, reason: 'new clock' });
                    break;
                }
                case 'clock_set': {
                    const clock = findClock(op.clock);
                    if (!clock) { warn(`clock_set: unknown clock ${op.clock}`); continue; }
                    if (op.known !== undefined) clock.known = !!op.known;
                    if (op.status && ['running', 'stopped', 'resolved'].includes(op.status)) clock.status = op.status;
                    if (op.signed !== undefined) clock.signed = !!op.signed;
                    break;
                }
                case 'seed': {
                    const seed = makeSeed(ledger, op.seed || op);
                    if (!seed.planted) { warn('seed: missing "planted" detail'); continue; }
                    const arcRef = seed.arc && findArc(seed.arc);
                    seed.arc = arcRef ? arcRef.id : '';
                    ledger.seeds.push(seed);
                    events.seeds.push(seed.id);
                    break;
                }
                case 'plant': {
                    // Plant a pre-planned idea seed (e.g. origin secrets) — it starts counting now.
                    const seed = findSeed(op.seed);
                    if (!seed) { warn(`plant: unknown seed ${op.seed}`); continue; }
                    seed.status = 'planted';
                    seed.scene = ledger.campaign.sceneCount;
                    seed.chapter = ledger.campaign.chapterCount;
                    if (str(op.detail)) seed.planted = str(op.detail);
                    events.seeds.push(seed.id);
                    break;
                }
                case 'sign': {
                    const seed = findSeed(op.seed);
                    const clock = findClock(op.clock);
                    if (seed && seed.status !== 'idea') {
                        seed.signs.push({ text: str(op.text), scene: ledger.campaign.sceneCount });
                        if (seed.status === 'planted') seed.status = 'signed';
                        events.signs.push(seed.id);
                    } else if (clock) {
                        clock.signed = true;
                        events.signs.push(clock.id);
                    } else {
                        warn(`sign: unknown or unplanted seed/clock ${op.seed || op.clock}`);
                        continue;
                    }
                    break;
                }
                case 'shift': {
                    const size = pickEnum(op.size, SHIFT_SIZES, null);
                    if (!size) { warn(`shift: unknown size ${op.size}`); continue; }
                    const polarity = pickEnum(op.polarity, ['positive', 'negative', 'mixed'], 'mixed');
                    const seeds = arr(op.seeds).map(str);
                    const check = checkShiftPrerequisites(ledger, size, seeds);
                    const shift = { scene: ledger.campaign.sceneCount, act: ledger.campaign.act, size, polarity, text: str(op.text), seeds, arc: str(op.arc), clock: str(op.clock) };
                    if (!check.ok && !op.clock) {
                        // Still logged — the Chronicler records what actually happened — but flagged.
                        shift.unseeded = true;
                        warn(`shift "${shift.text}": ${check.reason} (logged as unseeded)`);
                        ledger.changelog.push(`Scene ${shift.scene}: unseeded ${size} delivered — ${check.reason}.`);
                    }
                    for (const id of seeds) {
                        const s = findSeed(id);
                        if (s) s.status = 'paid';
                    }
                    ledger.shifts.push(shift);
                    events.shifts.push(shift);
                    if (size === 'Turn' || size === 'Upheaval') {
                        if (polarity === 'negative') ledger.campaign.negativeTurnStreak += 1;
                        else ledger.campaign.negativeTurnStreak = 0;
                        events.turn = true;
                    }
                    if (size === 'Upheaval') {
                        ledger.campaign.upheavalsThisAct += 1;
                        events.upheaval = true;
                    }
                    const arc = shift.arc && findArc(shift.arc);
                    if (arc && size !== 'Ripple') {
                        arc.chapter += 1;
                        arc.scenesSinceTurn = 0;
                        if (arc.nextChapters.length) arc.nextChapters.shift();
                        ledger.campaign.chapterCount += 1;
                        events.chapterEnded = true;
                    }
                    const clock = shift.clock && findClock(shift.clock);
                    if (clock && clock.status === 'filled') clock.status = 'resolved';
                    break;
                }
                case 'canon': {
                    if (addCanon(ledger, op.fact || op.text)) events.canon += 1;
                    break;
                }
                case 'arc_add': {
                    const a = obj(op.arc || op);
                    const arc = makeArc(ledger, { ...a, clock: findClock(a.clock)?.id || '' });
                    ledger.arcs.push(arc);
                    break;
                }
                case 'arc': {
                    const arc = findArc(op.id || op.arc);
                    if (!arc) { warn(`arc: unknown arc ${op.id || op.arc}`); continue; }
                    if (op.status) {
                        const status = pickEnum(op.status, ARC_STATUSES, arc.status);
                        const becameKnown = arc.status === 'Dormant' && ['Known', 'Active'].includes(status);
                        arc.status = status;
                        if (becameKnown) arc.scenesSinceTurn = 0;
                    }
                    if (op.tension !== undefined) arc.tension = clampInt(op.tension, 1, 5, arc.tension);
                    if (Array.isArray(op.nextChapters)) arc.nextChapters = op.nextChapters.map(str).filter(Boolean).slice(0, 10);
                    if (str(op.questTitle)) arc.questTitle = str(op.questTitle);
                    if (op.surfaced !== undefined) arc.surfaced = !!op.surfaced;
                    if (op.questResolved && arc.type === 'Origin') arc.questsResolved = (arc.questsResolved || 0) + 1;
                    break;
                }
                case 'npc': upsertByName(ledger.npcs, op, NPC_FIELDS); break;
                case 'companion': {
                    const row = upsertByName(ledger.companions, op, COMPANION_FIELDS);
                    if (row && row.planned === undefined) row.planned = false;
                    if (row && op.joined && !row.arc) {
                        // §11: an unplanned companion gets a Companion arc on joining.
                        const arc = makeArc(ledger, { name: `Companion: ${row.name}`, type: 'Companion', status: 'Dormant', act: 'all', tension: 2 });
                        ledger.arcs.push(arc);
                        row.arc = arc.id;
                    }
                    break;
                }
                case 'location': upsertByName(ledger.world.locations, op, LOCATION_FIELDS); break;
                case 'revise': {
                    const change = str(op.change);
                    if (!change) continue;
                    if (ledger.canon.some(c => c.toLowerCase().includes(str(op.target).toLowerCase()) && str(op.target))) {
                        warn(`revise: "${op.target}" touches Canon; Canon never changes`);
                        continue;
                    }
                    ledger.changelog.push(`Scene ${ledger.campaign.sceneCount}: ${str(op.target) || 'skeleton'} — ${change}${op.why ? ` (why: ${str(op.why)})` : ''}`);
                    const act = ledger.acts.find(a => a.act === Number(op.act));
                    if (act && op.field && ['pillar', 'faceAntagonist', 'hub', 'summary', 'territory'].includes(op.field)) act[op.field] = change;
                    break;
                }
                case 'act_stage': {
                    if (ACT_STAGES.includes(op.stage)) ledger.campaign.actStage = op.stage;
                    else warn(`act_stage: unknown stage ${op.stage}`);
                    break;
                }
                case 'reveal_layer': {
                    ledger.anchors.layersRevealed = Math.min(ledger.anchors.threatLayers.length || 4, ledger.anchors.layersRevealed + 1);
                    break;
                }
                case 'world_directive': {
                    if (str(op.text)) ledger.pending.worldDirectives.push(str(op.text));
                    break;
                }
                case 'act_exit': {
                    // The player is at the point of no return; the runtime asks for confirmation.
                    ledger.campaign.actStage = 'Exit';
                    ledger.pending.actExit = { reason: str(op.reason), crossing: !!op.crossing, scene: ledger.campaign.sceneCount };
                    events.actExit = ledger.pending.actExit;
                    break;
                }
                case 'brief': break; // handled by the caller
                default:
                    warn(`unknown op "${kind}"`);
                    continue;
            }
            applied.push(op);
        } catch (err) {
            warn(`${kind}: ${err?.message || err}`);
        }
    }

    // §9.2 minimum movement: a scene boundary always ticks at least one clock.
    if (boundarySeen && !tickedThisBoundary) {
        const running = ledger.clocks.filter(c => c.status === 'running' && c.filled < c.segments);
        if (running.length) {
            running.sort((a, b) => a.lastTickScene - b.lastTickScene || a.id.localeCompare(b.id));
            tick(running[0], 1, 'minimum movement at scene boundary');
            warnings.push(`minimum movement: ticked ${running[0].id}`);
        }
    }
    if (scene !== null) ledger.campaign.turnIndex = scene;
    else ledger.campaign.turnIndex += 1;
    return { ledger, applied, warnings, events };
}

// ── Rhythm (§5.3, §6.1, §8.2) ─────────────────────────────────────────────

/**
 * Code-computed pacing guidance for the Director, plus hard limits the Brief is
 * clamped to. `forceMaxTension` is set when a rule demands a drop.
 */
export function computeRhythm(ledger) {
    const { act, actStage, tensionHistory: h, negativeTurnStreak } = ledger.campaign;
    const profile = actProfile(act);
    const hints = [];
    let forceMaxTension = null;
    let forceChange = false;

    const tail = (n) => h.slice(-n);
    const finalSequence = act === 4 && ['Pillar', 'Convergence'].includes(actStage);
    if (h.length >= 3 && tail(3).every(t => t >= 4) && !finalSequence) {
        forceMaxTension = 3;
        hints.push('CONTRAST: three or more scenes at tension 4–5 — the next scene drops tension or becomes a Rest beat.');
    }
    if (h.length >= 4 && tail(4).every(t => t === h[h.length - 1])) {
        forceChange = true;
        hints.push(`ANTI-FLATNESS: four scenes at tension ${h[h.length - 1]} — change it (raise: surface a Sign, reveal clock progress, add a complication; release: a win, a Rest beat, a quiet discovery).`);
    }
    if (negativeTurnStreak >= 3) {
        hints.push('POLARITY BALANCE: three negative Turns in a row — the next chapter must contain a real opening for the player (an ally, a weakness in the opposition, a resource) to earn a positive Shift.');
    }
    const peaking = ledger.arcs.filter(a => ['Known', 'Active'].includes(a.status) && a.tension >= 4);
    if (peaking.length > 1 && actStage !== 'Pillar') {
        hints.push(`SINGLE PEAK: ${peaking.map(a => a.id).join(', ')} all sit at tension 4–5; only one arc may peak outside a Pillar.`);
    }
    for (const a of ledger.arcs) {
        if (['Known', 'Active'].includes(a.status) && a.scenesSinceTurn >= STALENESS_SCENES) {
            hints.push(`STALENESS: ${a.id} "${a.name}" has gone ${a.scenesSinceTurn} scenes without a chapter change — tick its clock harder so a Sign surfaces, or let the world resolve the chapter off-screen.`);
        }
    }
    const known = ledger.arcs.filter(a => ['Known', 'Active'].includes(a.status) && a.type !== 'Faction');
    if (known.length > KNOWN_ARC_LIMIT) hints.push(`CONCURRENCY: ${known.length} Known arcs — keep 3–5; resolve or let one lapse before surfacing more.`);
    for (const c of ledger.clocks) {
        if (c.status === 'running' && !c.signed && c.filled * 2 >= c.segments) {
            hints.push(`TELEGRAPH: ${c.id} (${c.owner}) is ${c.filled}/${c.segments} with no Sign yet — show one the player could find.`);
        }
        if (c.status === 'filled') hints.push(`RESOLVE: ${c.id} (${c.owner}) is full — its Shift happens now: ${c.onFill.size}(${c.onFill.polarity}) ${c.onFill.text}`);
    }
    return { range: profile.range, pillarPeak: profile.pillarPeak, defaultTempo: profile.tempo, hints, forceMaxTension, forceChange };
}

// ── The Brief (§17.1) ─────────────────────────────────────────────────────

/**
 * Normalize a Director Brief and enforce what code can: act tension range,
 * rhythm clamps, and that every planned payoff meets §6.2. An invalid payoff
 * is replaced with a Sign so the story keeps moving toward it.
 */
export function normalizeBrief(input, ledger) {
    const b = obj(input);
    const rhythm = computeRhythm(ledger);
    const stage = ACT_STAGES.includes(b.actStage) ? b.actStage : ledger.campaign.actStage;
    const [lo, hi] = rhythm.range;
    const top = stage === 'Pillar' ? rhythm.pillarPeak : hi;
    let tension = clampInt(b.tension, 1, 5, lo);
    const notes = [];
    tension = Math.max(lo, Math.min(top, tension));
    if (rhythm.forceMaxTension !== null && tension > rhythm.forceMaxTension) {
        tension = Math.max(1, Math.min(rhythm.forceMaxTension, tension));
        notes.push('Tension lowered for contrast after sustained danger.');
    }
    const payOff = obj(b.payOff);
    let payoff = null;
    let heldSign = '';
    if (payOff.text || payOff.size) {
        const size = pickEnum(payOff.size, SHIFT_SIZES, 'Ripple');
        const check = checkShiftPrerequisites(ledger, size, arr(payOff.seeds));
        if (check.ok) {
            payoff = { size, polarity: pickEnum(payOff.polarity, ['positive', 'negative', 'mixed'], 'mixed'), text: str(payOff.text), seeds: arr(payOff.seeds).map(str) };
        } else {
            notes.push(`Planned ${size} held back (${check.reason}); show a Sign toward it instead.`);
            if (str(payOff.text)) heldSign = `A Sign pointing toward: ${str(payOff.text)}`;
        }
    }
    const show = [str(b.show), heldSign].filter(Boolean).join(' Also: ');
    // §17.1: every clock that filled has a resolution in the Brief.
    let offscreen = str(b.offscreen);
    for (const c of ledger.clocks.filter(x => x.status === 'filled')) {
        if (!offscreen.includes(c.id) && !offscreen.toLowerCase().includes(c.owner.toLowerCase())) {
            offscreen = [offscreen, `${c.owner}'s clock (${c.id}) is full — ${c.onFill.size} (${c.onFill.polarity}): ${c.onFill.text}. Surface it through the world.`].filter(Boolean).join(' ');
        }
    }
    return {
        scene: str(b.scene) || 'continuing',
        tension,
        tempo: pickEnum(b.tempo, TEMPOS, rhythm.defaultTempo),
        tempoReason: str(b.tempoReason),
        actStage: stage,
        offscreen,
        plant: str(b.plant),
        show,
        payOff: payoff,
        check: str(b.check) && !/^none$/i.test(str(b.check)) ? str(b.check) : '',
        endOn: str(b.endOn) || 'A decision that belongs to the player.',
        keepHidden: arr(b.keepHidden).map(str).filter(Boolean).slice(0, 8),
        rest: !!b.rest,
        notes,
    };
}

// ── OOC overrides (§5.4) ──────────────────────────────────────────────────

/** Parse `(( rush ))`, `(( flow ))`, `(( linger ))`, `(( rest ))` from the player's message. */
export function parseOocOverrides(text) {
    const out = { tempo: null, rest: false };
    const re = /\(\(\s*(rush|flow|linger|rest)\s*\)\)/gi;
    let m;
    while ((m = re.exec(String(text || '')))) {
        const w = m[1].toLowerCase();
        if (w === 'rest') out.rest = true;
        else out.tempo = w.charAt(0).toUpperCase() + w.slice(1);
    }
    return out;
}

/** Apply player overrides to a Brief; overrides always beat the Director (§5.4). */
export function applyOverridesToBrief(brief, overrides) {
    if (!brief) return brief;
    const next = { ...brief, notes: [...arr(brief.notes)] };
    if (overrides?.tempo) {
        next.tempo = overrides.tempo;
        next.tempoReason = 'player override';
    }
    if (overrides?.rest) {
        next.rest = true;
        next.tension = Math.min(next.tension, 2);
        if (!overrides.tempo) next.tempo = 'Linger';
        next.notes.push('The player asked for a Rest beat: take it at the next safe opportunity (interrupt only with a clock they were already warned about).');
    }
    return next;
}

// ── Pulse (§16.2) ─────────────────────────────────────────────────────────

/** The one-line state note, built by code from what was actually applied. */
export function formatPulse(ledger, events, brief, prevTension = null) {
    const t = ledger.campaign.tensionHistory.at(-1) ?? brief?.tension ?? '?';
    const tension = prevTension !== null && prevTension !== t ? `T${prevTension}→${t}` : `T${t}`;
    const ticks = events.ticks.map(x => `${x.id} ${x.to}/${x.segments}`).join(', ') || 'none';
    const shift = events.shifts.map(s => `${s.size}(${s.polarity === 'positive' ? '+' : s.polarity === 'negative' ? '-' : '±'}) ${s.text}`.trim()).join('; ') || 'none';
    const parts = [
        'PULSE',
        tension,
        brief?.tempo || '-',
        `Act${ledger.campaign.act}·${ledger.campaign.actStage}`,
        `ticks: ${ticks}`,
        `seed+: ${events.seeds.join(', ') || 'none'}`,
        `sign: ${events.signs.join(', ') || 'none'}`,
        `shift: ${shift}`,
        `check: ${brief?.check || 'none'}`,
    ];
    return `<!-- ${parts.join(' | ')} -->`;
}

// ── Digest for agent prompts ──────────────────────────────────────────────

/**
 * Compact view of the Ledger for the Chronicler/Director prompt. Resolved and
 * lost items are summarized; Canon is truncated to the most recent facts.
 */
export function buildLedgerDigest(ledger) {
    const live = (a) => !['Resolved', 'Lost'].includes(a.status);
    return {
        campaign: {
            act: ledger.campaign.act,
            actName: actProfile(ledger.campaign.act).name,
            actJob: actProfile(ledger.campaign.act).job,
            actStage: ledger.campaign.actStage,
            inFictionDate: ledger.campaign.inFictionDate,
            scene: ledger.campaign.sceneCount,
            tensionHistory: ledger.campaign.tensionHistory,
            settings: ledger.campaign.settings,
        },
        anchors: ledger.anchors,
        ambiguousAlly: ledger.ambiguousAlly || null,
        acts: ledger.acts.map(a => (a.detail === 'silhouette' ? { act: a.act, detail: a.detail, summary: a.summary } : a)),
        arcs: ledger.arcs.filter(live),
        resolvedArcs: ledger.arcs.filter(a => !live(a)).map(a => `${a.id} ${a.name} (${a.status})`),
        clocks: ledger.clocks.filter(c => c.status !== 'resolved'),
        seeds: ledger.seeds.filter(s => s.status !== 'paid'),
        recentShifts: ledger.shifts.slice(-6),
        npcs: ledger.npcs,
        companions: ledger.companions,
        character: ledger.character,
        locations: ledger.world.locations,
        canon: ledger.canon.slice(-CANON_DIGEST_LIMIT),
        pending: ledger.pending,
    };
}

// ── Narrator block ────────────────────────────────────────────────────────

const TEMPO_TEXT = {
    Rush: 'RUSH — compress: this reply may cover hours or days or a routine sequence. Summarize in a few vivid sentences, then land at the first moment the player would plausibly want to act. Never rush past a decision that belongs to the player or a moment that deserves Linger.',
    Flow: 'FLOW — conversational pace; the scene plays out beat by beat.',
    Linger: 'LINGER — expand: this reply covers seconds or a single moment in rich detail (first discovery, revelation, emotional beat, first contact with an antagonist, the decisive moment of a climax, a Rest beat with companions).',
};

/** Narrator rules (§19 Narrator column: 5.2, 5.4, 6.3, 7.2, 7.5, 9.3, 10.4, 11, 14, 17.2). */
export function buildNarratorRules(ledger) {
    const physical = ledger.campaign.settings.dice === 'physical';
    return [
        'You are the Narrator of a four-act campaign. A Director has planned this reply; its BRIEF is below. Follow it, but if the player\'s action makes the Brief wrong, follow the player and the fiction instead.',
        '- Write entirely in-world. Play every NPC by their own agenda; antagonists reinforce what the player threatens, retaliate against what they damaged, and exploit what they neglected.',
        '- Off-screen events reach the player only through the world itself: rumors, NPC remarks, changed places, evidence, messengers, companions\' reactions. No "meanwhile" cutaways.',
        '- Notable places have a Surface (with a hint of its Secret), a Secret that rewards investigation, and a Thread pointing somewhere else. On a first significant discovery, Linger, leave questions open, and make the Thread visible.',
        '- A great Shift is rooted in what was planted, changes what someone does, opens a door, and touches something the player cares about or echoes their choice. Losses reroute: every loss leaves a new thread.',
        '- Companions hold opinions, disagree, and change their view of the player based on choices. Rest beats are their stage.',
        physical
            ? '- Dice: only at genuinely uncertain Turn/Upheaval moments. Call the check and set the DC first — end the reply with `(( Roll a d20 — DC n — what is at stake ))` and wait; the player reports `(( rolled n ))`. Meeting the DC succeeds; missing it fails forward with a cost. Honor the result exactly.'
            : '- Dice: roll only when the outcome of a Turn/Upheaval-level action is genuinely uncertain; resolve everything else through the fiction. Set the DC before rolling. A failure always fails forward with a cost — the story continues down a different path.',
        `- ${ledger.campaign.settings.protagonistDeath ? 'Protagonist death is possible, but only at tension 5 after clear Signs of mortal danger.' : 'The protagonist does not die; defeat means capture, loss or a darker path.'}`,
        '- Player out-of-character commands: (( rush )), (( flow )), (( linger )) set the tempo; (( rest )) asks for a Rest beat. They beat the Brief.',
        '- Keep every Hidden fact hidden; reveal only what the scene uncovers. Never mention the Brief, arcs, clocks, Seeds or acts.',
        '- End every reply at a decision point the player can act on. If you offer numbered or button choices, one of them must be the Brief\'s decision point.',
    ].join('\n');
}

/**
 * The per-turn narrator block: rules + Brief + Known arcs to surface as quests.
 * @param {object} ledger
 * @param {object} brief already normalized and override-applied
 */
export function buildCampaignNarratorBlock(ledger, brief) {
    if (!ledger || !brief) return '';
    const lines = ['[CAMPAIGN]', buildNarratorRules(ledger), '', 'BRIEF'];
    lines.push(`Scene: ${brief.scene}`);
    lines.push(`Tension: ${brief.tension} (1 Calm · 2 Unease · 3 Pressure · 4 Danger · 5 Crisis)`);
    lines.push(`Tempo: ${TEMPO_TEXT[brief.tempo] || brief.tempo}${brief.tempoReason ? ` Reason: ${brief.tempoReason}.` : ''}`);
    if (brief.rest) lines.push('Rest beat: tension 1–2; companion conversation, reflection, a quiet Seed for a Companion or Origin arc, off-screen news arriving.');
    if (brief.offscreen) lines.push(`Off-screen (surface only through the world): ${brief.offscreen}`);
    if (brief.plant) lines.push(`Plant (quietly; the player may overlook it): ${brief.plant}`);
    if (brief.show) lines.push(`Show (a visible Sign the player can notice and act on): ${brief.show}`);
    if (brief.payOff) lines.push(`Pay off: ${brief.payOff.size} (${brief.payOff.polarity}) — ${brief.payOff.text}`);
    if (brief.check) lines.push(`Check: ${brief.check}`);
    for (const n of arr(brief.notes)) lines.push(`Note: ${n}`);
    const surfacing = ledger.arcs.filter(a => ['Known', 'Active'].includes(a.status) && a.type !== 'Faction' && !a.surfaced && a.questTitle);
    for (const a of surfacing.slice(0, 2)) {
        lines.push(`Quest: when the player takes up "${a.questTitle}", mark it with *(Emergent Quest Active: ${a.questTitle})* or *(Quest Accepted: ${a.questTitle})* as usual.`);
    }
    if (ledger.campaign.actStage === 'Exit' && ledger.pending.actExit && !ledger.pending.actExit.crossing) {
        lines.push(`Point of no return: make it clear in-world that the way forward is one-way. If the player moves to cross, end the reply with: (( This ends Act ${ledger.campaign.act}. Unfinished threads here will resolve without you. Continue? ))`);
    }
    lines.push(`End on: ${brief.endOn}`);
    if (brief.keepHidden.length) lines.push(`Keep hidden: ${brief.keepHidden.join('; ')}`);
    lines.push('[/CAMPAIGN]');
    return `${lines.join('\n')}\n\n`;
}

/** Tempo → the extension's narrative-pacing tags (Q18). Flow keeps the player's own setting. */
export function tempoPacingMode(brief) {
    if (!brief) return null;
    if (brief.rest) return 'downtime';
    if (brief.tempo === 'Rush') return 'shorter_outputs';
    return null;
}

// ── Act transitions (§13) ─────────────────────────────────────────────────

/**
 * Cross into the next act after the player confirmed. Dormant arcs of the
 * ending act resolve off-screen (their fates come from the Architect; code
 * marks them), tension resets for the Interlude, and the rolling horizon
 * shifts: next act full, the one after it outlined.
 */
export function advanceAct(input, { dormantOutcomes = {} } = {}) {
    const ledger = clone(input);
    const from = ledger.campaign.act;
    for (const a of ledger.arcs) {
        if (a.status === 'Dormant' && a.act === from) {
            a.status = 'Resolved';
            const outcome = str(dormantOutcomes[a.id]);
            ledger.changelog.push(`Act ${from} exit: ${a.id} "${a.name}" resolved off-screen${outcome ? ` — ${outcome}` : ''}.`);
            if (outcome) ledger.pending.worldDirectives.push(`Off-screen resolution at the end of Act ${from}: ${outcome}`);
        }
    }
    ledger.campaign.act = from >= 4 ? 'epilogue' : from + 1;
    ledger.campaign.actStage = 'Interlude';
    ledger.campaign.upheavalsThisAct = 0;
    ledger.campaign.tensionHistory = [];
    ledger.pending.actExit = null;
    const next = ledger.acts.find(a => a.act === ledger.campaign.act);
    if (next) next.detail = 'full';
    const after = ledger.acts.find(a => a.act === Number(ledger.campaign.act) + 1);
    if (after && after.detail === 'silhouette') after.detail = 'outline';
    ledger.brief = normalizeBrief({
        scene: `new: the Interlude after Act ${from}`,
        tension: 1,
        tempo: 'Linger',
        tempoReason: 'Interlude — companions react and the first Echoes of the finished act arrive',
        actStage: 'Interlude',
        rest: true,
        endOn: 'A quiet choice about what comes next',
    }, ledger);
    return ledger;
}

// ── Ledger snapshots on messages (swipe/delete rollback) ──────────────────

/**
 * Drop full snapshots from all but the newest `keep` AI messages, leaving a
 * `{ pruned: true }` marker so rollback knows it cannot go further back.
 * @returns {number} how many snapshots were pruned
 */
export function pruneLedgerSnapshots(chat, keep = 12) {
    let seen = 0;
    let pruned = 0;
    const list = arr(chat);
    for (let i = list.length - 1; i >= 0; i--) {
        const snap = list[i]?.extra?.rpgCampaign;
        if (!snap || snap.pruned) continue;
        seen += 1;
        if (seen > keep) {
            list[i].extra.rpgCampaign = { pruned: true };
            pruned += 1;
        }
    }
    return pruned;
}

/**
 * Pick the Ledger state that matches the chat as it now stands: the snapshot
 * of the most recent AI message that has one for its selected swipe. When the
 * latest message's swipe has no snapshot yet (it is being generated), its
 * `base` (the Ledger before that message) is used.
 * @param {Array<{ is_user?: boolean, swipe_id?: number, extra?: any }>} chat
 */
export function resolveLedgerForChat(chat, fallback = null) {
    const list = arr(chat);
    for (let i = list.length - 1; i >= 0; i--) {
        const msg = list[i];
        const snap = msg?.extra?.rpgCampaign;
        if (!snap || msg.is_user) continue;
        // Older snapshots are pruned to keep chat files small; rollback cannot reach past one.
        if (snap.pruned) return { ledger: null, index: i, source: 'pruned' };
        const swipe = String(msg.swipe_id ?? 0);
        if (snap.swipes?.[swipe]?.after) return { ledger: snap.swipes[swipe].after, index: i, source: 'after' };
        if (snap.base) return { ledger: snap.base, index: i, source: 'base' };
    }
    return { ledger: fallback, index: -1, source: 'fallback' };
}
