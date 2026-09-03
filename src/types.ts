export type Id = string;

export interface Skill {
  id: Id;
  name: string;
}

export interface WorkPattern {
  id: Id;
  name: string;
  start: string; // "08:00"
  end: string; // "17:00"
}

export interface Employee {
  id: Id;
  name: string;
  skillIds: Id[];
  workPatternId: Id | null;
  /** 月の出勤日数。null なら他の人と均等に配分する */
  monthlyWorkDays: number | null;
}

export interface ConflictPair {
  id: Id;
  a: Id;
  b: Id;
}

export interface OfficeSettings {
  /** 1 日あたりの基本出勤人数 */
  defaultHeadcount: number;
}

export interface Settings {
  skills: Skill[];
  workPatterns: WorkPattern[];
  employees: Employee[];
  conflictPairs: ConflictPair[];
  office: OfficeSettings;
  /** この役割の人は毎日最低何人必要か (skillId -> 人数)。合計がその日の出勤人数 */
  dailyRoleNeeds: Record<Id, number>;
}

export interface TimeRange {
  start: string;
  end: string;
}

/** 期間内にスキル保持者が合計 personDays 人日必要 */
export interface SkillRequirement {
  id: Id;
  skillId: Id;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (inclusive)
  personDays: number;
}

export type DayOverride = 'closed' | 'open';


export interface MonthPlan {
  yearMonth: string; // YYYY-MM
  /** 手動の休業日 / 営業日の上書き */
  dayOverrides: Record<string, DayOverride>;
  headcountOverrides: Record<string, number>;
  /** employeeId -> 有給 (終日) の日付 */
  requestedOffs: Record<Id, string[]>;
  /** employeeId -> 希望出勤日 */
  fixedOns: Record<Id, string[]>;
  /** employeeId -> date -> 有給 (時間休)。その日は出勤扱いで、この時間帯だけ休む */
  timeOffs: Record<Id, Record<string, TimeRange>>;
  /** date -> skillId -> その日だけの必要人数 (未指定の役割は毎日の設定どおり) */
  roleNeedOverrides: Record<string, Record<Id, number>>;
}

export type ViolationKind = 'headcount' | 'role' | 'conflict' | 'workdays' | 'availability';

export interface Violation {
  kind: ViolationKind;
  severity: 'hard' | 'soft';
  message: string;
  dates: string[];
  employeeIds?: Id[];
  refId?: Id;
}

export interface ScheduleResult {
  yearMonth: string;
  /** date -> 出勤する employeeId */
  assignments: Record<string, Id[]>;
  violations: Violation[];
  score: number;
  seed: number;
  generatedAt: string;
  /** 作成時の設定と条件のハッシュ。変更検知に使う */
  inputHash?: string;
}

export interface AppData {
  version: 1;
  settings: Settings;
  plans: Record<string, MonthPlan>;
  results: Record<string, ScheduleResult>;
}

export const emptySettings = (): Settings => ({
  skills: [],
  workPatterns: [],
  employees: [],
  conflictPairs: [],
  office: { defaultHeadcount: 5 },
  dailyRoleNeeds: {},
});

export const emptyPlan = (yearMonth: string): MonthPlan => ({
  yearMonth,
  dayOverrides: {},
  headcountOverrides: {},
  requestedOffs: {},
  fixedOns: {},
  timeOffs: {},
  roleNeedOverrides: {},
});

/** 設定と月の条件から結果の鮮度を判定するための簡易ハッシュ */
export function hashInputs(settings: Settings, plan: MonthPlan): string {
  const str = JSON.stringify({ settings, plan });
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${str.length}:${(h >>> 0).toString(36)}`;
}
