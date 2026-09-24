import { beforeEach, describe, expect, it, vi } from 'vitest';

const llm = vi.hoisted(() => ({ reply: '{}', calls: [] }));
vi.mock('../llm-client.js', () => ({
    sendStateRequest: vi.fn(async (conn, system, user, _signal, opts) => {
        llm.calls.push({ conn, system, user, source: opts?.debugSource });
        return typeof llm.reply === 'function' ? llm.reply(system, user) : llm.reply;
    }),
}));
vi.mock('../src/app/runtime-bridge.js', () => ({
    saveSettings: vi.fn(),
    autoApplySysprompt: vi.fn(async () => {}),
}));

import { getSettings } from '../state-manager.js';
import { testExtensionSettings } from './setup.js';
import { buildLedgerFromSkeleton } from '../src/features/campaign/campaign-ledger.js';
import {
    runCampaignChroniclerPass, reconcileCampaignLedger, buildCampaignTurnInjection, getCampaign,
    peekCampaignWorldDirectives, clearCampaignWorldDirectives, getCampaignConnectionSettings, formatCampaignStatus,
} from '../src/features/campaign/campaign-runtime.js';

const SKELETON = {
    visible: { premise: 'P', tone: 'T', startingSituation: 'S', companions: [] },
    anchors: { centralQuestion: 'Q', campaignThreat: 'X', threatLayers: ['a'] },
    clocks: [{ key: 'k', owner: 'The Choir', segments: 4, onFill: { size: 'Ripple', polarity: 'negative', text: 'Bells ring' } }],
    arcs: [{ key: 'a', name: 'Bells', type: 'Main', status: 'Known', clock: 'k' }],
    seeds: [{ key: 's', planted: 'A cracked bell', intendedPayoff: 'The choir strikes', size: 'Ripple', arc: 'a' }],
};

let chat;
function setup() {
    for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    chat = [
        { is_user: false, name: 'GM', mes: 'Opening.', swipe_id: 0, extra: {} },
        { is_user: true, name: 'Seren', mes: 'I ring the bell. (( linger ))', extra: {} },
        { is_user: false, name: 'GM', mes: 'The bell cracks and a choir answers from the fog.', swipe_id: 0, extra: {} },
    ];
    globalThis.SillyTavern.getContext = () => ({
        extensionSettings: testExtensionSettings,
        chatId: 'chat-1',
        getCurrentChatId: () => 'chat-1',
        chat,
        saveChat: vi.fn(async () => {}),
        saveSettingsDebounced() {},
    });
    globalThis.toastr = { warning: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), clear: vi.fn() };
    const ledger = buildLedgerFromSkeleton(SKELETON, {});
    const s = getSettings();
    s.chatStates = { 'chat-1': { campaign: { active: true, ledger, initialLedger: JSON.parse(JSON.stringify(ledger)), lastGivenBrief: null } } };
    llm.calls.length = 0;
}

const CHRONICLE = JSON.stringify({
    ops: [
        { op: 'scene', boundary: true, tension: 2, date: 'Day 2' },
        { op: 'tick', clock: 'C01', by: 1, reason: 'the bell rang' },
        { op: 'sign', seed: 'S01', text: 'A choir answers' },
        { op: 'canon', fact: 'The harbor bell is cracked.' },
        { op: 'world_directive', text: 'Fog choirs are heard along the coast.' },
    ],
    brief: { scene: 'continuing', tension: 3, tempo: 'Flow', endOn: 'Follow the voices or not', keepHidden: ['The choir is dead'] },
});

