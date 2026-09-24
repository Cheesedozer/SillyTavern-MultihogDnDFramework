// ─────────────────────────────────────────────────────────────────────────
// Origin System — static data (Origin System Specification §2–§8).
//
// Pure data only: no DOM, no settings, no LLM. `origin-lib.js` owns the
// rules that read this data (defaults, selection conflicts, levers, prompt
// building) so both can be unit-tested without a SillyTavern host.
//
// Field kinds (spec §1.1):
//   blank    — free text; empty means "the AI fills it".
//   modifier — a listed selection with a default and a required flag.
// `showIf(draft)` hides a field that does not apply to the current draft.
// ─────────────────────────────────────────────────────────────────────────

/** @param {string} value @param {string} label */
const opt = (value, label) => ({ value, label });

// ── §3 Races ──────────────────────────────────────────────────────────────

export const RACES = [
    { id: 'aasimar', label: 'Aasimar', living: true, lifespan: '~160 years', habitat: 'Anywhere; often temples and holy cities', notice: 'A faint celestial radiance; people assume virtue or divine favor' },
    { id: 'dragonborn', label: 'Dragonborn', living: true, lifespan: '~80 years', habitat: 'Clan holds in rugged highlands and coasts', notice: 'Draconic heritage, scales, and clan pride' },
    { id: 'dwarf', label: 'Dwarf', living: true, lifespan: '~350 years', habitat: 'Mountain holds and deep halls', notice: 'Endurance, craft and clan grudges' },
    { id: 'elf', label: 'Elf', living: true, lifespan: '~750 years', habitat: 'Ancient forests and old cities', notice: 'Long memory; can seem aloof' },
    { id: 'gnome', label: 'Gnome', living: true, lifespan: '~400 years', habitat: 'Hidden burrows, forested hills, workshops', notice: 'Curiosity and tinkering' },
    { id: 'goliath', label: 'Goliath', living: true, lifespan: '~90 years', habitat: 'High mountains and peaks', notice: 'Size, stone-marked skin and a competitive spirit' },
    { id: 'halfling', label: 'Halfling', living: true, lifespan: '~250 years', habitat: 'Fertile countryside, tight communities', notice: 'Seen as harmless, which is often an advantage' },
    { id: 'human', label: 'Human', living: true, lifespan: '~80 years', habitat: 'Everywhere', notice: 'The default; ambition and variety' },
    { id: 'orc', label: 'Orc', living: true, lifespan: '~80 years', habitat: 'Rugged frontiers, strongholds, steppes', notice: 'Strength; often met with prejudice' },
    { id: 'tiefling', label: 'Tiefling', living: true, lifespan: '~100 years', habitat: "Anywhere, often on society's margins", notice: 'Horns, tail and infernal heritage; distrust is common' },
    { id: 'vampire', label: 'Vampire', living: false, lifespan: 'Undying', habitat: 'Vampire nations; castles and crypts', notice: 'Pallor, predatory stillness and the thirst; reactions follow how the region treats vampires' },
    { id: 'silkborn', label: 'Silkborn', living: true, lifespan: '~80 years', habitat: 'Deep forests, cavern systems, and cliff-cities woven from silk', notice: 'Subtle arachnid traits: secondary eyes along brow and temples, fine chitin at the joints, spinnerets at the wrists' },
    { id: 'custom', label: 'Custom race…', living: true, lifespan: '', habitat: '', notice: '' },
];

/** Races that only the listed origins may take (spec §3.2). */
export const VAMPIRE_RACE_ORIGINS = ['exiled_royal', 'vampire_lord'];

export const SILKBORN_DESCRIPTION = 'Humanoid with subtle arachnid traits: two to six small secondary eyes along the brow and temples that can pass for markings or jewelry, fine chitin at the joints, and spinnerets at the wrists that produce silk. Silkborn share a colony-wide mind called the Weave, centered on a Queen, who designates heir-queens from her brood. A Silkborn nation is always a Hive Sovereignty.';

/** Runtime rules that apply to every Silkborn character (spec §3.3 Severance). */
export const SILKBORN_SEVERANCE_RULES = [
    'Severed from the Weave: speech and thought default to collective framing ("we" instead of "I"). Shifting to "I" is a gradual, visible effort; NPCs notice it and find it uncanny, pitiable, alien or intriguing depending on their culture.',
    'Little native sense of deception, privacy or subtext — portray social bluntness and difficulty with lies.',
    'A faint, unreliable residual thread remains: fragmentary sensations from nearby Weave-linked creatures. It works as an occasional warning sense, and it may let the hive trace the character.',
    'Other Weave-linked creatures react to a severed Silkborn with hostility or grief — a traitor or a tragedy.',
];

export const TURNED_RULES = [
    'Turned vampire: keeps their original race for culture, appearance base and origin nation, but counts as not living.',
    'The Hunger is an ever-present pressure; its intensity follows the feeding stance.',
];

