// ─────────────────────────────────────────────────────────────────────────
// Campaign Structure — host integration.
//
//   Session zero        openCampaignSessionZero()   intake → Architect → Visible-tier approval
//   Before generation   buildCampaignTurnInjection() Brief + OOC overrides (+ optional re-direct)
//   After generation    runCampaignChroniclerPass()  one Chronicler/Director call → Ledger ops
//                                                     → next Brief; Pulse + snapshot on the message
//   Rollback            reconcileCampaignLedger()     on swipe / delete / chat change
//   Act transitions     promptActTransition()        confirm → Architect rebuild → Interlude
//   World Progression   peek/clearCampaignWorldDirectives()
//   /campaign           status, begin, end, peek (debug)
//
// Per-chat state lives in chatStates[chatId].campaign; the Ledger for each
// reply is also snapshotted on the message (extra.rpgCampaign) so swipes and
// deletions roll the campaign back with the chat.
// ─────────────────────────────────────────────────────────────────────────

import { getSettings, saveChatState, getActiveChatId } from '../../../state-manager.js';
import { sendStateRequest } from '../../../llm-client.js';
import { escapeHtml } from '../../../memo-processor.js';
import { saveSettings, autoApplySysprompt } from '../../app/runtime-bridge.js';
import { createChatCommitGuard } from '../../state/pass-affinity.js';
import { extractJsonObject } from '../origin/origin-lib.js';
import {
    buildLedgerFromSkeleton, applyLedgerOps, normalizeBrief, parseOocOverrides, applyOverridesToBrief,
    formatPulse, buildCampaignNarratorBlock, tempoPacingMode, advanceAct, resolveLedgerForChat,
    pruneLedgerSnapshots, actProfile,
} from './campaign-ledger.js';
import {
    ARCHITECT_SYSTEM_PROMPT, buildArchitectUserPrompt,
    CHRONICLER_SYSTEM_PROMPT, buildChroniclerUserPrompt,
    ACT_TRANSITION_SYSTEM_PROMPT, buildActTransitionUserPrompt,
    CONSOLIDATE_SYSTEM_PROMPT, buildConsolidateUserPrompt,
    REDIRECT_SYSTEM_PROMPT, buildRedirectUserPrompt,
} from './campaign-prompts.js';

export const CAMPAIGN_STATE_VERSION = 1;
const LENGTHS = { short: 5, standard: 7, long: 10 };
const clone = (v) => JSON.parse(JSON.stringify(v));
const esc = (v) => escapeHtml(String(v ?? ''));
let _chroniclerRunning = false;
let _actPromptOpen = false;

// ── State ─────────────────────────────────────────────────────────────────

export function getCampaign(chatId = getActiveChatId()) {
    if (!chatId) return null;
    const c = getSettings().chatStates?.[chatId]?.campaign;
    return c && c.active ? c : null;
}

function writeCampaign(chatId, campaign) {
    const s = getSettings();
    if (!s.chatStates) s.chatStates = {};
    if (!s.chatStates[chatId]) s.chatStates[chatId] = {};
    s.chatStates[chatId].campaign = campaign;
    saveChatState(chatId);
}

/** Connection for a campaign role ('chronicler' | 'architect'); same shape every agent uses. */
export function getCampaignConnectionSettings(role, settings = getSettings()) {
    const p = role === 'architect' ? 'campaignArchitect' : 'campaignChronicler';
    return {
        connectionSource: settings[`${p}ConnectionSource`] || 'default',
        connectionProfileId: settings[`${p}ConnectionProfileId`] || '',
        completionPresetId: settings[`${p}CompletionPresetId`] || '',
        ollamaUrl: settings[`${p}OllamaUrl`] || 'http://localhost:11434',
        ollamaModel: settings[`${p}OllamaModel`] || '',
        openaiUrl: settings[`${p}OpenaiUrl`] || '',
        openaiKey: settings[`${p}OpenaiKey`] || '',
        openaiModel: settings[`${p}OpenaiModel`] || '',
        maxTokens: Math.max(1000, Number(settings[`${p}MaxTokens`]) || (role === 'architect' ? 16000 : 6000)),
        debugMode: !!settings.debugMode,
    };
}

