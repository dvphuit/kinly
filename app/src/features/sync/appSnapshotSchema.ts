import type { BabyActivity, MedicationCatalogItem, MomActivity } from '@/features/activities';
import type { ExpenseRecord } from '@/features/expenses';
import type { GrowthFacts } from '@/features/growth';
import type { FamilyData, ProfileMode } from '@/features/profile';
import type { Reminder, ReminderOccurrenceState } from '@/features/reminders';
import type { TimelineItem, TimelineMediaItem } from '@/features/timeline';

export const APP_SNAPSHOT_GENERATION = 2 as const;

export interface AppSnapshot {
  generation: typeof APP_SNAPSHOT_GENERATION;
  exportedAt: string;
  profile: {
    familyData: FamilyData;
    profileMode: ProfileMode;
  };
  activities: {
    baby: BabyActivity[];
    mom: MomActivity[];
    medicationCatalog: MedicationCatalogItem[];
  };
  growth: GrowthFacts;
  timeline: {
    items: TimelineItem[];
  };
  expenses: {
    records: ExpenseRecord[];
    monthlyBudget: number;
  };
  reminders: {
    items: Reminder[];
    occurrenceStates: Record<string, ReminderOccurrenceState>;
    systemNotificationsEnabled: boolean;
  };
}

const GROWTH_STAGE_KEYS = ['stage_0_1', 'stage_1_5', 'stage_6_12', 'stage_13_18'] as const;
const FEEDING_METHODS = ['formula', 'breast_direct', 'breast_bottle', 'bottle', 'breast', 'other'] as const;
const SIDES = ['left', 'right', 'both'] as const;
const SLEEP_KINDS = ['nap', 'night'] as const;
const SLEEP_QUALITIES = ['restful', 'normal', 'restless'] as const;
const DIAPER_KINDS = ['wet', 'dirty', 'both'] as const;
const STOOL_COLORS = ['yellow', 'brown', 'green', 'red', 'black', 'pale'] as const;
const STOOL_FLAGS = ['mucus', 'blood'] as const;
const TEMPERATURE_SITES = ['rectal', 'ear', 'forehead', 'oral', 'axillary'] as const;
const TEMPERATURE_SYMPTOMS = ['lethargy', 'breathing', 'seizure', 'rash', 'dehydration'] as const;
const MOM_MOODS = ['great', 'good', 'neutral', 'low', 'very_low'] as const;
const MEDICATION_KINDS = ['vitamin', 'probiotic', 'medicine'] as const;
const MEDICATION_DOSE_UNITS = ['giọt', 'ml', 'gói', 'viên', 'lần xịt'] as const;
const REMINDER_TYPES = ['feeding', 'pumping', 'medicine', 'vaccination', 'appointment', 'custom'] as const;
const REMINDER_MODES = ['fixed', 'relative'] as const;
const REMINDER_REPEATS = ['none', 'daily'] as const;
const TIMELINE_TAG_TYPES = ['milestone', 'feeding', 'mom', 'health', 'general'] as const;
const TIMELINE_TYPES = ['growth', 'mom', 'daily', 'milestone'] as const;
const MEDIA_TYPES = ['photo', 'video'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isNullableOptionalString(value: unknown): boolean {
  return value === undefined || value === null || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isOptionalNonNegativeNumber(value: unknown): boolean {
  return value === undefined || isNonNegativeNumber(value);
}

function isOneOf(value: unknown, values: readonly string[]): value is string {
  return typeof value === 'string' && values.includes(value);
}

function isOptionalOneOf(value: unknown, values: readonly string[]): boolean {
  return value === undefined || isOneOf(value, values);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function hasActivityBase(value: Record<string, unknown>): boolean {
  return isString(value.id)
    && isString(value.occurredAt)
    && isString(value.createdAt)
    && isOptionalString(value.note);
}

export function isBabyActivity(value: unknown): value is BabyActivity {
  if (!isRecord(value) || !hasActivityBase(value) || value.owner !== 'baby' || !isString(value.type)) return false;

  switch (value.type) {
    case 'feeding':
      return isOptionalNonNegativeNumber(value.amountMl)
        && isOptionalNonNegativeNumber(value.durationMinutes)
        && isOptionalOneOf(value.method, FEEDING_METHODS)
        && isOptionalOneOf(value.side, SIDES);
    case 'sleep':
      return isOptionalString(value.startedAt)
        && isOptionalString(value.endedAt)
        && isNonNegativeNumber(value.durationMinutes)
        && isOptionalOneOf(value.sleepKind, SLEEP_KINDS)
        && isOptionalOneOf(value.sleepQuality, SLEEP_QUALITIES)
        && isOptionalNonNegativeNumber(value.wakeCount);
    case 'diaper':
      return isOneOf(value.diaperKind, DIAPER_KINDS)
        && (value.stoolType === undefined || (isFiniteNumber(value.stoolType) && Number.isInteger(value.stoolType) && value.stoolType >= 1 && value.stoolType <= 7))
        && isOptionalOneOf(value.stoolColor, STOOL_COLORS)
        && (value.stoolFlags === undefined || (Array.isArray(value.stoolFlags) && value.stoolFlags.every((flag) => isOneOf(flag, STOOL_FLAGS))));
    case 'medicine':
      return isString(value.name) && isOptionalString(value.dose);
    case 'temperature':
      return isFiniteNumber(value.temperatureC)
        && isOptionalOneOf(value.measurementSite, TEMPERATURE_SITES)
        && (value.symptoms === undefined || (Array.isArray(value.symptoms) && value.symptoms.every((symptom) => isOneOf(symptom, TEMPERATURE_SYMPTOMS))));
    case 'health_note':
      return true;
    default:
      return false;
  }
}

export function isMomActivity(value: unknown): value is MomActivity {
  if (!isRecord(value) || !hasActivityBase(value) || value.owner !== 'mom' || !isString(value.type)) return false;

  switch (value.type) {
    case 'pumping':
      return isNonNegativeNumber(value.amountMl) && isOneOf(value.side, SIDES);
    case 'sleep':
      return isNonNegativeNumber(value.durationMinutes);
    case 'mood':
      return isOneOf(value.mood, MOM_MOODS);
    case 'recovery_note':
      return true;
    default:
      return false;
  }
}

function isMedicationCatalogItem(value: unknown): value is MedicationCatalogItem {
  return isRecord(value)
    && isString(value.id)
    && isString(value.name)
    && isString(value.detail)
    && isOneOf(value.kind, MEDICATION_KINDS)
    && typeof value.builtIn === 'boolean'
    && isOptionalString(value.infoUrl)
    && isOptionalOneOf(value.preferredDoseUnit, MEDICATION_DOSE_UNITS)
    && isOptionalString(value.lastDose);
}

function isFamilyData(value: unknown): value is FamilyData {
  if (!isRecord(value)) return false;
  return isOptionalBoolean(value.isInitialized)
    && isString(value.childName)
    && isString(value.childFullName)
    && isString(value.birthDate)
    && isOptionalString(value.birthTime)
    && isOneOf(value.gender, ['boy', 'girl'])
    && isString(value.bloodType)
    && isString(value.childAvatar)
    && isString(value.momName)
    && isString(value.momAvatar)
    && isOptionalString(value.dadName)
    && isOptionalString(value.dadAvatar)
    && isOptionalString(value.birthWeight)
    && isOptionalString(value.birthHeight)
    && isOptionalString(value.headCircAtBirth)
    && isOptionalString(value.hospital)
    && isOptionalString(value.insuranceCode)
    && isOptionalStringArray(value.allergies)
    && isOptionalString(value.notes);
}

function isGrowthMeasurementFact(value: unknown): boolean {
  return isRecord(value)
    && isString(value.id)
    && isString(value.date)
    && isNonNegativeNumber(value.weight)
    && isNonNegativeNumber(value.height)
    && isNonNegativeNumber(value.headCirc)
    && isString(value.note)
    && (value.labelIndex === undefined || (isFiniteNumber(value.labelIndex) && Number.isInteger(value.labelIndex) && value.labelIndex >= 0));
}

function isGrowthMilestoneFact(value: unknown): boolean {
  return isRecord(value)
    && isString(value.id)
    && isOneOf(value.status, ['completed', 'in-progress', 'upcoming'])
    && (value.dateAchieved === null || isString(value.dateAchieved));
}

function isSnapshotGrowthFacts(value: unknown): value is GrowthFacts {
  if (!isRecord(value) || !isOneOf(value.currentStage, GROWTH_STAGE_KEYS)) return false;
  if (!isRecord(value.stages) || !isStringArray(value.completedHabitIds)) return false;
  return Object.entries(value.stages).every(([key, stage]) =>
    isOneOf(key, GROWTH_STAGE_KEYS)
      && isRecord(stage)
      && Array.isArray(stage.measurements)
      && stage.measurements.every(isGrowthMeasurementFact)
      && Array.isArray(stage.milestones)
      && stage.milestones.every(isGrowthMilestoneFact),
  );
}

function isTimelineMediaItem(value: unknown): value is TimelineMediaItem {
  return isRecord(value)
    && isOptionalString(value.id)
    && isOptionalString(value.url)
    && isOptionalString(value.blobId)
    && isOptionalString(value.driveFileId)
    && isOneOf(value.type, MEDIA_TYPES)
    && isOptionalString(value.name)
    && (value.focalX === undefined || isFiniteNumber(value.focalX))
    && (value.focalY === undefined || isFiniteNumber(value.focalY));
}

export function isTimelineItem(value: unknown): value is TimelineItem {
  return isRecord(value)
    && isString(value.id)
    && isOptionalOneOf(value.owner, ['baby', 'mom'])
    && isOptionalOneOf(value.stage, GROWTH_STAGE_KEYS)
    && isString(value.date)
    && isString(value.timeFormatted)
    && isString(value.time)
    && isString(value.author)
    && isString(value.authorAvatar)
    && isString(value.title)
    && isString(value.content)
    && (value.mediaItems === undefined || (Array.isArray(value.mediaItems) && value.mediaItems.every(isTimelineMediaItem)))
    && isNullableOptionalString(value.mediaUrl)
    && (value.mediaType === undefined || value.mediaType === null || isOneOf(value.mediaType, MEDIA_TYPES))
    && isStringArray(value.stats)
    && isNonNegativeNumber(value.likes)
    && isNonNegativeNumber(value.comments)
    && typeof value.userLiked === 'boolean'
    && isString(value.tag)
    && isOneOf(value.tagType, TIMELINE_TAG_TYPES)
    && isOptionalOneOf(value.type, TIMELINE_TYPES);
}

export function isExpenseRecord(value: unknown): value is ExpenseRecord {
  return isRecord(value)
    && isString(value.id)
    && isNonNegativeNumber(value.amount)
    && isString(value.category)
    && isString(value.occurredAt)
    && isOptionalString(value.note)
    && isString(value.createdAt)
    && isString(value.updatedAt);
}

function isReminder(value: unknown): value is Reminder {
  return isRecord(value)
    && isString(value.id)
    && isOneOf(value.type, REMINDER_TYPES)
    && isString(value.title)
    && typeof value.enabled === 'boolean'
    && isOneOf(value.mode, REMINDER_MODES)
    && isOptionalString(value.triggerAt)
    && isOptionalNonNegativeNumber(value.intervalMinutes)
    && isOptionalOneOf(value.repeat, REMINDER_REPEATS)
    && isOptionalString(value.quickLogAction)
    && isOptionalString(value.note)
    && isString(value.createdAt)
    && isString(value.updatedAt);
}

export function isReminderOccurrenceState(value: unknown): value is ReminderOccurrenceState {
  return isRecord(value)
    && isString(value.occurrenceId)
    && isString(value.reminderId)
    && isString(value.dueAt)
    && isOptionalString(value.surfacedAt)
    && isOptionalString(value.completedAt)
    && isOptionalString(value.snoozedUntil);
}

function isReminderOccurrenceStateMap(value: unknown): value is Record<string, ReminderOccurrenceState> {
  return isRecord(value) && Object.values(value).every(isReminderOccurrenceState);
}

export function isAppSnapshot(value: unknown): value is AppSnapshot {
  if (!isRecord(value) || value.generation !== APP_SNAPSHOT_GENERATION || !isString(value.exportedAt)) return false;

  const profile = value.profile;
  const activities = value.activities;
  const timeline = value.timeline;
  const expenses = value.expenses;
  const reminders = value.reminders;

  return isRecord(profile)
    && isFamilyData(profile.familyData)
    && isOneOf(profile.profileMode, ['baby', 'mom'])
    && isRecord(activities)
    && Array.isArray(activities.baby)
    && activities.baby.every(isBabyActivity)
    && Array.isArray(activities.mom)
    && activities.mom.every(isMomActivity)
    && Array.isArray(activities.medicationCatalog)
    && activities.medicationCatalog.every(isMedicationCatalogItem)
    && isSnapshotGrowthFacts(value.growth)
    && isRecord(timeline)
    && Array.isArray(timeline.items)
    && timeline.items.every(isTimelineItem)
    && isRecord(expenses)
    && Array.isArray(expenses.records)
    && expenses.records.every(isExpenseRecord)
    && isNonNegativeNumber(expenses.monthlyBudget)
    && isRecord(reminders)
    && Array.isArray(reminders.items)
    && reminders.items.every(isReminder)
    && isReminderOccurrenceStateMap(reminders.occurrenceStates)
    && typeof reminders.systemNotificationsEnabled === 'boolean';
}

export function parseAppSnapshot(value: unknown): AppSnapshot {
  if (!isAppSnapshot(value)) {
    throw new Error('Tệp dữ liệu BabyGrowth generation 2 bị hỏng hoặc không hợp lệ.');
  }
  return value;
}
