// ─────────────────────────────────────────────────────────────────────────
// Origin Start — onboarding wizard and generation pipeline.
//
// The panel is rendered entirely from the draft in settings.originDraft, so it
// survives refreshRenderedView() swapping the onboarding markup. Select and
// checkbox changes re-render; text input updates the draft in place and only
// refreshes the validation box (re-rendering on blur would eat the next click).
//
// Pipeline (mirrors Instant Action):
//   configuration → Origin Architect pass (JSON profile + hidden secrets)
//   → store chatStates[chatId].origin → character sheet → Player Card
//   → name-only ST persona → optional opening message.
// ─────────────────────────────────────────────────────────────────────────

import { getSettings, saveChatState, getActiveChatId } from '../../../state-manager.js';
import { sendStateRequest } from '../../../llm-client.js';
import { escapeHtml } from '../../../memo-processor.js';
import { renderStartingGearTierOptions } from '../../../constants.js';
import {
    generateCharacterSheet, generatePersonaBio, addPlayerCardToLorebookAgent,
    activateSillyTavernPersona, getArchetypesForGenre,
} from '../../../character-creator.js';
import { applyQuickStartConfiguration, sendOutgoingChatMessage } from '../../../quickstart.js';
import { getCharacterCreationConnectionSettings } from '../../../character-creation-connection.js';
import { openCampaignSessionZero } from '../campaign/campaign-runtime.js';
import { saveSettings } from '../../app/runtime-bridge.js';
import { createChatCommitGuard } from '../../state/pass-affinity.js';
import { pickGenreCharacterName } from '../../state/character-names.js';
import { RACES, GOVERNMENTS, CULTURE_VIBES, ORIGINS, CUSTOM_RACE_FIELDS, TIME_ELAPSED_LABELS } from './origin-data.js';
import {
    createOriginDraft, normalizeOriginDraft, setDraftPath, applyDraftPatch, validateOriginDraft,
    getAllowedRaces, canBeTurned, hasThenNow, getVisibleBlanks, getVisibleModifiers, getPursuerPlan,
    vampireLordPursuerForced, vampiresHoldPower, computeLevers, getOrigin,
    buildOriginArchitectPrompts, parseOriginArchitectResponse, buildOriginRecord,
    buildOriginCharacterSheetHints, buildOriginPlayerCardHints, buildOriginOpeningMessage, formatOriginSummary,
    ORIGIN_OPTION_LISTS, ORIGIN_QUEST_COUNT_MIN, ORIGIN_QUEST_COUNT_MAX, ORIGIN_MAX_FAMILY,
} from './origin-lib.js';

const PANEL_SELECTOR = '#rt-origin-panel';
let _originRunning = false;

const esc = (v) => escapeHtml(String(v ?? ''));

function getDraft() {
    const s = getSettings();
    if (!s.originDraft || typeof s.originDraft !== 'object') s.originDraft = createOriginDraft({ level: s.onboardingLevel === 'none' ? 'none' : (s.onboardingLevel || 1), gearTier: s.onboardingGearTier || 'auto' });
    return s.originDraft;
}

function setDraft(next, { persist = true } = {}) {
    getSettings().originDraft = next;
    if (persist) saveSettings();
}

// ── Markup helpers ────────────────────────────────────────────────────────