async function callAgent(role, systemPrompt, userPrompt, debugSource) {
    const reply = await sendStateRequest(getCampaignConnectionSettings(role), systemPrompt, userPrompt, null, { debugSource });
    const parsed = extractJsonObject(reply);
    if (!parsed) throw new Error(`${debugSource} did not return valid JSON.`);
    return parsed;
}

// ── Chat helpers ──────────────────────────────────────────────────────────

const messageText = (m) => String(m?.mes ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim();

function lastAiIndex(chat) {
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i]?.is_user && !chat[i]?.is_system) return i;
    }
    return -1;
}

function formatRecent(chat, endExclusive, count, maxChars = 900) {
    return chat.slice(Math.max(0, endExclusive - count), endExclusive)
        .filter(m => !m?.is_system)
        .map(m => `${m.is_user ? 'Player' : (m.name || 'Narrator')}: ${messageText(m).slice(0, maxChars)}`)
        .join('\n\n');
}

function memoForAgents() {
    return String(getSettings().currentMemo || '').replace(/<\/?memo>/gi, '').replace(/<[^>]+>/g, ' ').trim().slice(0, 6000);
}

function questsFromMemo() {
    const m = String(getSettings().currentMemo || '').match(/\[QUESTS\]([\s\S]*?)\[\/QUESTS\]/i);
    return m ? m[1].trim().slice(0, 2000) : '';
}

async function saveChatQuietly() {
    try {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.saveChat === 'function') await ctx.saveChat();
    } catch (err) {
        console.warn('[Campaign] Could not save chat after writing the Ledger snapshot:', err);
    }
}

// ── Random events (Q18): clocks and Signs replace random interruptions ────

async function setRandomEventsSuppressed(campaign, suppress, canCommit) {
    const s = getSettings();
    if (!s.syspromptModules) s.syspromptModules = {};
    if (suppress) {
        if (s.syspromptModules.random_events !== false) {
            s.syspromptModules.random_events = false;
            campaign.suppressedRandomEvents = true;
        }
    } else if (campaign.suppressedRandomEvents) {
        s.syspromptModules.random_events = true;
        campaign.suppressedRandomEvents = false;
    } else {
        return;
    }
    saveSettings();
    try {
        await autoApplySysprompt(true, { canCommit });
    } catch (err) {
        console.warn('[Campaign] Could not re-apply the system prompt:', err);
    }
}

// ── Session zero (§18) ────────────────────────────────────────────────────

function intakeForm(origin) {
    const el = document.createElement('div');
    el.className = 'rt-campaign-intake';
    el.innerHTML = `
        <h3>🗺️ Begin a Campaign</h3>
        <p class="rt-campaign-hint">A four-act campaign in the style of Baldur's Gate 3: a Director paces every reply, factions and threats move on their own clocks, and plot turns grow from things planted earlier. You will approve only the premise, tone, starting situation and companions — everything else stays hidden.</p>
        <label>Genre and tone <small>(one or two references, e.g. "BG3 but grimmer")</small>
            <textarea class="text_pole" data-intake="tone" rows="2"></textarea></label>
        <label>Two or three things you want to encounter
            <textarea class="text_pole" data-intake="wants" rows="2"></textarea></label>
        <label>Anything that must never appear
            <textarea class="text_pole" data-intake="limits" rows="2"></textarea></label>
        <label>Starting hook <small>(optional)</small>
            <textarea class="text_pole" data-intake="hook" rows="2"></textarea></label>
        <div class="rt-campaign-row">
            <label>Campaign length
                <select class="text_pole" data-intake="length">
                    <option value="short">Tight (5 origin quests)</option>
                    <option value="standard" selected>Standard (7)</option>
                    <option value="long">Long (10)</option>
                </select></label>
            <label>Dice
                <select class="text_pole" data-intake="dice">
                    <option value="auto" selected>Automatic rolls</option>
                    <option value="physical">I roll physical dice</option>
                </select></label>
        </div>
        <label class="checkbox_label"><input type="checkbox" data-intake="protagonistDeath" /> <span>Protagonist death is possible (only at tension 5, after clear warning signs)</span></label>
        ${origin ? `<p class="rt-campaign-hint">Your origin (${esc(origin.originLabel)}) will be woven into the campaign: its pursuers, pressures and secrets become clocks, factions and arcs.</p>` : ''}`;
    return el;
}