describe('Chronicler pass', () => {
    beforeEach(setup);

    it('applies ops, writes the Pulse and a snapshot, and stores the next Brief', async () => {
        llm.reply = CHRONICLE;
        const result = await runCampaignChroniclerPass({ generationType: 'normal' });
        expect(result.ok).toBe(true);
        expect(result.pulse).toBe('<!-- PULSE | T2 | Flow | Act1·Arrival | ticks: C01 1/4 | seed+: none | sign: S01 | shift: none | check: none -->');
        const campaign = getCampaign('chat-1');
        expect(campaign.ledger.canon).toContain('The harbor bell is cracked.');
        expect(campaign.ledger.brief).toMatchObject({ tension: 3, tempo: 'Flow', endOn: 'Follow the voices or not' });
        expect(campaign.lastPulse).toBe(result.pulse);
        const snap = chat[2].extra.rpgCampaign;
        expect(snap.base.canon).not.toContain('The harbor bell is cracked.');
        expect(snap.swipes['0'].after.canon).toContain('The harbor bell is cracked.');
        expect(llm.calls[0].source).toBe('Campaign Chronicler');
        expect(llm.calls[0].user).toMatch(/NARRATOR REPLY[\s\S]*choir answers from the fog/);
        expect(llm.calls[0].user).toMatch(/PLAYER MESSAGE\nI ring the bell/);
    });

    it('does not re-chronicle the same swipe, and a failed call keeps the previous Brief', async () => {
        llm.reply = CHRONICLE;
        await runCampaignChroniclerPass({ generationType: 'normal' });
        await runCampaignChroniclerPass({ generationType: 'normal' });
        expect(llm.calls).toHaveLength(1);

        setup();
        const before = getCampaign('chat-1').ledger.brief;
        llm.reply = 'not json';
        const result = await runCampaignChroniclerPass({ generationType: 'normal' });
        expect(result.ok).toBe(false);
        expect(getCampaign('chat-1').ledger.brief).toEqual(before);
        expect(chat[2].extra.rpgCampaign).toBeUndefined();
    });

    it('a new swipe chronicles from the same base, and swiping back restores its Ledger', async () => {
        llm.reply = CHRONICLE;
        await runCampaignChroniclerPass({ generationType: 'normal' });
        chat[2].swipe_id = 1;
        reconcileCampaignLedger();
        expect(getCampaign('chat-1').ledger.canon).not.toContain('The harbor bell is cracked.'); // rolled back to base
        llm.reply = JSON.stringify({ ops: [{ op: 'canon', fact: 'The bell is silent.' }], brief: { tension: 1 } });
        await runCampaignChroniclerPass({ generationType: 'swipe' });
        expect(getCampaign('chat-1').ledger.canon).toContain('The bell is silent.');
        expect(getCampaign('chat-1').ledger.canon).not.toContain('The harbor bell is cracked.');
        chat[2].swipe_id = 0;
        reconcileCampaignLedger();
        expect(getCampaign('chat-1').ledger.canon).toContain('The harbor bell is cracked.');
        // Deleting the reply rolls back to the session-zero Ledger.
        chat.splice(2, 1);
        reconcileCampaignLedger();
        expect(getCampaign('chat-1').ledger.canon).not.toContain('The harbor bell is cracked.');
    });

    it('skips chats without an active campaign', async () => {
        getSettings().chatStates['chat-1'].campaign.active = false;
        expect(await runCampaignChroniclerPass({})).toBeNull();
        expect(llm.calls).toHaveLength(0);
    });
});

describe('turn injection', () => {
    beforeEach(setup);

    it('applies (( linger )) and (( rest )) overrides to the injected Brief', async () => {
        const turn = await buildCampaignTurnInjection('chat-1', 'We make camp. (( rest ))');
        expect(turn.block).toMatch(/^\[CAMPAIGN\]/);
        expect(turn.block).toMatch(/Rest beat/);
        expect(turn.pacingMode).toBe('downtime');
        expect(getCampaign('chat-1').lastGivenBrief.rest).toBe(true);
        expect(llm.calls).toHaveLength(0); // re-direct is off by default
    });

    it('re-directs before generation only when enabled and the plan is broken', async () => {
        getSettings().campaignRedirectEnabled = true;
        llm.reply = JSON.stringify({ brief: { scene: 'new: the lighthouse, next morning', tension: 2, tempo: 'Rush' } });
        const turn = await buildCampaignTurnInjection('chat-1', 'The next morning we head to the lighthouse.');
        expect(llm.calls[0].source).toBe('Campaign Re-direct');
        expect(turn.block).toMatch(/Scene: new: the lighthouse/);
        expect(turn.pacingMode).toBe('shorter_outputs');
    });

    it('returns null when there is no campaign', async () => {
        getSettings().chatStates['chat-1'].campaign = null;
        expect(await buildCampaignTurnInjection('chat-1', 'hi')).toBeNull();
    });
});

describe('World Progression directives and status', () => {
    beforeEach(setup);

    it('peeks and clears directives recorded by the Chronicler', async () => {
        llm.reply = CHRONICLE;
        await runCampaignChroniclerPass({});
        expect(peekCampaignWorldDirectives('chat-1')).toMatch(/Fog choirs are heard/);
        await clearCampaignWorldDirectives('chat-1');
        expect(peekCampaignWorldDirectives('chat-1')).toBeNull();
        expect(chat[2].extra.rpgCampaign.swipes['0'].after.pending.worldDirectives).toEqual([]);
    });

    it('status shows only the Visible tier unless revealed', () => {
        const campaign = getCampaign('chat-1');
        expect(formatCampaignStatus(campaign)).toMatch(/Premise: P/);
        expect(formatCampaignStatus(campaign)).not.toMatch(/The Choir/);
        expect(formatCampaignStatus(campaign, { reveal: true })).toMatch(/The Choir/);
    });

    it('each role has its own connection, with larger output for the Architect', () => {
        const s = getSettings();
        s.campaignArchitectConnectionSource = 'profile';
        s.campaignArchitectConnectionProfileId = 'big';
        expect(getCampaignConnectionSettings('architect', s)).toMatchObject({ connectionSource: 'profile', connectionProfileId: 'big', maxTokens: 16000 });
        expect(getCampaignConnectionSettings('chronicler', s)).toMatchObject({ connectionSource: 'default', maxTokens: 6000 });
    });
});