function selectHtml(path, value, options, { placeholder = '— Choose —', required = false } = {}) {
    const opts = [`<option value="">${esc(placeholder)}${required ? ' *' : ''}</option>`]
        .concat(options.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`));
    return `<select class="text_pole rt-cr-input rt-origin-input" data-path="${esc(path)}" data-kind="select">${opts.join('')}</select>`;
}

function textHtml(path, value, { multiline = false, placeholder = 'Leave blank — AI fills it' } = {}) {
    return multiline
        ? `<textarea class="text_pole rt-cr-input rt-origin-input" data-path="${esc(path)}" data-kind="text" rows="2" style="resize:vertical;" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input class="text_pole rt-cr-input rt-origin-input" data-path="${esc(path)}" data-kind="text" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" />`;
}

function field(label, control, { wide = false, help = '' } = {}) {
    return `<div class="rt-cr-field rt-origin-field"${wide ? ' style="width:100%; flex-basis:100%;"' : ''}>
        <label class="rt-cr-label">${esc(label)}${help ? ` <span class="rt-cr-help-icon" title="${esc(help)}">?</span>` : ''}</label>
        ${control}
    </div>`;
}

function boolHtml(path, checked, label) {
    return `<label class="rt-origin-check"><input type="checkbox" data-path="${esc(path)}" data-kind="bool"${checked ? ' checked' : ''} /> <span>${esc(label)}</span></label>`;
}

function multiHtml(path, values, options, max) {
    const set = new Set(values || []);
    return `<div class="rt-origin-multi" data-max="${max}">${options.map(o => `
        <label class="rt-origin-chip${set.has(o.value) ? ' is-on' : ''}"><input type="checkbox" data-path="${esc(path)}" data-kind="multi" data-value="${esc(o.value)}" data-max="${max}"${set.has(o.value) ? ' checked' : ''} /> ${esc(o.label)}</label>`).join('')}
    </div>`;
}

function section(title, body, { id = '', open = true, subtitle = '' } = {}) {
    return `<details class="rt-origin-section"${id ? ` data-section="${esc(id)}"` : ''}${open ? ' open' : ''}>
        <summary class="rt-origin-section-title">${esc(title)}${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</summary>
        <div class="rt-origin-section-body">${body}</div>
    </details>`;
}

const row = (...fields) => `<div class="rt-cr-row rt-origin-row">${fields.join('')}</div>`;

// ── Panel rendering ───────────────────────────────────────────────────────

function renderOriginPicker(draft) {
    return `<div class="rt-origin-grid" role="group" aria-label="Choose an origin">${Object.entries(ORIGINS).map(([id, o]) => `
        <button type="button" class="rt-origin-card${draft.origin === id ? ' is-selected' : ''}" data-action="pick-origin" data-origin="${esc(id)}" aria-pressed="${draft.origin === id}">
            <span class="rt-origin-card-icon" aria-hidden="true">${o.icon}</span>
            <span class="rt-origin-card-label">${esc(o.label)}</span>
            <span class="rt-origin-card-sub">${esc(o.summary)}</span>
        </button>`).join('')}
    </div>`;
}

function renderIdentity(draft) {
    const timeLabel = TIME_ELAPSED_LABELS[draft.origin];
    return row(
        field('Name', `<div class="rt-origin-inline">${textHtml('name', draft.name)}<button type="button" class="rt-origin-mini-btn" data-action="roll-name" title="Roll a fantasy name">🎲</button></div>`),
        field('Gender & pronouns', textHtml('gender', draft.gender)),
    ) + row(
        field('Apparent age', textHtml('apparentAge', draft.apparentAge)),
        field('True age', textHtml('trueAge', draft.trueAge, { placeholder: 'For long-lived or undead characters' })),
        field('Sexual orientation', textHtml('orientation', draft.orientation, { placeholder: 'Optional' }), { help: 'Used by the relationship system and CYOA romance options.' }),
    ) + row(
        field('Current location', textHtml('currentLocation', draft.currentLocation, { placeholder: 'Where the campaign begins — AI fills if blank' }), { help: 'A region, city, or nation. Separate from the origin nation.' }),
        timeLabel ? field(timeLabel, textHtml('timeElapsed', draft.timeElapsed, { placeholder: 'e.g. 300 years — AI fills if blank' })) : '',
    );
}

function renderRace(draft) {
    const allowed = new Set(getAllowedRaces(draft.origin));
    const options = RACES.filter(r => allowed.has(r.id)).map(r => ({ value: r.id, label: r.label }));
    const race = RACES.find(r => r.id === draft.race);
    let html = row(field('Race', selectHtml('race', draft.race, options, { required: true })));
    if (race && race.id !== 'custom') html += `<div class="rt-origin-hint">${esc(race.lifespan)} · ${esc(race.habitat)} · NPCs notice: ${esc(race.notice)}</div>`;
    if (draft.race === 'silkborn') html += '<div class="rt-origin-hint">Every Silkborn character begins severed from the Weave (collective "we" speech, bluntness, a residual thread the hive may trace).</div>';
    if (draft.race === 'custom') {
        html += row(...CUSTOM_RACE_FIELDS.map(f => field(f.label, textHtml(`customRace.${f.id}`, draft.customRace[f.id], { multiline: !!f.multiline, placeholder: f.placeholder || 'Leave blank — AI fills it' }))));
        html += row(field('Living', selectHtml('customRace.living', draft.customRace.living, [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], { placeholder: '—' })));
        if (draft.origin === 'exiled_royal' && draft.customRace.living === 'no') html += boolHtml('customRace.canRule', draft.customRace.canRule, 'This non-living race can rule a nation');
    }
    if (canBeTurned(draft)) {
        html += boolHtml('turned', draft.turned, 'Turned — they were living and have since become a vampire');
        if (draft.turned) {
            html += row(
                field('Feeding stance', selectHtml('feedingStance', draft.feedingStance, ORIGIN_OPTION_LISTS.FEEDING_STANCE, { placeholder: '—' })),
                field('Vampire treatment in the current region', selectHtml('vampireTreatment', draft.vampireTreatment, ORIGIN_OPTION_LISTS.VAMPIRE_TREATMENT, { required: true })),
            );
        }
    }
    return html;
}

function renderModifier(draft, mod) {
    const path = `modifiers.${mod.id}`;
    if (mod.multi) return field(mod.label, multiHtml(path, draft.modifiers[mod.id], mod.options, mod.multi.max), { wide: true });
    return field(mod.label, selectHtml(path, draft.modifiers[mod.id], mod.options, { required: !!mod.required && mod.default === undefined, placeholder: mod.default !== undefined ? '— Default —' : '— Choose —' }));
}

function renderOriginFields(draft) {
    const origin = getOrigin(draft.origin);
    let html = `<div class="rt-origin-hint">${esc(origin.summary)} <b>Arc:</b> ${esc(origin.arc)}</div>`;
    html += row(...getVisibleModifiers(draft).map(m => renderModifier(draft, m)));
    html += getVisibleBlanks(draft).map(b => field(b.label, textHtml(`blanks.${b.id}`, draft.blanks[b.id], { multiline: !!b.multiline, placeholder: b.placeholder ? `${b.placeholder} — or leave blank` : 'Leave blank — AI fills it' }), { wide: true })).join('');

    if (origin.family) {
        const rows = draft.family.map((f, i) => row(
            field(`Relative ${i + 1}`, textHtml(`family.${i}.name`, f.name, { placeholder: 'Name' })),
            field('Relation', textHtml(`family.${i}.relation`, f.relation, { placeholder: 'Sister, uncle…' })),
            field('Fate', selectHtml(`family.${i}.fate`, f.fate, ORIGIN_OPTION_LISTS.FAMILY_FATES, { required: true })),
            `<button type="button" class="rt-origin-mini-btn" data-action="family-remove" data-index="${i}" title="Remove">✕</button>`,
        )).join('');
        html += `<div class="rt-origin-subhead">Family members (1–${ORIGIN_MAX_FAMILY}; leave empty for the AI to create them)</div>${rows}`;
        if (draft.family.length < ORIGIN_MAX_FAMILY) html += '<button type="button" class="rt-origin-mini-btn" data-action="family-add">＋ Add relative</button>';
    }

    if (draft.origin === 'vampire_lord') {
        html += vampireLordPursuerForced(draft)
            ? '<div class="rt-origin-hint">A pursuer hunts the lord (vampires are hunted, the lord slept in hiding, or was woken to stop a threat).</div>'
            : boolHtml('pursuerToggle', draft.pursuerToggle === 'on', 'Add a pursuer (optional for this lord)');
        if (getPursuerPlan(draft).length) html += boolHtml('secondaryToggle', draft.secondaryToggle === 'on', 'Add a secondary pursuer');
    }
    return html;
}

function renderNation(draft) {
    const raceOptions = RACES.filter(r => r.id !== 'custom' || draft.race === 'custom')
        .map(r => ({ value: r.id, label: r.id === 'custom' ? (draft.customRace.name || 'Custom race') : r.label }));
    const vibeOptions = CULTURE_VIBES.map(v => ({ value: v.id, label: v.label }));
    const thenNow = hasThenNow(draft);
    let html = thenNow ? '<div class="rt-origin-hint">These fields describe the nation <b>then</b> — at the time of slumber or death. The AI writes what it has become <b>now</b> (override it under Advanced).</div>' : '';
    html += row(
        field('Nation name', textHtml('nation.name', draft.nation.name)),
        field('Majority race', selectHtml('nation.majorityRace', draft.nation.majorityRace, raceOptions, { required: true })),
        field('Government', selectHtml('nation.government', draft.nation.government, GOVERNMENTS.map(g => ({ value: g.id, label: g.label })), { required: true })),
    );
    const gov = GOVERNMENTS.find(g => g.id === draft.nation.government);
    if (gov) html += `<div class="rt-origin-hint">${esc(gov.description)}</div>`;
    if (draft.nation.government === 'theocracy' && draft.origin === 'exiled_royal') html += boolHtml('nation.divineBloodline', draft.nation.divineBloodline, 'The high priesthood follows a divine bloodline');
    html += field('Culture vibes (pick 1–2)', multiHtml('nation.vibes', draft.nation.vibes, vibeOptions, 2), { wide: true });
    if (draft.nation.vibes.includes('death')) {
        const death = CULTURE_VIBES.find(v => v.id === 'death');
        html += row(field('Death-focused', selectHtml('nation.deathSub', draft.nation.deathSub, death.subOptions.map(s => ({ value: s.value, label: s.label })), { required: true })));
    }
    html += row(
        field('Environment', textHtml('nation.environment', draft.nation.environment, { placeholder: 'Default: the majority race\'s habitat' })),
        field('Slavery', selectHtml('nation.slavery', draft.nation.slavery, ORIGIN_OPTION_LISTS.SLAVERY_OPTIONS, { placeholder: '—' })),
    );
    if (draft.nation.majorityRace !== 'vampire') html += boolHtml('nation.vampireRuled', draft.nation.vampireRuled === 'yes', 'Vampires hold power in this nation');
    if (vampiresHoldPower(draft)) html += boolHtml('nation.bloodFarms', draft.nation.bloodFarms === 'on', 'Blood farms');
    return html;
}

function renderUniversal(draft) {
    return row(
        field('Allies', selectHtml('allies', draft.allies, ORIGIN_OPTION_LISTS.ALLIES_OPTIONS, { placeholder: '—' })),
        field('Origin secrets', selectHtml('secrets', draft.secrets, [{ value: 'on', label: 'On — 1–2 hidden secrets' }, { value: 'off', label: 'Off' }], { placeholder: '—' }), { help: 'The AI privately creates 1–2 secrets from your origin. You know they exist, never what they are, until play reveals them.' }),
    );
}

function renderSheet(draft) {
    const classes = [{ value: '__story__', label: '✨ AI decides' }, ...getArchetypesForGenre('fantasy').map(c => ({ value: c, label: c })), { value: '__other__', label: '📝 Other…' }];
    const levels = [{ value: 'none', label: 'N/A — No Levels' }, ...Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` }))];
    return row(
        field('Appearance', textHtml('appearance', draft.appearance, { multiline: true })),
        field('Personality', textHtml('personality', draft.personality, { multiline: true })),
    ) + row(
        field('Talents & abilities', textHtml('talents', draft.talents, { multiline: true, placeholder: 'Narrative capabilities — AI fills if blank' })),
        field('Additional', textHtml('additional', draft.additional, { multiline: true, placeholder: 'Anything else (optional)' })),
    ) + row(
        field('Class (optional)', selectHtml('className', draft.className, classes, { placeholder: '—' })),
        draft.className === '__other__' ? field('Custom class', textHtml('classOther', draft.classOther, { placeholder: 'Describe the class' })) : '',
        field('Level', selectHtml('level', String(draft.level), levels, { placeholder: '—' })),
        field('Gear tier', `<select class="text_pole rt-cr-input rt-origin-input" data-path="gearTier" data-kind="select">${renderStartingGearTierOptions(draft.gearTier || 'auto')}</select>`),
    );
}

function renderAdvanced(draft) {
    let html = '<div class="rt-origin-hint">Everything here is filled by the AI unless you write it yourself.</div>';
    for (const p of getPursuerPlan(draft)) {
        const base = `pursuerOverrides.${p.slot}`;
        const o = draft.pursuerOverrides[p.slot] || {};
        html += `<div class="rt-origin-subhead">${p.slot === 'primary' ? 'Primary' : 'Secondary'} pursuer — ${esc(p.label)}${p.leverageRequired ? ' (leverage required)' : ''}</div>`;
        html += row(
            field('Identity', textHtml(`${base}.identity`, o.identity)),
            field('Affiliation', textHtml(`${base}.affiliation`, o.affiliation)),
            field('Motive', selectHtml(`${base}.motive`, o.motive, ORIGIN_OPTION_LISTS.PURSUER_MOTIVES, { placeholder: 'AI decides' })),
        ) + row(
            field('Resources', textHtml(`${base}.resources`, o.resources)),
            field('Current awareness', selectHtml(`${base}.awareness`, o.awareness, ORIGIN_OPTION_LISTS.PURSUER_AWARENESS, { placeholder: 'AI decides' })),
            field('Leverage', textHtml(`${base}.leverage`, o.leverage)),
        );
    }
    if (hasThenNow(draft)) {
        html += '<div class="rt-origin-subhead">The nation now</div>';
        html += row(
            field('Name now', textHtml('nation.now.name', draft.nation.now.name)),
            field('Government now', textHtml('nation.now.government', draft.nation.now.government)),
            field('Culture vibes now', textHtml('nation.now.vibes', draft.nation.now.vibes)),
        );
    }
    return html;
}

function renderOutput(draft) {
    const words = [100, 150, 200, 300, 400, 500, 750, 1000].map(n => ({ value: String(n), label: `${n} words` }));
    const quests = Array.from({ length: ORIGIN_QUEST_COUNT_MAX - ORIGIN_QUEST_COUNT_MIN + 1 }, (_, i) => {
        const n = ORIGIN_QUEST_COUNT_MIN + i;
        return { value: String(n), label: `${n} quests${n === 5 ? ' (tight)' : n === 10 ? ' (long)' : ''}` };
    });
    return row(
        field('Origin arc length', selectHtml('questCount', String(draft.questCount), quests, { placeholder: '—' }), { help: 'How many personal quests the origin arc has. The campaign system plans them later.' }),
        field('Player Card length', selectHtml('wordCount', String(draft.wordCount), words, { placeholder: '—' })),
    ) + boolHtml('createStPersona', draft.createStPersona, 'Create ST Persona (name only)')
      + boolHtml('sendStarter', draft.sendStarter, 'Send starter message (the AI opens the first scene)')
      + boolHtml('beginCampaign', draft.beginCampaign, 'Set up a four-act campaign first (session zero: pursuers, pressures and secrets become clocks, factions and arcs)');
}

function renderValidation(draft) {
    const { errors, conflicts, notes, ok } = validateOriginDraft(draft);
    const levers = draft.origin && draft.race ? computeLevers(draft) : null;
    let html = '';
    if (conflicts.length) {
        html += conflicts.map(c => `<div class="rt-origin-conflict" role="alert"><div>⚠️ ${esc(c.message)}</div><div class="rt-origin-conflict-choices">${c.choices.map((ch, i) => `<button type="button" class="rt-origin-mini-btn" data-action="conflict" data-conflict="${esc(c.id)}" data-choice="${i}">${esc(ch.label)}</button>`).join('')}</div></div>`).join('');
    }
    if (errors.length) html += `<ul class="rt-origin-errors">${errors.slice(0, 8).map(e => `<li>${esc(e.message)}</li>`).join('')}${errors.length > 8 ? `<li>…and ${errors.length - 8} more</li>` : ''}</ul>`;
    if (notes.length) html += notes.map(n => `<div class="rt-origin-hint">ℹ️ ${esc(n)}</div>`).join('');
    if (levers && ok) {
        html += `<div class="rt-origin-levers"><div><b>Recognized by others:</b> ${esc(levers.social.join(' '))}</div><div><b>Pressure:</b> ${esc(levers.personal.join(' '))}</div></div>`;
    }
    return { html, ok };
}

function renderPanelBody(draft) {
    let html = `<div class="rt-origin-header">
        <button type="button" class="rt-origin-mini-btn" data-action="back">← Back</button>
        <span class="rt-origin-title">🏰 Origin Start</span>
        <button type="button" class="rt-origin-mini-btn" data-action="reset" title="Clear all fields">🗑 Reset</button>
    </div>
    <div class="rt-origin-hint">A fantasy character built from one of eight origins — each with a way others recognize them, a pressure that forces choices, pursuers, and (optionally) secrets even they don't know. Pick an origin, make the required choices, and leave any text blank for the AI to fill.</div>`;
    html += renderOriginPicker(draft);
    if (!draft.origin) return html;
    const origin = getOrigin(draft.origin);
    html += section('Identity', renderIdentity(draft), { id: 'identity' });
    html += section('Race', renderRace(draft), { id: 'race' });
    html += section(`${origin.icon} ${origin.label}`, renderOriginFields(draft), { id: 'origin' });
    html += section(hasThenNow(draft) ? 'Origin nation — then' : 'Origin nation', renderNation(draft), { id: 'nation', subtitle: 'Where they come from' });
    html += section('Allies & secrets', renderUniversal(draft), { id: 'universal' });
    html += section('Character sheet', renderSheet(draft), { id: 'sheet', open: false, subtitle: 'Optional' });
    html += section('Advanced — AI-filled', renderAdvanced(draft), { id: 'advanced', open: false, subtitle: 'Pursuers & the nation now' });
    html += section('Campaign & output', renderOutput(draft), { id: 'output' });
    const { html: validation, ok } = renderValidation(draft);
    html += `<div class="rt-origin-validation" aria-live="polite">${validation}</div>`;
    html += `<button type="button" class="rt-origin-generate-btn rt-quickstart-begin-btn" data-action="generate"${ok && !_originRunning ? '' : ' disabled'}>🏰 Begin Origin</button>`;
    html += '<div class="rt-origin-status rt-quickstart-status" aria-live="polite"></div>';
    return html;
}

function renderOriginPanel(panel) {
    const draft = normalizeOriginDraft(getDraft());
    getSettings().originDraft = draft;
    // Remember which collapsible sections the player opened/closed.
    const openState = {};
    panel.querySelectorAll('details[data-section]').forEach(d => { openState[d.dataset.section] = d.open; });
    const scroller = panel.closest('.rt-empty');
    const scrollTop = scroller?.scrollTop ?? 0;
    panel.innerHTML = renderPanelBody(draft);
    panel.querySelectorAll('details[data-section]').forEach(d => {
        if (Object.prototype.hasOwnProperty.call(openState, d.dataset.section)) d.open = openState[d.dataset.section];
    });
    if (scroller) scroller.scrollTop = scrollTop;
}

function refreshValidation(panel) {
    const draft = normalizeOriginDraft(getDraft());
    const box = panel.querySelector('.rt-origin-validation');
    const { html, ok } = renderValidation(draft);
    if (box) box.innerHTML = html;
    const btn = /** @type {HTMLButtonElement|null} */ (panel.querySelector('[data-action="generate"]'));
    if (btn) btn.disabled = !ok || _originRunning;
}

function setStatus(panel, text) {
    const el = panel?.querySelector('.rt-origin-status');
    if (el) el.textContent = text;
}

// ── Events ────────────────────────────────────────────────────────────────

function readControlValue(target, draft) {
    const kind = target.dataset.kind;
    const path = target.dataset.path;
    if (kind === 'bool') {
        const on = !!target.checked;
        // Toggles stored as strings in the draft.
        if (path === 'pursuerToggle' || path === 'secondaryToggle') return on ? 'on' : 'off';
        if (path === 'nation.vampireRuled') return on ? 'yes' : 'no';
        if (path === 'nation.bloodFarms') return on ? 'on' : 'off';
        return on;
    }
    if (kind === 'multi') {
        const current = path.split('.').reduce((acc, key) => acc?.[key], draft);
        const set = new Set(Array.isArray(current) ? current : []);
        const value = target.dataset.value;
        const max = Number(target.dataset.max) || 99;
        if (target.checked) {
            if (set.size >= max) {
                toastr['info'](`Pick at most ${max}.`, 'Origin');
                target.checked = false;
                return null;
            }
            set.add(value);
        } else {
            set.delete(value);
        }
        return [...set];
    }
    return target.value;
}

function bindOriginPanel(rootEl, panel) {
    if (panel._originBound) return;
    panel._originBound = true;

    panel.addEventListener('input', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (target?.dataset?.kind !== 'text') return;
        setDraft(setDraftPath(getDraft(), target.dataset.path, target.value), { persist: false });
        refreshValidation(panel);
    });

    panel.addEventListener('change', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (!target?.dataset?.path) return;
        if (target.dataset.kind === 'text') {
            saveSettings();
            return;
        }
        const value = readControlValue(target, getDraft());
        if (value === null) return;
        let next = setDraftPath(getDraft(), target.dataset.path, value);
        if (target.dataset.path === 'race' || target.dataset.path === 'origin') {
            // A new race resets the majority-race default so it follows the character.
            next = setDraftPath(next, 'nation.majorityRace', '');
        }
        setDraft(normalizeOriginDraft(next));
        renderOriginPanel(panel);
    });

    panel.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('[data-action]') : null);
        if (!btn || /** @type {HTMLButtonElement} */ (btn).disabled) return;
        e.preventDefault();
        const action = btn.dataset.action;
        const draft = getDraft();
        if (action === 'pick-origin') {
            const previousRace = draft.race;
            const next = normalizeOriginDraft(setDraftPath(setDraftPath(draft, 'origin', btn.dataset.origin), 'nation.majorityRace', ''));
            if (previousRace && !next.race) toastr['info'](`${RACES.find(r => r.id === previousRace)?.label || 'That race'} is not available for the ${getOrigin(next.origin).label}. Choose another race.`, 'Origin');
            setDraft(next);
            renderOriginPanel(panel);
        } else if (action === 'roll-name') {
            setDraft(setDraftPath(draft, 'name', pickGenreCharacterName('fantasy')));
            renderOriginPanel(panel);
        } else if (action === 'family-add') {
            setDraft(setDraftPath(draft, 'family', [...draft.family, { name: '', relation: '', fate: '' }]));
            renderOriginPanel(panel);
        } else if (action === 'family-remove') {
            const i = Number(btn.dataset.index);
            setDraft(setDraftPath(draft, 'family', draft.family.filter((_, idx) => idx !== i)));
            renderOriginPanel(panel);
        } else if (action === 'conflict') {
            const conflict = validateOriginDraft(draft).conflicts.find(c => c.id === btn.dataset.conflict);
            const choice = conflict?.choices[Number(btn.dataset.choice)];
            if (choice) {
                setDraft(applyDraftPatch(draft, choice.patch));
                renderOriginPanel(panel);
            }
        } else if (action === 'reset') {
            const s = getSettings();
            setDraft(createOriginDraft({ level: s.onboardingLevel === 'none' ? 'none' : (s.onboardingLevel || 1), gearTier: s.onboardingGearTier || 'auto' }));
            renderOriginPanel(panel);
        } else if (action === 'back') {
            hideOriginPanel(rootEl);
        } else if (action === 'generate') {
            void runOriginStart(rootEl);
        }
    });
}