function readIntake(el, origin) {
    const val = (k) => el.querySelector(`[data-intake="${k}"]`);
    const length = val('length')?.value || 'standard';
    return {
        tone: val('tone')?.value.trim() || '',
        wants: val('wants')?.value.trim() || '',
        limits: val('limits')?.value.trim() || '',
        hook: val('hook')?.value.trim() || '',
        length,
        originQuests: origin?.questCount || LENGTHS[length] || 7,
        dice: val('dice')?.value === 'physical' ? 'physical' : 'auto',
        protagonistDeath: !!val('protagonistDeath')?.checked,
        originSecrets: origin ? origin.selections?.secrets !== 'off' : true,
    };
}

function visibleTierForm(ledger) {
    const v = ledger.visible;
    const el = document.createElement('div');
    el.className = 'rt-campaign-visible';
    el.innerHTML = `
        <h3>🗺️ Your campaign</h3>
        <p class="rt-campaign-hint">Edit anything, regenerate, or approve. Once approved this becomes Canon, and the rest of the plan stays hidden.</p>
        <label>Premise<textarea class="text_pole" data-visible="premise" rows="3">${esc(v.premise)}</textarea></label>
        <label>Tone<textarea class="text_pole" data-visible="tone" rows="2">${esc(v.tone)}</textarea></label>
        <label>Starting situation<textarea class="text_pole" data-visible="startingSituation" rows="3">${esc(v.startingSituation)}</textarea></label>
        <div class="rt-campaign-subhead">Companions you may meet</div>
        ${v.companions.map((c, i) => `<label>${esc(c.name)}<textarea class="text_pole" data-companion="${i}" rows="2">${esc(c.surface)}</textarea></label>`).join('') || '<p class="rt-campaign-hint">(none)</p>'}`;
    return el;
}

function applyVisibleEdits(ledger, el) {
    for (const key of ['premise', 'tone', 'startingSituation']) {
        const field = el.querySelector(`[data-visible="${key}"]`);
        if (field) ledger.visible[key] = field.value.trim();
    }
    el.querySelectorAll('[data-companion]').forEach(field => {
        const c = ledger.visible.companions[Number(field.dataset.companion)];
        if (c) {
            c.surface = field.value.trim();
            const hidden = ledger.companions.find(x => x.name === c.name);
            if (hidden) hidden.surface = c.surface;
        }
    });
    return ledger;
}

/**
 * Run session zero for the active chat. Resolves true when a campaign was approved.
 * @param {{ origin?: object|null, source?: string }} [opts]
 */
