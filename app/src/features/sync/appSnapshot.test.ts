import { beforeEach, describe, expect, it } from 'vitest';
import { createAppSnapshotRuntime } from '@/app/lifecycle/appSnapshotRuntime';
import { useActivityStore } from '@/features/activities/store/useActivityStore';
import { initializeChildProfile, resetChildStoresToDefaults, useProfileStore } from '@/features/profile';
import { useExpenseStore } from '@/features/expenses/store/useExpenseStore';
import { useReminderStore } from '@/features/reminders/store/useReminderStore';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { useUIStore } from '@/store/useUIStore';
import {
  APP_SNAPSHOT_GENERATION,
  applyAppSnapshot,
  configureAppSnapshotRuntime,
  exportAppSnapshot,
  parseAppSnapshot,
} from './appSnapshot';

describe('appSnapshot', () => {
  beforeEach(() => {
    configureAppSnapshotRuntime(createAppSnapshotRuntime());
    resetChildStoresToDefaults();
    useActivityStore.getState().resetTrackingData();
    useExpenseStore.getState().resetTrackingData();
    useReminderStore.getState().resetTrackingData();
    useTimelineStore.setState({ timelineItems: [] });
    useUIStore.setState({ profileMode: 'baby' });
  });

  it('exports semantic generation-2 data instead of Zustand storage keys', async () => {
    initializeChildProfile({ childName: 'Bé Bơ', birthDate: '2026-08-01' });
    useUIStore.setState({ profileMode: 'mom' });
    useActivityStore.getState().addMomActivity({
      owner: 'mom',
      type: 'pumping',
      amountMl: 90,
      side: 'both',
      occurredAt: '2026-08-20T08:00:00.000Z',
    });
    useExpenseStore.getState().addExpense({
      amount: 120_000,
      category: 'Tã bỉm & vệ sinh',
      occurredAt: '2026-08-20T08:30:00.000Z',
      note: 'Tã',
    });

    const snapshot = await exportAppSnapshot(new Date('2026-08-20T09:00:00.000Z'));

    expect(snapshot.generation).toBe(APP_SNAPSHOT_GENERATION);
    expect(snapshot.exportedAt).toBe('2026-08-20T09:00:00.000Z');
    expect(snapshot.profile.familyData.childName).toBe('Bé Bơ');
    expect(snapshot.profile.profileMode).toBe('mom');
    expect(snapshot.activities.mom).toHaveLength(1);
    expect(snapshot.expenses.records).toHaveLength(1);
    expect(snapshot).not.toHaveProperty('records');
    expect(JSON.stringify(snapshot)).not.toContain('babygrowth_v');
    expect(JSON.stringify(snapshot).toLowerCase()).not.toContain('chat');
  });

  it('round-trips domain state through the snapshot boundary', async () => {
    initializeChildProfile({ childName: 'Bé Bơ', birthDate: '2026-08-01' });
    useActivityStore.getState().addBabyActivity({
      owner: 'baby',
      type: 'diaper',
      diaperKind: 'wet',
      occurredAt: '2026-08-20T07:00:00.000Z',
    });
    useExpenseStore.getState().setMonthlyBudget(7_000_000);
    useExpenseStore.getState().addExpense({
      amount: 85_000,
      category: 'Khác',
      occurredAt: '2026-08-20T07:30:00.000Z',
    });
    const snapshot = await exportAppSnapshot(new Date('2026-08-20T09:00:00.000Z'));

    expect(parseAppSnapshot(snapshot)).toEqual(snapshot);

    resetChildStoresToDefaults();
    useActivityStore.getState().resetTrackingData();
    useExpenseStore.getState().resetTrackingData();
    await applyAppSnapshot(snapshot);

    expect(useProfileStore.getState().familyData.childName).toBe('Bé Bơ');
    expect(useActivityStore.getState().babyActivities).toHaveLength(1);
    expect(useActivityStore.getState().babyActivities[0]?.type).toBe('diaper');
    expect(useExpenseStore.getState().monthlyBudget).toBe(7_000_000);
    expect(useExpenseStore.getState().expenses).toHaveLength(1);
  });

  it('rejects invalid nested domain records before they reach feature stores', async () => {
    initializeChildProfile({ childName: 'Bé Bơ', birthDate: '2026-08-01' });
    const valid = await exportAppSnapshot(new Date('2026-08-20T09:00:00.000Z'));
    const malformedSnapshots: unknown[] = [
      {
        ...valid,
        profile: {
          ...valid.profile,
          familyData: { ...valid.profile.familyData, gender: 'unknown' },
        },
      },
      {
        ...valid,
        activities: {
          ...valid.activities,
          baby: [{
            id: 'activity-bad',
            owner: 'baby',
            type: 'temperature',
            occurredAt: '2026-08-20T08:00:00.000Z',
            createdAt: '2026-08-20T08:00:00.000Z',
            temperatureC: '38.5',
          }],
        },
      },
      {
        ...valid,
        growth: {
          currentStage: 'stage_0_1',
          completedHabitIds: [],
          stages: {
            stage_0_1: {
              measurements: [{
                id: 'growth-bad',
                date: '2026-08-20',
                weight: -1,
                height: 50,
                headCirc: 35,
                note: '',
              }],
              milestones: [],
            },
          },
        },
      },
      {
        ...valid,
        timeline: { items: [{ id: 'timeline-bad' }] },
      },
      {
        ...valid,
        expenses: {
          monthlyBudget: 5_000_000,
          records: [{
            id: 'expense-bad',
            amount: -1,
            category: 'Khác',
            occurredAt: '2026-08-20T08:00:00.000Z',
            createdAt: '2026-08-20T08:00:00.000Z',
            updatedAt: '2026-08-20T08:00:00.000Z',
          }],
        },
      },
      {
        ...valid,
        reminders: {
          ...valid.reminders,
          items: [{
            id: 'reminder-bad',
            type: 'feeding',
            title: 'Feed',
            enabled: 'yes',
            mode: 'fixed',
            createdAt: '2026-08-20T08:00:00.000Z',
            updatedAt: '2026-08-20T08:00:00.000Z',
          }],
        },
      },
    ];

    for (const malformed of malformedSnapshots) {
      expect(() => parseAppSnapshot(malformed)).toThrow(/generation 2/i);
    }
  });

  it('rejects legacy or malformed snapshots at the boundary', () => {
    expect(() => parseAppSnapshot({ schemaVersion: 1, records: {} })).toThrow(/generation/i);
    expect(() => parseAppSnapshot({ generation: APP_SNAPSHOT_GENERATION })).toThrow(/generation/i);
  });
});