/**
 * Open the Origin wizard inside the onboarding area.
 * @param {HTMLElement} el the .rt-empty element
 */
export function showOriginPanel(el) {
    const panel = /** @type {HTMLElement|null} */ (el?.querySelector(PANEL_SELECTOR));
    if (!panel) return;
    getSettings().originPanelOpen = true;
    for (const sel of ['.rt-onboarding-hero', '.rt-onboarding-secondary', '#rt-quickstart', '#rt-char-roll-panel']) {
        const node = /** @type {HTMLElement|null} */ (el.querySelector(sel));
        if (node) node.style.display = 'none';
    }
    panel.style.display = 'flex';
    bindOriginPanel(el, panel);
    renderOriginPanel(panel);
}

export function hideOriginPanel(el) {
    const panel = /** @type {HTMLElement|null} */ (el?.querySelector(PANEL_SELECTOR));
    getSettings().originPanelOpen = false;
    saveSettings();
    if (panel) panel.style.display = 'none';
    for (const sel of ['.rt-onboarding-hero', '.rt-onboarding-secondary', '#rt-quickstart']) {
        const node = /** @type {HTMLElement|null} */ (el?.querySelector(sel));
        if (node) node.style.display = '';
    }
}

// ── Pipeline ──────────────────────────────────────────────────────────────