export async function openCampaignSessionZero(opts = {}) {
    const chatId = getActiveChatId();
    if (!chatId) {
        toastr['warning']('Open a chat first — campaigns are stored per chat.', 'Campaign');
        return false;
    }
    const ctx = SillyTavern.getContext();
    const { Popup, POPUP_TYPE, POPUP_RESULT } = ctx;
    if (!Popup) {
        toastr['error']('This SillyTavern build has no popup API.', 'Campaign');
        return false;
    }
    const ownsChat = createChatCommitGuard(chatId, getActiveChatId);
    const s = getSettings();
    const partition = s.chatStates?.[chatId] || {};
    const origin = opts.origin !== undefined ? opts.origin : (partition.origin || null);

    if (getCampaign(chatId)) {
        const replace = await Popup.show.confirm('Replace campaign?', 'This chat already has an active campaign. Start over with a new one?');
        if (replace !== POPUP_RESULT.AFFIRMATIVE) return false;
    }

    const intakeEl = intakeForm(origin);
    const intakeResult = await new Popup(intakeEl, POPUP_TYPE.CONFIRM, '', { okButton: 'Build campaign', cancelButton: 'Cancel', wide: true, allowVerticalScrolling: true }).show();
    if (intakeResult !== POPUP_RESULT.AFFIRMATIVE) return false;
    const intake = readIntake(intakeEl, origin);

    const chat = ctx.chat || [];
    const storyMessages = chat.filter(m => !m?.is_system);
    const userPrompt = buildArchitectUserPrompt({
        intake,
        origin,
        memo: memoForAgents(),
        playerCard: partition.playerCharacter?.bio ? `${partition.playerCharacter.name}\n${partition.playerCharacter.bio}`.slice(0, 4000) : '',
        chatExcerpt: storyMessages.length > 2 ? formatRecent(storyMessages, storyMessages.length, 20, 700).slice(-9000) : '',
    });

    for (;;) {
        const toast = toastr['info']('The Architect is building your campaign…', 'Campaign', { timeOut: 0, extendedTimeOut: 0 });
        let ledger;
        try {
            const skeleton = await callAgent('architect', s.campaignArchitectSystemPrompt || ARCHITECT_SYSTEM_PROMPT, userPrompt, 'Campaign Architect');
            ledger = buildLedgerFromSkeleton(skeleton, { origin, intake });
        } catch (err) {
            toastr.clear(toast);
            console.error('[Campaign] Architect failed:', err);
            toastr['error'](`Campaign setup failed: ${err?.message || err}`, 'Campaign', { timeOut: 8000 });
            return false;
        }
        toastr.clear(toast);
        if (!ownsChat()) return false;

        const visibleEl = visibleTierForm(ledger);
        const choice = await new Popup(visibleEl, POPUP_TYPE.CONFIRM, '', {
            okButton: 'Approve & begin', cancelButton: 'Cancel', wide: true, allowVerticalScrolling: true,
            customButtons: [{ text: 'Regenerate', result: POPUP_RESULT.CUSTOM1 }],
        }).show();
        if (choice === POPUP_RESULT.CUSTOM1) continue;
        if (choice !== POPUP_RESULT.AFFIRMATIVE) return false;
        if (!ownsChat()) return false;

        applyVisibleEdits(ledger, visibleEl);
        // The approved Visible tier is Canon from now on (§12.2–12.3).
        const locked = applyLedgerOps(ledger, [
            { op: 'canon', fact: `Premise: ${ledger.visible.premise}` },
            { op: 'canon', fact: `Starting situation: ${ledger.visible.startingSituation}` },
            ...ledger.visible.companions.map(c => ({ op: 'canon', fact: `${c.name}: ${c.surface}` })),
        ]).ledger;
        locked.campaign.turnIndex = 0;
        const campaign = {
            version: CAMPAIGN_STATE_VERSION,
            active: true,
            createdAt: Date.now(),
            source: opts.source || 'manual',
            intake,
            ledger: locked,
            initialLedger: clone(locked),
            lastPulse: '',
            lastGivenBrief: null,
            suppressedRandomEvents: false,
            lastConsolidatedTurn: 0,
        };
        await setRandomEventsSuppressed(campaign, true, ownsChat);
        if (!ownsChat()) return false;
        writeCampaign(chatId, campaign);
        toastr['success']('Act 1 begins. Type /campaign any time to see your campaign.', 'Campaign');
        return true;
    }
}

export async function endCampaign(chatId = getActiveChatId()) {
    const campaign = getCampaign(chatId);
    if (!campaign) return false;
    const { Popup, POPUP_RESULT } = SillyTavern.getContext();
    const ok = await Popup.show.confirm('End campaign?', 'The Director and Chronicler stop for this chat. The Ledger is kept but no longer used.');
    if (ok !== POPUP_RESULT.AFFIRMATIVE) return false;
    campaign.active = false;
    await setRandomEventsSuppressed(campaign, false, createChatCommitGuard(chatId, getActiveChatId));
    writeCampaign(chatId, campaign);
    toastr['info']('Campaign ended for this chat.', 'Campaign');
    return true;
}

// ── Before generation: the Brief (§17.1, §5.4, Q21) ───────────────────────