export const CUSTOM_RACE_FIELDS = [
    { id: 'name', label: 'Race name', placeholder: 'e.g. Mirefolk' },
    { id: 'appearance', label: 'Appearance', multiline: true },
    { id: 'lifespan', label: 'Lifespan', placeholder: 'e.g. ~120 years' },
    { id: 'habitat', label: 'Typical habitat', placeholder: 'Sets the origin nation\'s default environment' },
    { id: 'cultureTendencies', label: 'Culture tendencies (1–2 vibes)', placeholder: 'e.g. Collectivist, Death-focused' },
    { id: 'trait', label: 'Distinctive trait NPCs react to' },
];

// ── §5 Government types ───────────────────────────────────────────────────

export const GOVERNMENTS = [
    { id: 'absolute_monarchy', label: 'Absolute monarchy', rulingLine: true, description: 'One ruler holds all power; the crown passes by blood.' },
    { id: 'council_monarchy', label: 'Council monarchy', rulingLine: true, description: 'A hereditary ruler shares power with a council of nobles or elders.' },
    { id: 'elective_monarchy', label: 'Elective monarchy', rulingLine: true, description: 'The ruler is chosen from among the great houses when the throne falls vacant.' },
    { id: 'theocracy', label: 'Theocracy', rulingLine: 'divine', description: "Clergy rule in a god's name; the high priest may be chosen by omen, election or divine bloodline." },
    { id: 'merchant_oligarchy', label: 'Merchant oligarchy', rulingLine: true, description: 'Wealthy trading houses govern through a council; power follows money.' },
    { id: 'republic', label: 'Republic', rulingLine: false, description: 'Officials are elected by some or all citizens for limited terms.' },
    { id: 'magocracy', label: 'Magocracy', rulingLine: false, description: 'The most powerful mages rule; power is proven, not inherited.' },
    { id: 'stratocracy', label: 'Stratocracy', rulingLine: false, description: 'The military governs; rank is the path to rule.' },
    { id: 'clan_confederation', label: 'Clan confederation', rulingLine: true, description: 'Independent clans unite under a high chief chosen from ruling lines.' },
    { id: 'imperial', label: 'Imperial', rulingLine: true, description: 'An emperor rules a core nation and conquered subject peoples.' },
    { id: 'hive_sovereignty', label: 'Hive Sovereignty', rulingLine: true, description: 'A Silkborn Queen rules through the Weave. Silkborn-majority nations only.' },
];

// ── §6 Culture vibes ──────────────────────────────────────────────────────

export const CULTURE_VIBES = [
    { id: 'spirituality', label: 'Spirituality / religion-focused', description: 'Faith organizes public and private life. Temples are the grandest buildings, festivals follow the holy calendar, and clergy hold social weight whatever the government. Piety is currency, and open doubt is noticed.' },
    { id: 'strength', label: 'Strength-focused', description: 'Physical power, endurance and martial skill earn respect. Disputes may be settled by contest, and leaders are expected to prove themselves. Weakness is pitied or scorned, and children are raised hard.' },
    { id: 'wealth', label: 'Wealth-focused', description: 'Status is measured in money, property and trade. Markets are the heart of every town, contracts are sacred, and nearly everything, including position, can be bought. Poverty carries shame.' },
    { id: 'intellect', label: 'Intellect-focused', description: 'Learning is the highest virtue. Libraries, academies and debate halls are centers of civic life, and advancement follows examinations or scholarship. Ignorance is treated as a personal failing.' },
    { id: 'magic', label: 'Magic-prowess-focused', description: 'Magical power defines status. Spellcasters form the upper tiers of society, magic is woven into daily infrastructure, and those without talent occupy lower rungs. Magical duels and displays settle standing.' },
    { id: 'collectivist', label: 'Collectivist', description: 'The group comes before the individual. Decisions are communal, property is often shared, and personal ambition is viewed with suspicion. Exile from the community is among the worst punishments.' },
    { id: 'technology', label: 'Technology-focused', description: 'Invention and engineering drive society. Workshops, machines and guild innovations reshape daily life, and inventors are celebrated. Tradition gives way to whatever works better.' },
    { id: 'death', label: 'Death-focused', description: '', subOptions: [
        { value: 'reverence', label: 'Reverence for the dead', description: 'Ancestors are honored, consulted and remembered. Tombs are grand, funerary rites are elaborate, and the dead remain part of family life.' },
        { value: 'bringing', label: 'Bringing death to others', description: 'Killing is sacred or glorious. Warriors, executioners or sacrificers hold honored roles, and a worthy death, given or received, is the highest achievement.' },
    ] },
    { id: 'matriarchal', label: 'Matriarchal', description: "Women hold the highest status and authority. Inheritance, leadership and property pass through the female line, and men's roles are defined in relation to it." },
    { id: 'patriarchal', label: 'Patriarchal', description: "Men hold the highest status and authority. Inheritance, leadership and property pass through the male line, and women's roles are defined in relation to it." },
    { id: 'conquest', label: 'Conquest-focused', description: "Expansion is the nation's purpose. Glory comes from taking territory, military service shapes most lives, and conquered peoples occupy lower ranks of society. Peace is treated as a pause between campaigns." },
    { id: 'pleasure', label: 'Pleasure / promiscuity-focused', description: 'Enjoyment is a central value. Feasts, art, sensuality and indulgence are celebrated openly, pleasure-houses may be respected institutions, and restraint is seen as joyless.' },
];