function livePanel(rootEl) {
    return /** @type {HTMLElement|null} */ (document.querySelector(PANEL_SELECTOR) || rootEl?.querySelector(PANEL_SELECTOR));
}

/**
 * Run the full Origin start for the active chat.
 * @param {HTMLElement|null} rootEl
 */
export async function runOriginStart(rootEl) {
    if (_originRunning) {
        toastr['info']('Origin creation is already running. Please wait.', 'Origin');
        return;
    }
    const draft = normalizeOriginDraft(getDraft());
    const { ok, errors, conflicts } = validateOriginDraft(draft);
    if (!ok) {
        toastr['warning'](conflicts[0]?.message || errors[0]?.message || 'Finish the required choices first.', 'Origin');
        return;
    }
    const passChatId = getActiveChatId();
    if (!passChatId) {
        toastr['warning']('Open a chat first — the origin is stored per chat.', 'Origin');
        return;
    }
    const ownsChat = createChatCommitGuard(passChatId, getActiveChatId);
    const stopped = () => new Error('Origin creation stopped because the active chat changed.');

    _originRunning = true;
    const status = (text) => setStatus(livePanel(rootEl), text);
    const generateBtn = /** @type {HTMLButtonElement|null} */ (livePanel(rootEl)?.querySelector('[data-action="generate"]'));
    if (generateBtn) generateBtn.disabled = true;

    try {
        status('Enabling systems…');
        await applyQuickStartConfiguration(ownsChat);
        if (!ownsChat()) throw stopped();
        const s = getSettings();
        s.onboardingGenre = 'fantasy';
        saveSettings();

        status('The Origin Architect is shaping your past…');
        const { system, user } = buildOriginArchitectPrompts(draft, { systemPrompt: s.originArchitectSystemPrompt });
        const reply = await sendStateRequest(getCharacterCreationConnectionSettings(s), system, user, null, { debugSource: 'Origin Architect' });
        if (!ownsChat()) throw stopped();
        const profile = parseOriginArchitectResponse(reply, draft);
        const record = buildOriginRecord(draft, profile);

        if (!s.chatStates) s.chatStates = {};
        if (!s.chatStates[passChatId]) s.chatStates[passChatId] = {};
        s.chatStates[passChatId].origin = record;
        saveChatState(passChatId);

        status(`Creating ${profile.identity.name}'s character sheet…`);
        const hints = buildOriginCharacterSheetHints(record);
        const { charName } = await generateCharacterSheet({ ...hints, genre: 'fantasy' }, { chatId: passChatId, canCommit: ownsChat });
        if (!ownsChat()) throw stopped();

        status('Creating Lorebook Agent Player Card…');
        const bio = await generatePersonaBio(charName, draft.wordCount, buildOriginPlayerCardHints(record), { preferCharacterBlock: true });
        if (!ownsChat()) throw stopped();
        if (!bio) throw new Error('Player Card generation returned empty.');
        const added = await addPlayerCardToLorebookAgent(charName, bio, draft.wordCount, { chatId: passChatId, canCommit: ownsChat });
        if (!added) throw ownsChat() ? new Error('Could not add the Player Card.') : stopped();

        if (draft.createStPersona) {
            status('Creating name-only chat persona…');
            await activateSillyTavernPersona(charName, { chatId: passChatId, canCommit: ownsChat });
            if (!ownsChat()) throw stopped();
        }

        getSettings().originPanelOpen = false;
        saveSettings();
        if (draft.beginCampaign) {
            status('Session zero — building your campaign…');
            await openCampaignSessionZero({ origin: record, source: 'origin' });
            if (!ownsChat()) throw stopped();
        }
        if (draft.sendStarter) {
            status('Starting adventure…');
            sendOutgoingChatMessage(buildOriginOpeningMessage(record));
        }
        status(`Ready — ${charName}, ${record.originLabel}`);
        toastr['success'](`${charName} · ${record.originLabel}${profile.secrets.length ? ` · ${profile.secrets.length} hidden secret${profile.secrets.length > 1 ? 's' : ''}` : ''}`, 'Origin ready');
    } catch (err) {
        console.error('[Origin]', err);
        status('Ready');
        toastr['error'](`Origin creation failed: ${err?.message || err}`, 'Origin', { timeOut: 8000 });
    } finally {
        _originRunning = false;
        const panel = livePanel(rootEl);
        if (panel) refreshValidation(panel);
    }
}