const SCENE_JUMP = /\b(later that|the next (day|morning|evening)|hours (later|pass)|days (later|pass)|we (travel|set off|head) (to|for)|time skip|meanwhile|after a long)\b/i;

async function redirectBrief(campaign, brief, userText) {
    const s = getSettings();
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 25000));
    const call = callAgent('chronicler', REDIRECT_SYSTEM_PROMPT, buildRedirectUserPrompt({ ledger: campaign.ledger, brief, playerMessage: userText }), 'Campaign Re-direct')
        .then(parsed => (parsed?.brief ? normalizeBrief(parsed.brief, campaign.ledger) : null))
        .catch(err => {
            if (s.debugMode) console.warn('[Campaign] Re-direct failed; keeping the Brief:', err);
            return null;
        });
    return (await Promise.race([call, timeout])) || brief;
}

/**
 * The campaign block for this turn, or null when the chat has no campaign.
 * @returns {Promise<{ block: string, pacingMode: string|null } | null>}
 */
export async function buildCampaignTurnInjection(chatId, userText) {
    const campaign = getCampaign(chatId);
    if (!campaign?.ledger) return null;
    const ledger = campaign.ledger;
    let brief = ledger.brief || normalizeBrief({}, ledger);
    const overrides = parseOocOverrides(userText);
    const s = getSettings();
    if (s.campaignRedirectEnabled && (overrides.tempo || overrides.rest || SCENE_JUMP.test(String(userText || '')))) {
        brief = await redirectBrief(campaign, brief, userText);
    }
    brief = applyOverridesToBrief(brief, overrides);
    campaign.lastGivenBrief = brief;
    return { block: buildCampaignNarratorBlock(ledger, brief), pacingMode: tempoPacingMode(brief) };
}

// ── After generation: Chronicler + Director (§17.3, Q4, Q22) ──────────────

function writeSnapshot(msg, base, swipeId, ledger, pulse, warnings) {
    if (!msg.extra) msg.extra = {};
    const prev = msg.extra.rpgCampaign && !msg.extra.rpgCampaign.pruned ? msg.extra.rpgCampaign : null;
    msg.extra.rpgCampaign = {
        base: prev?.base || base,
        swipes: { ...(prev?.swipes || {}), [swipeId]: { after: ledger, pulse, warnings: warnings.slice(0, 12) } },
    };
}

/**
 * Record the reply and pre-write the next Brief. Never throws; a failed pass
 * keeps the previous Brief and snapshot, and the next reply retries.
 * @param {{ generationType?: string|null }} [opts]
 */