// ── Shared option lists ───────────────────────────────────────────────────

export const FEEDING_STANCE = [opt('feeds_freely', 'Feeds freely'), opt('restrained', 'Restrained'), opt('abstains', 'Abstains from sentient blood')];
export const VAMPIRE_TREATMENT = [opt('feared_hunted', 'Feared and hunted'), opt('unknown_mythical', 'Unknown or mythical'), opt('tolerated', 'Cautiously tolerated'), opt('integrated', 'Integrated')];
export const PURSUER_MOTIVES = [
    opt('capture', 'Capture'), opt('kill', 'Kill'), opt('reclaim', 'Reclaim something'), opt('silence', 'Silence'),
    opt('recruit_back', 'Recruit back'), opt('replace', 'Replace'), opt('seize_leadership', 'Seize or reclaim leadership'),
];
export const PURSUER_AWARENESS = [opt('unaware', 'Unaware of their location'), opt('searching_cold', 'Searching cold'), opt('closing_in', 'Closing in')];
export const FAMILY_FATES = [opt('dead', 'Dead'), opt('imprisoned', 'Imprisoned'), opt('hunting', 'Hunting the character'), opt('aiding', 'Quietly aiding the character'), opt('unknown', 'Unknown')];

// ── §2 Universal fields ───────────────────────────────────────────────────

export const ALLIES_OPTIONS = [opt('loyal', 'Loyal allies remain'), opt('scattered', 'Scattered, loyalty uncertain'), opt('abandoned', 'Fully abandoned, no remaining ties')];
export const SECRETS_OPTIONS = [opt('on', 'On — the AI creates 1–2 hidden secrets'), opt('off', 'Off')];
export const SLAVERY_OPTIONS = [opt('ai', "AI's discretion"), opt('yes', 'Yes'), opt('no', 'No — never practiced')];

/** Origins whose Time elapsed blank is required, with its label (spec §2). */
export const TIME_ELAPSED_LABELS = {
    vampire_lord: 'Time in slumber',
    freed_minion: 'Time since death',
    abandoned_champion: 'Time since the destiny was fulfilled',
};

// ── §7 The origins ────────────────────────────────────────────────────────
//
// Each origin: label, icon, summary, allowed races, pursuer policy, blanks,
// modifiers, levers, runtime rules, secret candidates, arc and tie-in.

const isOneOf = (value, list) => list.includes(value);