// ── /origin — view (or clear) this chat's origin ──────────────────────────

/** Show the active chat's origin in a popup. Secrets appear only in Debug Mode (Q6). */
export async function showOriginSummaryPopup() {
    const s = getSettings();
    const chatId = getActiveChatId();
    const record = chatId ? s.chatStates?.[chatId]?.origin : null;
    const text = formatOriginSummary(record, { revealSecrets: !!s.debugMode });
    const { Popup } = SillyTavern.getContext();
    const html = `<div class="rt-origin-summary"><h3>🏰 Origin</h3><pre style="white-space:pre-wrap; text-align:left; font-family:inherit;">${esc(text)}</pre></div>`;
    if (Popup?.show?.text) await Popup.show.text('Origin', html);
    else alert(text);
    return text;
}

export function registerOriginSlashCommand() {
    const { SlashCommand, SlashCommandParser, ARGUMENT_TYPE, SlashCommandArgument } = SillyTavern.getContext();
    if (!SlashCommand || !SlashCommandParser) return;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'origin',
        callback: async (_args, value) => {
            const arg = String(value || '').trim().toLowerCase();
            if (arg === 'clear') {
                const chatId = getActiveChatId();
                const partition = chatId ? getSettings().chatStates?.[chatId] : null;
                if (!partition?.origin) return 'No origin recorded for this chat.';
                delete partition.origin;
                saveChatState(chatId);
                toastr['info']('Origin removed from this chat. The [ORIGIN] block will no longer be injected.', 'Origin');
                return 'cleared';
            }
            return showOriginSummaryPopup();
        },
        helpString: 'Show this chat\'s Origin profile (levers, pursuers, arc). Origin secrets are shown only in Debug Mode. <code>/origin clear</code> removes the origin from this chat.',
        returns: 'origin summary text',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'optional: "clear"',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
    }));
}