export async function runCampaignChroniclerPass(opts = {}) {
    const chatId = getActiveChatId();
    const campaign = getCampaign(chatId);
    if (!campaign || _chroniclerRunning) return null;
    const ctx = SillyTavern.getContext();
    const chat = ctx.chat || [];
    const idx = lastAiIndex(chat);
    if (idx < 0) return null;
    const msg = chat[idx];
    const swipeId = String(msg.swipe_id ?? 0);
    const existing = msg.extra?.rpgCampaign && !msg.extra.rpgCampaign.pruned ? msg.extra.rpgCampaign : null;
    if (existing?.swipes?.[swipeId]?.after && opts.generationType !== 'continue') return null;

    const ownsChat = createChatCommitGuard(chatId, getActiveChatId);
    const s = getSettings();
    _chroniclerRunning = true;
    try {
        const earlier = resolveLedgerForChat(chat.slice(0, idx), null);
        const base = clone(existing?.base || (earlier.source === 'after' || earlier.source === 'base' ? earlier.ledger : campaign.ledger));
        let playerIdx = idx - 1;
        while (playerIdx >= 0 && !chat[playerIdx]?.is_user) playerIdx--;
        const userPrompt = buildChroniclerUserPrompt({
            ledger: base,
            reply: messageText(msg).slice(0, 12000),
            playerMessage: playerIdx >= 0 ? messageText(chat[playerIdx]).slice(0, 3000) : '',
            recent: formatRecent(chat, Math.max(0, playerIdx), Number(s.campaignChroniclerLookback) || 4),
            memo: memoForAgents(),
            quests: questsFromMemo(),
            previousBrief: campaign.lastGivenBrief || base.brief,
        });
        const parsed = await callAgent('chronicler', s.campaignChroniclerSystemPrompt || CHRONICLER_SYSTEM_PROMPT, userPrompt, 'Campaign Chronicler');
        if (!ownsChat()) return null;

        const prevTension = base.campaign.tensionHistory.at(-1) ?? null;
        const result = applyLedgerOps(base, parsed.ops);
        const ledger = result.ledger;
        ledger.brief = normalizeBrief(parsed.brief || {}, ledger);
        const pulse = formatPulse(ledger, result.events, ledger.brief, prevTension);

        writeSnapshot(msg, base, swipeId, ledger, pulse, result.warnings);
        pruneLedgerSnapshots(chat, Number(s.campaignSnapshotLimit) || 12);
        campaign.ledger = ledger;
        campaign.lastPulse = pulse;
        campaign.lastGivenBrief = null;
        writeCampaign(chatId, campaign);
        await saveChatQuietly();
        if (s.debugMode) {
            console.log(`[Campaign] ${pulse}`);
            if (result.warnings.length) console.log('[Campaign] Chronicler warnings:', result.warnings);
        }

        if (result.events.actExit?.crossing) void promptActTransition(chatId);
        if ((result.events.chapterEnded || result.events.upheaval) && s.campaignConsolidateEnabled !== false) {
            await runConsolidation(chatId, ownsChat);
        }
        return { ok: true, pulse, warnings: result.warnings };
    } catch (err) {
        console.warn('[Campaign] Chronicler pass failed; keeping the previous Brief:', err);
        if (s.debugMode) toastr['warning'](`Campaign Chronicler failed: ${err?.message || err}`, 'Campaign');
        return { ok: false, error: String(err?.message || err) };
    } finally {
        _chroniclerRunning = false;
    }
}

/** Replace the newest message's snapshot for its selected swipe with the live Ledger. */
async function restampLatestSnapshot(chatId, ledger) {
    const chat = SillyTavern.getContext().chat || [];
    const idx = lastAiIndex(chat);
    if (idx < 0) return;
    const msg = chat[idx];
    const snap = msg.extra?.rpgCampaign;
    const swipeId = String(msg.swipe_id ?? 0);
    if (snap && !snap.pruned && snap.swipes?.[swipeId]) {
        snap.swipes[swipeId].after = clone(ledger);
        await saveChatQuietly();
    }
}

async function runConsolidation(chatId, ownsChat) {
    const campaign = getCampaign(chatId);
    if (!campaign) return;
    try {
        const parsed = await callAgent('chronicler', CONSOLIDATE_SYSTEM_PROMPT, buildConsolidateUserPrompt({ ledger: campaign.ledger }), 'Campaign Consolidation');
        if (!ownsChat()) return;
        const { ledger, warnings } = applyLedgerOps(campaign.ledger, parsed.ops, { scene: campaign.ledger.campaign.turnIndex });
        ledger.brief = campaign.ledger.brief;
        campaign.ledger = ledger;
        campaign.lastConsolidatedTurn = ledger.campaign.turnIndex;
        writeCampaign(chatId, campaign);
        await restampLatestSnapshot(chatId, ledger);
        if (getSettings().debugMode && warnings.length) console.log('[Campaign] Consolidation warnings:', warnings);
    } catch (err) {
        console.warn('[Campaign] Consolidation skipped:', err);
    }
}

// ── Rollback ──────────────────────────────────────────────────────────────

/** Make the live Ledger match the chat after a swipe, deletion or chat switch. */
export function reconcileCampaignLedger() {
    const chatId = getActiveChatId();
    const campaign = getCampaign(chatId);
    if (!campaign) return;
    const chat = SillyTavern.getContext().chat || [];
    const resolved = resolveLedgerForChat(chat, campaign.initialLedger);
    if (resolved.source === 'pruned' || !resolved.ledger) return;
    const next = clone(resolved.ledger);
    if (JSON.stringify(next) === JSON.stringify(campaign.ledger)) return;
    campaign.ledger = next;
    campaign.lastGivenBrief = null;
    writeCampaign(chatId, campaign);
}