export const ORIGINS = {
    exiled_royal: {
        label: 'Exiled Royal',
        icon: '👑',
        summary: 'Heir to a throne, cast out. Reclaim, avenge, or renounce it.',
        races: 'any_ruling',
        nationThenNow: false,
        requiresRulingLine: true,
        pursuers: { primary: 'The usurper', secondaryAllowed: false, mode: 'always' },
        blanks: [
            { id: 'title', label: 'Title', placeholder: 'Prince, Princess, Duke, Regent, heir-queen…' },
            { id: 'successionLogic', label: 'Succession logic', placeholder: 'Why this character was heir' },
            { id: 'usurperClaim', label: "The usurper's claim to the throne", placeholder: 'Blood, conquest, council appointment, forged legitimacy…' },
            { id: 'markDescription', label: 'Mark of royalty (describe it)', multiline: true },
        ],
        family: true,
        modifiers: [
            { id: 'exileReason', label: 'Reason for exile', required: true, options: [
                opt('betrayed', 'Betrayed by a trusted ally'),
                opt('forbidden_pact', 'Forbidden pact (demon, unholy entity or forbidden magic)'),
                opt('treason', 'Committed treason'),
                opt('framed', 'Framed by a rival'),
                opt('scandal', 'Scandal'),
                opt('corrupted', 'Corrupted by an evil force'),
            ] },
            { id: 'markType', label: 'Mark of royalty type', required: true, options: [opt('heirloom', 'Heirloom'), opt('tattoo', 'Tattoo or brand'), opt('bloodline', 'Bloodline trait'), opt('magical', 'Magical signature')] },
            { id: 'kingdomStatus', label: 'Kingdom status', required: true, default: 'usurped', options: [opt('usurped', 'Standing under the usurper'), opt('civil_war', 'In civil war'), opt('destroyed', 'Destroyed')] },
            { id: 'believedDead', label: 'Kingdom believes the character dead', default: 'no', options: [opt('no', 'No'), opt('yes', 'Yes')] },
        ],
        socialLever: 'The mark of royalty, recognized by anyone familiar with the kingdom or royal heraldry.',
        personalLever: 'Active pursuit by the usurper.',
        runtimeRules: [
            'A family member\'s fate can change during play, like any other fact that is still Mutable.',
        ],
        secretCandidates: ["A family member's true allegiance", "The usurper's claim is more legitimate than the character knows", 'The exile was engineered by someone the character trusts'],
        arc: 'Reclaim, avenge, or permanently renounce the throne.',
        tieIn: "The usurper's rule, or the vacuum left by a destroyed kingdom, becomes the source of a larger threat: spreading war, a rival striking outward, or a destabilized region attracting worse things.",
    },

    vampire_lord: {
        label: 'Vampire Lord',
        icon: '🦇',
        summary: 'An ancient lord woken from slumber into a changed world.',
        races: 'vampire_only',
        nationThenNow: true,
        defaultMajorityRace: 'vampire',
        pursuers: { primary: 'Hunters or rivals of the awakened lord', secondaryAllowed: true, mode: 'vampire_lord' },
        blanks: [
            { id: 'prophecy', label: 'The prophecy', multiline: true, showIf: d => [d.modifiers.slumberPrimary, d.modifiers.slumberSecondary].includes('prophecy') },
            { id: 'catastrophe', label: 'The catastrophe avoided', multiline: true, showIf: d => [d.modifiers.slumberPrimary, d.modifiers.slumberSecondary].includes('catastrophe') },
            { id: 'cultName', label: 'Cult name and psychology', multiline: true, showIf: d => d.modifiers.awakenedBy === 'cult' },
        ],
        modifiers: [
            { id: 'slumberPrimary', label: 'Reason for slumber (primary)', required: true, options: [opt('weariness', 'Weariness — weary of an unchanging life'), opt('prophecy', 'Prophecy'), opt('catastrophe', 'Avoiding a catastrophe'), opt('hiding', 'Hiding from a rival or hunters')] },
            { id: 'slumberSecondary', label: 'Reason for slumber (secondary)', default: 'none', options: [opt('none', 'None'), opt('weariness', 'Weariness'), opt('prophecy', 'Prophecy'), opt('catastrophe', 'Avoiding a catastrophe'), opt('hiding', 'Hiding from a rival or hunters')] },
            { id: 'kingdomAtSlumber', label: "Kingdom's state at slumber", required: true, options: [opt('peace', 'Peace'), opt('mid_war', 'Mid-war'), opt('mid_overthrow', 'Mid-overthrow')] },
            { id: 'legacy', label: 'Legacy', required: true, options: [
                opt('tyranny', 'Tyranny'), opt('bloodshed', 'Bloodshed'), opt('abstainment', 'Abstainment (refused sentient blood)'),
                opt('knowledge', 'Knowledge-seeking'), opt('wealth', 'Wealth-hoarding'), opt('indulgence', 'Indulgence'),
                opt('art', 'Art and culture preservation'), opt('mythologized', 'Mythologized (remembered falsely)'),
            ] },
            { id: 'awakenedBy', label: 'What awakened them', required: true, options: [opt('adventurers', 'Adventurers, by accident'), opt('cult', 'A cult that worships them'), opt('desperate', 'Someone desperate to stop a threat')] },
            { id: 'currentTreatment', label: 'Current-era treatment of vampires', required: true, options: VAMPIRE_TREATMENT },
            { id: 'memory', label: 'Memory integrity', default: 'fragmented', options: [opt('intact', 'Intact'), opt('fragmented', 'Fragmented'), opt('mostly_lost', 'Mostly lost')] },
            { id: 'power', label: 'Power state', default: 'weakened', options: [opt('weakened', 'Weakened and recovering'), opt('intact', 'Largely intact')] },
            { id: 'feedingStance', label: 'Feeding stance', default: 'restrained', options: FEEDING_STANCE },
        ],
        socialLever: 'Legacy reputation (how the world remembers them) layered with current-era treatment (how the world treats vampires as a category).',
        personalLever: 'The Hunger, always present, with its intensity shaped by feeding stance.',
        runtimeRules: [
            { when: d => d.modifiers.legacy === 'abstainment' && d.nation.bloodFarms === 'on', text: 'Abstainment legacy with blood farms existing today: the farms were built after the slumber by successors who abandoned the legacy. Surface this openly as a twist ("the empire built this in defiance of everything you stood for").' },
            { when: d => d.modifiers.awakenedBy === 'cult', text: 'A cult worshipping an inaccurate version of the character is a strong hook. Let the character correct the myth, exploit it, or become trapped by it.' },
        ],
        secretCandidates: ['What the cult truly wants', 'The threat that awakened them grew from their own legacy', 'A gap in their memory hides something they did'],
        arc: 'Reclaim standing, confront what the legacy became, or build something different this time.',
        tieIn: "A threat born from the character's own legacy (an empire grown monstrous, a cult acting in their name) is the strongest default.",
    },

    freed_minion: {
        label: 'Freed Undead Minion',
        icon: '💀',
        summary: "A lich's servant, free at last, with their living memories returned.",
        races: 'living_no_turned',
        nationThenNow: true,
        pursuers: { primary: 'A rival former-minion', secondaryAllowed: false, mode: 'always' },
        blanks: [
            { id: 'lichName', label: "The lich's name, and why they were feared", multiline: true },
            { id: 'roleServed', label: 'Role served under the lich', placeholder: 'Soldier, guard, errand-servant…' },
            { id: 'howFreed', label: 'How they broke free', multiline: true },
            { id: 'decayAppearance', label: 'Decay appearance', multiline: true },
            { id: 'customArchetype', label: 'Custom archetype (who they were)', multiline: true, showIf: d => d.modifiers.beforeDeath === 'custom' },
        ],
        modifiers: [
            { id: 'beforeDeath', label: 'Who they were before death', required: true, options: [
                opt('soldier', 'Fallen soldier'), opt('commoner', 'Dying commoner'), opt('royal', 'Assassinated royal'), opt('tyrant', 'Fallen tyrant'), opt('custom', 'Custom'),
            ] },
            { id: 'undeadType', label: 'Undead type', required: true, options: [opt('skeleton', 'Skeleton — cannot pass as living'), opt('ghoul', 'Ghoul — passes only heavily concealed'), opt('revenant', 'Revenant — passes with light concealment')] },
            { id: 'lichStatus', label: "Lich's current status", required: true, default: 'destroyed', options: [opt('destroyed', 'Destroyed'), opt('dormant', 'Dormant or weakened'), opt('active', 'Active and searching')] },
            { id: 'decayProgression', label: 'Decay progression', required: true, options: [opt('static', 'Static'), opt('worsening', 'Worsening')] },
            { id: 'lichKnowledge', label: 'Retained lich-knowledge', required: true, options: [opt('yes', 'Yes'), opt('no', 'No')] },
            { id: 'rivalKnows', label: 'Rival knows the character is free', default: 'not_yet', options: [opt('not_yet', 'Not yet'), opt('yes', 'Yes')] },
        ],
        socialLever: 'Undead appearance. Most societies react to visible undeath with fear or violence, and passing as living (where the undead type allows it) is an ongoing concern.',
        personalLever: 'The decay clock (if worsening) and/or corruption from lich-knowledge (if retained).',
        runtimeRules: [
            { when: d => d.modifiers.beforeDeath === 'tyrant', text: 'Fallen tyrant: the arc is built around atonement, confrontation by those they wronged, or refusal to atone. Surface the people they harmed.' },
            { when: d => d.modifiers.decayProgression === 'static', text: 'Static decay: plots about urgency to pass as living do not apply.' },
            { when: d => d.modifiers.undeadType === 'skeleton', text: 'A skeleton cannot pass as living; plots about passing do not apply.' },
            { when: d => d.modifiers.lichKnowledge === 'yes', text: 'Retained lich-knowledge always carries a corruption mechanic, even a minor one.' },
            { when: d => d.modifiers.lichStatus === 'active', text: "The lich is active and searching: the rival's motive is to serve or recapture for the lich, not to become the next lich." },
        ],
        secretCandidates: ['A false memory, revealed through later events', 'Something the lich left inside them', "The rival's true reason for pursuit"],
        arc: 'Closure by archetype: confirming a sacrifice mattered, finding what became of family, confronting killers, or confronting the wronged.',
        tieIn: 'The rival former-minion becoming the next lich is the default. The world threat continues even after personal closure.',
    },

    oathbreaker: {
        label: 'Oathbreaker Knight',
        icon: '🛡️',
        summary: 'A sworn knight who broke their oath — and carries the curse for it.',
        races: 'living_turned_ok',
        nationThenNow: false,
        pursuers: { primary: "The oath-holder's agents", secondaryAllowed: false, mode: 'always' },
        blanks: [
            { id: 'oathSwornTo', label: 'Who the oath was sworn to (by name)' },
            { id: 'howBroken', label: 'How the oath was broken (the act)', multiline: true },
            { id: 'whyBroken', label: 'Why the oath was broken', multiline: true },
        ],
        modifiers: [
            { id: 'oathHolderType', label: 'The oath was sworn to', required: true, options: [opt('god', 'A god'), opt('order', 'An order'), opt('liege', 'A liege')] },
            { id: 'oathRepresented', label: 'What the oath represented', required: true, options: [
                opt('tyranny', 'Tyranny'), opt('love', 'Love'), opt('bloodshed', 'Bloodshed'), opt('justice', 'Justice'),
                opt('peace', 'Peace'), opt('protection', 'Protection'), opt('duty', 'Duty and loyalty'), opt('vengeance', 'Vengeance'),
            ] },
            { id: 'holderStatusGod', label: 'Status of the god', required: true, showIf: d => d.modifiers.oathHolderType === 'god', options: [opt('wrathful', 'Active and wrathful'), opt('silent', 'Silent'), opt('diminished', 'Diminished')] },
            { id: 'holderStatusOrder', label: 'Status of the order', required: true, showIf: d => d.modifiers.oathHolderType === 'order', options: [opt('intact', 'Intact'), opt('splintered', 'Splintered'), opt('destroyed', 'Destroyed, with remnants')] },
            { id: 'holderStatusLiege', label: 'Status of the liege', required: true, showIf: d => d.modifiers.oathHolderType === 'liege', options: [opt('ruling', 'Living and ruling'), opt('deposed', 'Deposed'), opt('dead', 'Dead, with loyalists')] },
            { id: 'believedDead', label: 'Oath-holder believes the character dead', default: 'no', options: [opt('no', 'No'), opt('yes', 'Yes')] },
            { id: 'curseType', label: 'Curse type', required: true, options: [
                opt('slow_transformation', 'Slow transformation into a monster'),
                opt('armor_lock', 'Unable to remove their armor'),
                opt('animal', 'Periodic transformation into an animal'),
                opt('compulsion', 'Compulsion to harm themselves'),
                opt('split_personality', 'A split personality that can take control'),
            ] },
            { id: 'curseSource', label: 'Curse source', required: true, options: [opt('god', 'The god'), opt('order_magic', "The order's magic"), opt('oath', 'The oath itself')] },
            { id: 'curseVisibility', label: 'Curse visibility', default: 'visible', options: [opt('visible', 'Visible'), opt('hidden', 'Hidden')] },
        ],
        socialLever: 'The visible curse, recognized by those who know the oath-holder and unsettling to others.',
        socialLeverFallback: { when: d => d.modifiers.curseVisibility === 'hidden', text: "The character's name and deed are known to the oath-holder's people as an oathbreaker's." },
        personalLever: 'The curse.',
        runtimeRules: [
            { when: d => d.modifiers.curseType === 'slow_transformation' && d.modifiers.curseVisibility === 'hidden', text: 'The hidden slow transformation becomes visible once its clock passes the halfway point.' },
            { when: d => d.modifiers.curseType === 'compulsion', text: 'Portray the compulsion as an external pull the character resists. Keep the focus on the struggle and its cost.' },
            { when: d => d.modifiers.holderStatusOrder === 'destroyed' || d.modifiers.holderStatusLiege === 'dead', text: 'The oath-holder is destroyed or dead: the Pursuer comes from remnants or loyalists and is framed as a splinter group.' },
        ],
        secretCandidates: ['What the alternate personality has done', 'The curse has a hidden purpose', 'The oath-holder engineered the breaking'],
        arc: 'Lift the curse, embrace what it is turning them into, or find a version of the oath they can live with.',
        tieIn: "The oath-holder's remaining loyalists, or whatever the oath was protecting against.",
    },

    cultist: {
        label: 'Willing Cultist',
        icon: '🕯️',
        summary: 'A former devotee who walked away — but the entity still pulls.',
        races: 'living_turned_ok',
        nationThenNow: false,
        pursuers: { primary: 'Chosen below', secondaryAllowed: true, mode: 'cultist' },
        blanks: [
            { id: 'cultName', label: 'Cult name' },
            { id: 'cultSymbol', label: 'Cult symbol or mark NPCs recognize' },
            { id: 'entity', label: "The worshipped entity's name and nature", multiline: true },
            { id: 'burdenDetail', label: 'The secret burden, specifically', multiline: true, showIf: d => d.modifiers.allegiance === 'secret' },
        ],
        modifiers: [
            { id: 'role', label: 'Role in the cult', required: true, options: [opt('leader', 'Leader'), opt('high_rank', 'High rank (priest, enforcer or recruiter)'), opt('follower', 'Follower')] },
            { id: 'orientation', label: 'What the entity is oriented around', required: true, options: [
                opt('death', 'Death'), opt('knowledge', 'Knowledge'), opt('bloodshed', 'Indiscriminate bloodshed'),
                opt('sacrifice', 'Sacrifice'), opt('magic', 'Magical prowess'), opt('souls', 'Soul-consumption'),
            ] },
            { id: 'whyLeft', label: 'Why they left', required: true, options: [opt('disillusionment', 'Disillusionment'), opt('vision', 'A vision from the entity itself')] },
            { id: 'allegiance', label: 'Current allegiance', required: true, default: 'truly_left', options: [opt('truly_left', 'Truly left'), opt('secret', 'Secretly still worshipping')] },
            { id: 'secretBurden', label: 'Secret burden', required: true, showIf: d => d.modifiers.allegiance === 'secret', options: [
                opt('consume_magic', "Consuming others' magic"), opt('sacrifice', 'Sacrifice'), opt('killing', 'Killing'), opt('forbidden_knowledge', 'Gathering forbidden knowledge by any means'),
            ] },
            { id: 'primaryPursuer', label: 'Primary pursuer', required: true, options: [
                opt('government', 'Government'), opt('bounty', 'Bounty hunters or hired muscle'), opt('cult', 'Remaining cult members'), opt('order', 'An opposing religious order'),
            ] },
            { id: 'secondaryPursuer', label: 'Secondary pursuer', default: 'none', options: [
                opt('none', 'None'), opt('government', 'Government'), opt('bounty', 'Bounty hunters or hired muscle'), opt('cult', 'Remaining cult members'), opt('order', 'An opposing religious order'),
            ] },
            { id: 'legalStatus', label: "Cult's legal status", required: true, options: [opt('illegal', 'Mostly illegal'), opt('mixed', 'Mixed'), opt('legal', 'Mostly legal')] },
        ],
        socialLever: "The cult's symbol, recognized by those who know the cult, by rival religious orders, or by authorities, depending on legal status.",
        personalLever: 'Magical dependency, always present: cravings, visions, and weakness without contact with the entity.',
        runtimeRules: [
            { when: d => isOneOf(d.modifiers.role, ['leader', 'high_rank']), text: 'Pursuers of a leader or high-ranking member seek power: reclaiming leadership, or seizing it.' },
            { when: d => d.modifiers.role === 'follower', text: 'Pursuers of a follower seek recapture or silence.' },
            { when: d => d.modifiers.legalStatus === 'legal' && [d.modifiers.primaryPursuer, d.modifiers.secondaryPursuer].includes('government'), text: 'A mostly legal cult with a government pursuer: the government targets the character for a specific crime or broken oath, not for cult membership.' },
            { when: () => true, text: "The cult's legal status is a baseline tendency; individual nations may differ when the story calls for it." },
        ],
        secretCandidates: ['The entity sent them away on purpose', 'A former cult-sibling is close to them in disguise', 'The vision that made them leave was a test'],
        arc: 'Resist or succumb to the dependency, settle accounts with former cult-siblings, and reckon with what they did as a believer.',
        tieIn: "The cult's larger goal — what the entity actually wants — proceeds with or without the character.",
    },

    artifact_bound: {
        label: 'Artifact-Bound Nobody',
        icon: '🗡️',
        summary: 'An ordinary person bound to an artifact with a mind of its own.',
        races: 'living_turned_ok',
        nationThenNow: false,
        pursuers: { primary: 'The original owner or faction', secondaryAllowed: false, mode: 'artifact' },
        blanks: [
            { id: 'artifactName', label: "The artifact's name, and the name it gives itself" },
            { id: 'artifactDescription', label: 'Physical description of the artifact', multiline: true },
            { id: 'howFound', label: 'How the character found it', multiline: true },
            { id: 'originalOwner', label: 'The original owner or faction', showIf: d => d.modifiers.claimants !== 'none' },
            { id: 'controllable', label: 'Are summoned or raised beings controllable?', showIf: d => d.modifiers.power === 'raising' },
            { id: 'customOccupation', label: 'Custom prior occupation', showIf: d => d.modifiers.priorOccupation === 'custom' },
        ],
        modifiers: [
            { id: 'priorOccupation', label: 'Prior occupation', required: true, options: [opt('blacksmith', 'Blacksmith'), opt('farmer', 'Farmer'), opt('thief', 'Thief'), opt('tradesman', 'Tradesman'), opt('clothes_maker', 'Clothes-maker'), opt('custom', 'Custom')] },
            { id: 'form', label: "Artifact's form", required: true, options: [opt('bladed', 'Bladed weapon'), opt('blunt', 'Blunt weapon'), opt('armor', 'Armor'), opt('jewelry', 'Jewelry or wearable'), opt('held', 'Held object (such as a lantern)'), opt('fused', 'Fused into the body')] },
            { id: 'entity', label: 'Entity within', required: true, options: [opt('god', 'A god'), opt('demon', 'A demon'), opt('person', 'A person'), opt('other', 'Something else')] },
            { id: 'personality', label: "Artifact's personality (pick 1–2)", required: true, multi: { min: 1, max: 2 }, options: [
                opt('self_important', 'Self-important, expects deference'), opt('bloodthirsty', 'Bloodthirsty, impatient without combat'),
                opt('mentor', 'Wise mentor'), opt('sassy', 'Sassy, critical of improper use'),
            ] },
            { id: 'power', label: "Artifact's power", required: true, options: [
                opt('knowledge', 'Magical knowledge'), opt('raw_power', 'Raw magical power'), opt('strength', 'Physical strength or instant combat mastery'),
                opt('raising', 'Raising the dead or summoning extradimensional beings'), opt('transformation', 'Transformation'),
            ] },
            { id: 'cost', label: 'Cost of use', required: true, options: [opt('memories', 'Memories'), opt('blood', "Blood (own or others')"), opt('fuel', 'Magical fuel'), opt('soul', "Soul-energy (own or others')")] },
            { id: 'claimants', label: 'Claimants', default: 'active', options: [opt('active', 'Original owner still active'), opt('none', 'No known claimants (no Pursuer)')] },
        ],
        socialLever: 'Detectability: the artifact can be sensed by its original owner or faction, by mages attuned to such objects, and by other bonded individuals.',
        personalLever: "The cost of use, weighed every time the power is invoked, compounded by the artifact's own agenda.",
        runtimeRules: [
            'The artifact can speak and act somewhat independently, including resisting being surrendered or discarded.',
            'Every cost escalates with use and has narrative consequences. Memory loss accumulates into gaps the character notices; blood and soul costs grow harder to pay.',
        ],
        secretCandidates: ["The entity's true agenda", 'The artifact chose the character deliberately'],
        arc: 'The relationship with the entity: trust, control, rebellion, or merging further with it.',
        tieIn: "The original owner's plans for the artifact, or what the entity wants long-term.",
    },

    abandoned_champion: {
        label: 'Abandoned Champion',
        icon: '🌅',
        summary: "A god's chosen who fulfilled their destiny — and was left behind.",
        races: 'living_turned_ok',
        nationThenNow: false,
        pursuers: { primary: 'Chosen below', secondaryAllowed: true, mode: 'champion' },
        blanks: [
            { id: 'god', label: 'The god who chose them' },
            { id: 'whoBefore', label: 'Who they were before being chosen', multiline: true },
            { id: 'destiny', label: 'The destiny they fulfilled', multiline: true, placeholder: 'Slew a great monster or evil god, ended a long war…' },
        ],
        modifiers: [
            { id: 'abandonReason', label: 'Why they were abandoned', required: true, options: [
                opt('discarded', 'Discarded by the god after use'), opt('god_gone', 'The god died or vanished'),
                opt('turned', 'The god turned against them'), opt('disowned', "The faith's institution disowned them while the god stays silent"),
            ] },
            { id: 'hunted', label: 'Hunted by those wronged', default: 'no', options: [opt('no', 'No'), opt('yes', 'Yes')] },
            { id: 'resented', label: 'Resented for not helping sooner', default: 'no', options: [opt('no', 'No'), opt('yes', 'Yes')] },
            { id: 'fadingRate', label: 'Fading rate', default: 'steady', options: [opt('slow', 'Slow'), opt('steady', 'Steady'), opt('fast', 'Fast')] },
            { id: 'replacement', label: 'Replacement champion', default: 'none', options: [opt('none', 'None'), opt('rival', 'Rival successor'), opt('hostile', 'Hostile')] },
        ],
        socialLever: 'Public reputation as "the" champion: reverence, resentment, or both. Recognized by name and deed, without a physical mark.',
        personalLever: 'The fading power, forcing the character to find who they are without it.',
        runtimeRules: [
            "The god's blessing is finite and fading, and still in progress at the start of play.",
            { when: d => d.modifiers.abandonReason === 'god_gone', text: "The god died or vanished: every pursuer is independently motivated (the faith's institution, not the god)." },
        ],
        secretCandidates: ['Whatever the destiny suppressed is resurging', "The god's real reason for abandoning them"],
        arc: 'Identity after purpose, reconciling with those who revere or resent them, and deciding what to do as the power fades.',
        tieIn: "The resurgence of what the destiny suppressed, or the consequences of the replacement champion's actions.",
    },

    defector_spy: {
        label: 'Defector Spy',
        icon: '🗝️',
        summary: 'A trained agent who walked out — and the organization still holds leverage.',
        races: 'living_turned_ok',
        nationThenNow: false,
        pursuers: { primary: 'The organization', secondaryAllowed: false, mode: 'always', leverageRequired: true },
        blanks: [
            { id: 'orgName', label: "The organization's name" },
            { id: 'coverName', label: 'The cover name they operated under' },
            { id: 'tell', label: 'Trained-observer tell', placeholder: 'A posture habit, reflex or signature technique' },
            { id: 'leverageDetail', label: 'The leverage, specifically (what or who is held)', multiline: true },
        ],
        modifiers: [
            { id: 'specialty', label: 'Specialty', required: true, options: [opt('espionage', 'Espionage'), opt('assassination', 'Assassination'), opt('both', 'Both')] },
            { id: 'affiliation', label: 'Affiliation', required: true, options: [opt('government', 'A government'), opt('independent', 'An independent organization')] },
            { id: 'reason', label: 'Reason for defecting', required: true, options: [
                opt('forced_kill', 'Forced to kill someone they cared about'),
                opt('saw_person', 'Came to see a target as a person and failed the mission'),
                opt('target_good', 'The target was so evidently good it broke them'),
                opt('harmful_ends', 'Discovered the organization serves harmful ends'),
            ] },
            { id: 'govScope', label: 'Government scope', required: true, showIf: d => d.modifiers.affiliation === 'government' && d.modifiers.reason === 'harmful_ends', options: [opt('whole', 'The whole government'), opt('rogue', 'A rogue faction within it')] },
            { id: 'orgAwareness', label: "Organization's awareness of the defection", required: true, options: [opt('knows', 'Knows'), opt('presumes_dead', 'Presumes them dead'), opt('undiscovered', 'Has not discovered it yet')] },
            { id: 'leverageType', label: 'Leverage type', required: true, options: [opt('blackmail', 'Blackmail material'), opt('hostage', 'A hostage'), opt('loved_one_inside', 'Someone they love, still inside the organization')] },
        ],
        socialLever: 'The tell, recognizable to other agents, handlers and anyone trained in the same tradition. Invisible to ordinary people.',
        personalLever: "The organization's leverage: comply to protect what they hold, or act and risk the consequence.",
        runtimeRules: [
            { when: d => d.modifiers.orgAwareness === 'undiscovered', text: 'The organization has not discovered the defection: the leverage exists but has not been used, and the character is racing the moment it is discovered.' },
            { when: d => d.race === 'silkborn', text: 'Silkborn spy: the character learned deception only through the organization\'s training. Lying costs them visible effort, and other Silkborn can sense it.' },
        ],
        secretCandidates: ['The defection was anticipated or arranged', 'The leverage is not what it seems', 'A handler is protecting them for their own reasons'],
        arc: 'Sever or resolve the leverage, confront former handlers or targets, and decide what loyalty survives.',
        tieIn: "The organization's larger operation, which the character has inside knowledge of, continues regardless.",
    },
};

export const ORIGIN_IDS = Object.keys(ORIGINS);

/** Pursuer labels for the Willing Cultist's pursuer modifiers. */
export const CULTIST_PURSUER_LABELS = {
    government: 'Government agents',
    bounty: 'Bounty hunters or hired muscle',
    cult: 'Remaining cult members',
    order: 'An opposing religious order',
};
