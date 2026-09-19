import { describe, expect, it } from 'vitest';
import {
    applyDungeonMapHistorySnapshotToBook,
    collectDungeonMapHistorySnapshot,
    resolveDungeonMapFromHistorySnapshot,
} from '../dungeon-reality.js';
import {
    ensureDungeonMapHistory,
    getDungeonMapHistoryEntry,
    recordLiveDungeonMapSnapshot,
    sliceMemoAndMapHistory,
    unshiftMemoAndMapHistory,
} from '../src/state/dungeon-map-history.js';

const mappedBook = {
    entries: {
        0: {
            comment: 'Abbey Undercroft',
            content: '[CORE]A mapped site.[/CORE]\n[MAP]\n{"version":3,"site":"Abbey Undercroft","areas":[],"assets":[{"id":"ghoul","kind":"CREATURE","name":"Crypt Ghoul","location":"crypt","state":"ACTIVE","knowledge":"KNOWN","detail":"Waits.","origin":"INITIAL_MAP"}]}\n[/MAP]',
            extensions: { multihogDungeonMapOperationIds: [{ id: 'day1-a', signature: 'sig' }] },
        },
    },
};

describe('dungeon map history snapshots', () => {
    it('collects [MAP] occupancy and operation ids from location entries', () => {
        const snapshot = collectDungeonMapHistorySnapshot(mappedBook.entries, 'Camp_Locations');
        expect(snapshot).toMatchObject({ bookName: 'Camp_Locations' });
        expect(snapshot.maps).toHaveLength(1);
        expect(snapshot.maps[0].uid).toBe('0');
        expect(snapshot.maps[0].map).toContain('"state":"ACTIVE"');
        expect(snapshot.maps[0].operationIds).toEqual([{ id: 'day1-a', signature: 'sig' }]);
    });

    it('restores occupancy without rewriting CORE prose', () => {
        const snapshot = collectDungeonMapHistorySnapshot(mappedBook.entries, 'Camp_Locations');
        snapshot.maps[0].map = snapshot.maps[0].map.replace('ACTIVE', 'DESTROYED');
        const book = structuredClone(mappedBook);
        expect(applyDungeonMapHistorySnapshotToBook(book, snapshot)).toBe(true);
        expect(book.entries[0].content).toContain('[CORE]A mapped site.[/CORE]');
        expect(book.entries[0].content).toContain('"state":"DESTROYED"');
    });

    it('resolves an overlay document from a history snapshot', () => {
        const snapshot = collectDungeonMapHistorySnapshot(mappedBook.entries, 'Camp_Locations');
        const resolved = resolveDungeonMapFromHistorySnapshot(snapshot, 'Abbey Undercroft, Crypt');
        expect(resolved.document.assets[0].state).toBe('ACTIVE');
        expect(resolved.siteRoot).toBe('Abbey Undercroft');
    });

    it('keeps dungeonMapHistory aligned with memoHistory', () => {
        const settings = { memoHistory: [], dungeonMapHistory: [], historyIndex: -1 };
        const first = { bookName: 'Camp_Locations', maps: [{ uid: '0', map: 'one' }] };
        const second = { bookName: 'Camp_Locations', maps: [{ uid: '0', map: 'two' }] };
        unshiftMemoAndMapHistory(settings, 'memo-a', first);
        unshiftMemoAndMapHistory(settings, 'memo-b', second);
        expect(settings.memoHistory).toEqual(['memo-b', 'memo-a']);
        expect(getDungeonMapHistoryEntry(settings, 0).maps[0].map).toBe('two');
        sliceMemoAndMapHistory(settings, 1);
        expect(settings.memoHistory).toEqual(['memo-a']);
        expect(getDungeonMapHistoryEntry(settings, 0).maps[0].map).toBe('one');
    });

    it('pads missing map history for legacy memo stones', () => {
        const settings = { memoHistory: ['a', 'b'], historyIndex: 0 };
        ensureDungeonMapHistory(settings);
        expect(settings.dungeonMapHistory).toEqual([null, null]);
        recordLiveDungeonMapSnapshot(settings, { maps: [{ uid: '0' }] });
        expect(settings.dungeonMapHistory[0]).toEqual({ maps: [{ uid: '0' }] });
        expect(settings.dungeonMapHistory[1]).toBeNull();
    });

    it('updates the LIVE map slot when historyIndex is not 0', () => {
        const settings = {
            memoHistory: ['displaced', 'live'],
            dungeonMapHistory: [null, { bookName: 'Camp_Locations', maps: [{ uid: '0', map: 'old' }] }],
            historyIndex: 1,
        };
        const next = { bookName: 'Camp_Locations', maps: [{ uid: '0', map: 'explored' }] };
        recordLiveDungeonMapSnapshot(settings, next);
        expect(settings.dungeonMapHistory[0]).toBeNull();
        expect(settings.dungeonMapHistory[1]).toEqual(next);
    });

    it('does not invent a LIVE map slot when historyIndex is outside history', () => {
        const settings = {
            memoHistory: ['older'],
            dungeonMapHistory: [{ bookName: 'Camp_Locations', maps: [{ uid: '0', map: 'older' }] }],
            historyIndex: -1,
        };
        recordLiveDungeonMapSnapshot(settings, { bookName: 'Camp_Locations', maps: [{ uid: '0', map: 'live' }] });
        expect(settings.dungeonMapHistory).toEqual([{ bookName: 'Camp_Locations', maps: [{ uid: '0', map: 'older' }] }]);
    });
});