// ── World Progression directives (Q8) ─────────────────────────────────────

export function peekCampaignWorldDirectives(chatId = getActiveChatId()) {
    const list = getCampaign(chatId)?.ledger?.pending?.worldDirectives || [];
    if (!list.length) return null;
    return `CAMPAIGN DIRECTIVES — these off-screen developments have happened. Reflect them in the affected locations and in Wider Currents, at location scale:\n${list.slice(-10).map(d => `- ${d}`).join('\n')}`;
}

export async function clearCampaignWorldDirectives(chatId = getActiveChatId()) {
    const campaign = getCampaign(chatId);
    if (!campaign?.ledger?.pending?.worldDirectives?.length) return;
    campaign.ledger.pending.worldDirectives = [];
    writeCampaign(chatId, campaign);
    await restampLatestSnapshot(chatId, campaign.ledger);
}

// ── Act transitions (§13) ─────────────────────────────────────────────────

export async function promptActTransition(chatId = getActiveChatId()) {
    const campaign = getCampaign(chatId);
    if (!campaign || _actPromptOpen) return false;
    const act = campaign.ledger.campaign.act;
    const { Popup, POPUP_RESULT } = SillyTavern.getContext();
    _actPromptOpen = true;
    try {
        const answer = await Popup.show.confirm(`End of Act ${act}`, `This ends Act ${act}. Unfinished threads here will resolve without you. Continue?`);
        const ownsChat = createChatCommitGuard(chatId, getActiveChatId);
        const live = getCampaign(chatId);
        if (!live || !ownsChat()) return false;
        if (answer !== POPUP_RESULT.AFFIRMATIVE) {
            if (live.ledger.pending.actExit) live.ledger.pending.actExit.crossing = false;
            live.ledger.brief = { ...live.ledger.brief, notes: [...(live.ledger.brief?.notes || []), 'The player chose not to cross yet; keep them before the point of no return with the way forward still open.'] };
            writeCampaign(chatId, live);
            return false;
        }
        const toast = toastr['info'](`The Architect is preparing Act ${Number(act) + 1}…`, 'Campaign', { timeOut: 0, extendedTimeOut: 0 });
        let parsed = {};
        try {
            parsed = await callAgent('architect', ACT_TRANSITION_SYSTEM_PROMPT, buildActTransitionUserPrompt({
                ledger: live.ledger,
                recent: formatRecent(SillyTavern.getContext().chat || [], (SillyTavern.getContext().chat || []).length, 6),
            }), 'Campaign Act Transition');
        } catch (err) {
            console.warn('[Campaign] Act transition Architect failed; advancing with code defaults:', err);
        } finally {
            toastr.clear(toast);
        }
        if (!ownsChat()) return false;
        const advanced = advanceAct(live.ledger, { dormantOutcomes: parsed.dormantOutcomes || {} });
        const { ledger } = applyLedgerOps(advanced, parsed.ops || []);
        if (parsed.brief) ledger.brief = normalizeBrief({ ...parsed.brief, actStage: 'Interlude', rest: true }, ledger);
        live.ledger = ledger;
        writeCampaign(chatId, live);
        await restampLatestSnapshot(chatId, ledger);
        toastr['success'](ledger.campaign.act === 'epilogue' ? 'The epilogue begins.' : `Act ${ledger.campaign.act} begins with an Interlude.`, 'Campaign');
        return true;
    } finally {
        _actPromptOpen = false;
    }
}

// ── /campaign ─────────────────────────────────────────────────────────────

/** Player-facing status: the Visible tier only. Debug Mode adds the Hidden tier. */
export function formatCampaignStatus(campaign, { reveal = false } = {}) {
    if (!campaign?.ledger) return 'No active campaign in this chat. Type /campaign begin to start one.';
    const l = campaign.ledger;
    const out = [];
    const act = l.campaign.act === 'epilogue' ? 'Epilogue' : `Act ${l.campaign.act}`;
    out.push(`${act}${l.campaign.inFictionDate ? ` — ${l.campaign.inFictionDate}` : ''}`);
    out.push(`Premise: ${l.visible.premise}`);
    out.push(`Tone: ${l.visible.tone}`);
    if (l.visible.companions.length) out.push(`Companions: ${l.visible.companions.map(c => `${c.name} (${c.surface})`).join('; ')}`);
    const quests = l.arcs.filter(a => ['Known', 'Active'].includes(a.status) && a.questTitle && a.surfaced).map(a => a.questTitle);
    if (quests.length) out.push(`Threads you are following: ${quests.join('; ')}`);
    if (!reveal) {
        out.push('', 'Everything else is hidden. Turn on Debug Mode and use /campaign peek to see the Ledger (spoilers).');
        return out.join('\n');
    }
    out.push('', `DEBUG — Act ${l.campaign.act} (${actProfile(l.campaign.act).name}) · stage ${l.campaign.actStage} · scene ${l.campaign.sceneCount} · tension history ${l.campaign.tensionHistory.join(',') || '—'}`);
    out.push(`Last pulse: ${campaign.lastPulse || '—'}`);
    out.push(`Next Brief: ${JSON.stringify(l.brief, null, 1)}`);
    out.push(`Ledger: ${JSON.stringify(l, null, 1)}`);
    return out.join('\n');
}

async function showStatus(reveal) {
    const campaign = getCampaign();
    const text = formatCampaignStatus(campaign, { reveal });
    const { Popup } = SillyTavern.getContext();
    const html = `<div class="rt-campaign-status"><h3>🗺️ Campaign</h3><pre style="white-space:pre-wrap; text-align:left; font-family:inherit; max-height:60vh; overflow:auto;">${esc(text)}</pre></div>`;
    if (Popup?.show?.text) await Popup.show.text('Campaign', html);
    return text;
}

export function registerCampaignSlashCommand() {
    const { SlashCommand, SlashCommandParser, ARGUMENT_TYPE, SlashCommandArgument } = SillyTavern.getContext();
    if (!SlashCommand || !SlashCommandParser) return;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'campaign',
        callback: async (_args, value) => {
            const arg = String(value || '').trim().toLowerCase();
            if (arg === 'begin') return String(await openCampaignSessionZero({ source: 'command' }));
            if (arg === 'end') return String(await endCampaign());
            if (arg === 'act') return String(await promptActTransition());
            if (arg === 'peek') {
                if (!getSettings().debugMode) {
                    toastr['info']('Turn on Debug Mode to peek at the hidden Ledger (spoilers).', 'Campaign');
                    return '';
                }
                return showStatus(true);
            }
            return showStatus(false);
        },
        helpString: 'Four-act campaign. <code>/campaign</code> shows the Visible tier; <code>/campaign begin</code> runs session zero for this chat; <code>/campaign end</code> stops it; <code>/campaign act</code> asks to cross into the next act; <code>/campaign peek</code> shows the hidden Ledger in Debug Mode.',
        returns: 'status text',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'begin | end | act | peek', isRequired: false, typeList: [ARGUMENT_TYPE.STRING] }),
        ],
    }));
}

/** Wire swipe/delete/chat-change rollback. Safe to call once at startup. */
export function installCampaignEventHandlers() {
    const { eventSource, event_types } = SillyTavern.getContext();
    if (!eventSource || !event_types) return;
    const reconcile = () => {
        try {
            reconcileCampaignLedger();
        } catch (err) {
            console.warn('[Campaign] Ledger reconcile failed:', err);
        }
    };
    for (const name of ['MESSAGE_SWIPED', 'MESSAGE_DELETED', 'CHAT_CHANGED']) {
        if (event_types[name]) eventSource.on(event_types[name], reconcile);
    }
}

/** Offer session zero after a start flow finishes (Q17a). */
export function offerCampaignSetup() {
    if (getCampaign()) return;
    toastr['info']('Click here to turn this chat into a four-act campaign (session zero).', 'Campaign', {
        timeOut: 15000,
        extendedTimeOut: 5000,
        onclick: () => { void openCampaignSessionZero({ source: 'offer' }); },
    });
}
