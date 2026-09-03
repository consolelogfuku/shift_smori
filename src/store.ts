import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from './lib/secureStorage';
import {
  emptyPlan,
  emptySettings,
  type AppData,
  type ConflictPair,
  type Employee,
  type MonthPlan,
  type ScheduleResult,
  type Settings,
  type Skill,
  type WorkPattern,
} from './types';
import { newId } from './lib/id';
import { nextYearMonth } from './lib/dates';

export type SettingsScreen = 'employees' | 'skills' | 'patterns' | 'assignSkills' | 'assignPatterns' | 'dailyNeeds' | 'conflicts';
export type PlanScreen = 'planClosed' | 'planOffs' | 'planRoles' | 'planRun';
export type Page = SettingsScreen | PlanScreen;
export const SETTINGS_SCREENS: SettingsScreen[] = ['employees', 'skills', 'patterns', 'assignSkills', 'assignPatterns', 'dailyNeeds', 'conflicts'];
export const PLAN_SCREENS: PlanScreen[] = ['planClosed', 'planOffs', 'planRoles', 'planRun'];

/** その人のその日の状態。互いに排他 */
export type DayState = { kind: 'none' } | { kind: 'off' } | { kind: 'timeoff'; start: string; end: string } | { kind: 'fixed' };

interface UiState {
  page: Page;
  yearMonth: string;
  tutorialSeen: boolean;
}

interface Store extends AppData {
  ui: UiState;
  setPage: (p: Page) => void;
  setYearMonth: (ym: string) => void;
  setTutorialSeen: (v: boolean) => void;

  // settings
  addSkill: (name: string) => Skill;
  renameSkill: (id: string, name: string) => void;
  removeSkill: (id: string) => void;
  addWorkPattern: (p: Omit<WorkPattern, 'id'>) => WorkPattern;
  updateWorkPattern: (id: string, patch: Partial<Omit<WorkPattern, 'id'>>) => void;
  removeWorkPattern: (id: string) => void;
  addEmployee: (e: Partial<Omit<Employee, 'id'>> & { name: string }) => Employee;
  addEmployees: (list: (Partial<Omit<Employee, 'id'>> & { name: string })[]) => void;
  updateEmployee: (id: string, patch: Partial<Omit<Employee, 'id'>>) => void;
  toggleEmployeeSkill: (empId: string, skillId: string) => void;
  removeEmployee: (id: string) => void;
  addConflictPair: (a: string, b: string) => void;
  removeConflictPair: (id: string) => void;
  setDefaultHeadcount: (n: number) => void;

  // plan
  getPlan: (ym: string) => MonthPlan;
  updatePlan: (ym: string, fn: (p: MonthPlan) => MonthPlan) => void;
  toggleDayOverride: (ym: string, date: string, defaultBusiness: boolean) => void;
  setHeadcountOverride: (ym: string, date: string, n: number | null) => void;
  toggleRequestedOff: (ym: string, empId: string, date: string) => void;
  toggleFixedOn: (ym: string, empId: string, date: string) => void;
  setDayState: (ym: string, empId: string, date: string, state: DayState) => void;
  getDayState: (plan: MonthPlan, empId: string, date: string) => DayState;
  setDailyRoleNeed: (skillId: string, n: number) => void;
  setRoleNeedOverride: (ym: string, date: string, skillId: string, n: number | null) => void;
  clearRoleNeedOverrides: (ym: string, date: string) => void;

  // result
  setResult: (r: ScheduleResult) => void;
  clearResult: (ym: string) => void;

  // file
  exportData: () => AppData;
  importData: (data: AppData) => void;
  resetAll: () => void;
}

function withPlan(plans: Record<string, MonthPlan>, ym: string, fn: (p: MonthPlan) => MonthPlan) {
  const base = plans[ym] ?? emptyPlan(ym);
  return { ...plans, [ym]: fn({ ...emptyPlan(ym), ...base, fixedOns: base.fixedOns ?? {}, timeOffs: base.timeOffs ?? {}, roleNeedOverrides: base.roleNeedOverrides ?? {} }) };
}

function removeTimeOff(p: MonthPlan, empId: string, date: string): MonthPlan {
  const perEmp = { ...(p.timeOffs?.[empId] ?? {}) };
  delete perEmp[date];
  const next = { ...(p.timeOffs ?? {}) };
  if (Object.keys(perEmp).length) next[empId] = perEmp;
  else delete next[empId];
  return { ...p, timeOffs: next };
}

function removeFromList(p: MonthPlan, key: 'requestedOffs' | 'fixedOns', empId: string, date: string): MonthPlan {
  const map = { ...(p[key] ?? {}) };
  const list = (map[empId] ?? []).filter((d) => d !== date);
  if (list.length) map[empId] = list;
  else delete map[empId];
  return { ...p, [key]: map };
}


export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      version: 1,
      settings: emptySettings(),
      plans: {},
      results: {},
      ui: { page: 'employees', yearMonth: nextYearMonth(), tutorialSeen: false },

      setPage: (page) => set((s) => ({ ui: { ...s.ui, page } })),
      setYearMonth: (yearMonth) => set((s) => ({ ui: { ...s.ui, yearMonth } })),
      setTutorialSeen: (tutorialSeen) => set((s) => ({ ui: { ...s.ui, tutorialSeen } })),

      addSkill: (name) => {
        const skill: Skill = { id: newId(), name: name.trim() };
        set((s) => ({ settings: { ...s.settings, skills: [...s.settings.skills, skill] } }));
        return skill;
      },
      renameSkill: (id, name) =>
        set((s) => ({
          settings: { ...s.settings, skills: s.settings.skills.map((k) => (k.id === id ? { ...k, name } : k)) },
        })),
      removeSkill: (id) =>
        set((s) => ({
          settings: {
            ...s.settings,
            skills: s.settings.skills.filter((k) => k.id !== id),
            employees: s.settings.employees.map((e) => ({ ...e, skillIds: e.skillIds.filter((x) => x !== id) })),
            dailyRoleNeeds: Object.fromEntries(Object.entries(s.settings.dailyRoleNeeds ?? {}).filter(([k]) => k !== id)),
          },
          plans: Object.fromEntries(
            Object.entries(s.plans).map(([ym, p]) => [
              ym,
              { ...p, roleNeedOverrides: Object.fromEntries(Object.entries(p.roleNeedOverrides ?? {}).map(([d, m]) => [d, Object.fromEntries(Object.entries(m).filter(([k]) => k !== id))])) },
            ]),
          ),
        })),

      addWorkPattern: (p) => {
        const wp: WorkPattern = { id: newId(), ...p };
        set((s) => ({ settings: { ...s.settings, workPatterns: [...s.settings.workPatterns, wp] } }));
        return wp;
      },
      updateWorkPattern: (id, patch) =>
        set((s) => ({
          settings: {
            ...s.settings,
            workPatterns: s.settings.workPatterns.map((w) => (w.id === id ? { ...w, ...patch } : w)),
          },
        })),
      removeWorkPattern: (id) =>
        set((s) => ({
          settings: {
            ...s.settings,
            workPatterns: s.settings.workPatterns.filter((w) => w.id !== id),
            employees: s.settings.employees.map((e) => (e.workPatternId === id ? { ...e, workPatternId: null } : e)),
          },
        })),

      addEmployee: (e) => {
        const emp: Employee = {
          id: newId(),
          name: e.name.trim(),
          skillIds: e.skillIds ?? [],
          workPatternId: e.workPatternId ?? get().settings.workPatterns[0]?.id ?? null,
          monthlyWorkDays: e.monthlyWorkDays ?? null,
        };
        set((s) => ({ settings: { ...s.settings, employees: [...s.settings.employees, emp] } }));
        return emp;
      },
      addEmployees: (list) => {
        const defaultWp = get().settings.workPatterns[0]?.id ?? null;
        const emps: Employee[] = list.map((e) => ({
          id: newId(),
          name: e.name.trim(),
          skillIds: e.skillIds ?? [],
          workPatternId: e.workPatternId ?? defaultWp,
          monthlyWorkDays: e.monthlyWorkDays ?? null,
        }));
        set((s) => ({ settings: { ...s.settings, employees: [...s.settings.employees, ...emps] } }));
      },
      updateEmployee: (id, patch) =>
        set((s) => ({
          settings: { ...s.settings, employees: s.settings.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
        })),
      toggleEmployeeSkill: (empId, skillId) =>
        set((s) => ({
          settings: {
            ...s.settings,
            employees: s.settings.employees.map((e) =>
              e.id !== empId
                ? e
                : {
                    ...e,
                    skillIds: e.skillIds.includes(skillId) ? e.skillIds.filter((x) => x !== skillId) : [...e.skillIds, skillId],
                  },
            ),
          },
        })),
      removeEmployee: (id) =>
        set((s) => {
          const strip = <T,>(m: Record<string, T>) => {
            const next = { ...m };
            delete next[id];
            return next;
          };
          return {
            settings: {
              ...s.settings,
              employees: s.settings.employees.filter((e) => e.id !== id),
              conflictPairs: s.settings.conflictPairs.filter((p) => p.a !== id && p.b !== id),
            },
            // 月ごとの希望休・出勤確定・時間の例外も消す
            plans: Object.fromEntries(
              Object.entries(s.plans).map(([ym, p]) => [
                ym,
                { ...p, requestedOffs: strip(p.requestedOffs), fixedOns: strip(p.fixedOns ?? {}), timeOffs: strip(p.timeOffs ?? {}) },
              ]),
            ),
          };
        }),

      addConflictPair: (a, b) => {
        if (a === b) return;
        const exists = get().settings.conflictPairs.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
        if (exists) return;
        const pair: ConflictPair = { id: newId(), a, b };
        set((s) => ({ settings: { ...s.settings, conflictPairs: [...s.settings.conflictPairs, pair] } }));
      },
      removeConflictPair: (id) =>
        set((s) => ({ settings: { ...s.settings, conflictPairs: s.settings.conflictPairs.filter((p) => p.id !== id) } })),
      setDefaultHeadcount: (n) => set((s) => ({ settings: { ...s.settings, office: { ...s.settings.office, defaultHeadcount: n } } })),

      getPlan: (ym) => get().plans[ym] ?? emptyPlan(ym),
      updatePlan: (ym, fn) => set((s) => ({ plans: withPlan(s.plans, ym, fn) })),
      toggleDayOverride: (ym, date, defaultBusiness) =>
        set((s) => ({
          plans: withPlan(s.plans, ym, (p) => {
            const next = { ...p.dayOverrides };
            const cur = next[date];
            if (cur) delete next[date];
            else next[date] = defaultBusiness ? 'closed' : 'open';
            return { ...p, dayOverrides: next };
          }),
        })),
      setHeadcountOverride: (ym, date, n) =>
        set((s) => ({
          plans: withPlan(s.plans, ym, (p) => {
            const next = { ...p.headcountOverrides };
            if (n === null) delete next[date];
            else next[date] = n;
            return { ...p, headcountOverrides: next };
          }),
        })),
      toggleRequestedOff: (ym, empId, date) =>
        set((s) => ({
          plans: withPlan(s.plans, ym, (p) => {
            const cur = p.requestedOffs[empId] ?? [];
            const turningOn = !cur.includes(date);
            const next = { ...p.requestedOffs };
            const nextList = turningOn ? [...cur, date].sort() : cur.filter((d) => d !== date);
            if (nextList.length) next[empId] = nextList;
            else delete next[empId];
            let out: MonthPlan = { ...p, requestedOffs: next };
            if (turningOn) {
              // 希望休にしたら出勤確定と時間の例外は外す
              out = removeFromList(out, 'fixedOns', empId, date);
              out = removeTimeOff(out, empId, date);
            }
            return out;
          }),
        })),
      toggleFixedOn: (ym, empId, date) =>
        set((s) => ({
          plans: withPlan(s.plans, ym, (p) => {
            const cur = p.fixedOns?.[empId] ?? [];
            const turningOn = !cur.includes(date);
            const next = { ...(p.fixedOns ?? {}) };
            const nextList = turningOn ? [...cur, date].sort() : cur.filter((d) => d !== date);
            if (nextList.length) next[empId] = nextList;
            else delete next[empId];
            let out: MonthPlan = { ...p, fixedOns: next };
            if (turningOn) out = removeFromList(out, 'requestedOffs', empId, date);
            else out = removeTimeOff(out, empId, date);
            return out;
          }),
        })),
      setDayState: (ym, empId, date, state) =>
        set((s) => ({
          plans: withPlan(s.plans, ym, (p) => {
            let out = removeFromList(p, 'requestedOffs', empId, date);
            out = removeFromList(out, 'fixedOns', empId, date);
            out = removeTimeOff(out, empId, date);
            const addList = (key: 'requestedOffs' | 'fixedOns') => {
              const list = [...(out[key][empId] ?? []), date].sort();
              out = { ...out, [key]: { ...out[key], [empId]: list } };
            };
            switch (state.kind) {
              case 'off':
                addList('requestedOffs');
                break;
              case 'fixed':
                addList('fixedOns');
                break;
              case 'timeoff':
                addList('fixedOns');
                out = { ...out, timeOffs: { ...out.timeOffs, [empId]: { ...(out.timeOffs[empId] ?? {}), [date]: { start: state.start, end: state.end } } } };
                break;
              case 'none':
                break;
            }
            return out;
          }),
        })),
      getDayState: (plan, empId, date) => {
        if (plan.requestedOffs[empId]?.includes(date)) return { kind: 'off' };
        const t = plan.timeOffs?.[empId]?.[date];
        if (t) return { kind: 'timeoff', start: t.start, end: t.end };
        if (plan.fixedOns?.[empId]?.includes(date)) return { kind: 'fixed' };
        return { kind: 'none' };
      },
      setDailyRoleNeed: (skillId, n) =>
        set((s) => {
          const next = { ...(s.settings.dailyRoleNeeds ?? {}) };
          if (n <= 0) delete next[skillId];
          else next[skillId] = n;
          return { settings: { ...s.settings, dailyRoleNeeds: next } };
        }),
      setRoleNeedOverride: (ym, date, skillId, n) =>
        set((s) => ({
          plans: withPlan(s.plans, ym, (p) => {
            const day = { ...(p.roleNeedOverrides[date] ?? {}) };
            if (n === null) delete day[skillId];
            else day[skillId] = n;
            const next = { ...p.roleNeedOverrides };
            if (Object.keys(day).length) next[date] = day;
            else delete next[date];
            return { ...p, roleNeedOverrides: next };
          }),
        })),
      clearRoleNeedOverrides: (ym, date) =>
        set((s) => ({
          plans: withPlan(s.plans, ym, (p) => {
            const next = { ...p.roleNeedOverrides };
            delete next[date];
            return { ...p, roleNeedOverrides: next };
          }),
        })),

      setResult: (r) => set((s) => ({ results: { ...s.results, [r.yearMonth]: r } })),
      clearResult: (ym) =>
        set((s) => {
          const next = { ...s.results };
          delete next[ym];
          return { results: next };
        }),

      exportData: () => {
        const { settings, plans, results } = get();
        return { version: 1, settings, plans, results };
      },
      importData: (data) =>
        set({
          version: 1,
          settings: { ...emptySettings(), ...data.settings, dailyRoleNeeds: data.settings.dailyRoleNeeds ?? {} },
          plans: data.plans ?? {},
          results: data.results ?? {},
        }),
      resetAll: () => set({ settings: emptySettings(), plans: {}, results: {} }),
    }),
    {
      name: 'shift-smori',
      version: 1,
      storage: createJSONStorage(() => secureStorage),
      skipHydration: true,
      partialize: (s) => ({ version: s.version, settings: s.settings, plans: s.plans, results: s.results, ui: s.ui }),
      // 古い保存データに無い項目を補う (項目が増えた後もそのまま読み込める)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppData> & { ui?: UiState };
        const normalized = parseAppData({ ...p, settings: { ...emptySettings(), ...(p.settings ?? {}) } });
        return { ...current, ...normalized, ui: { ...current.ui, ...(p.ui ?? {}) } };
      },
    },
  ),
);

/** 設定ファイルの形式チェック */
export function parseAppData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('ファイルの形式が正しくありません。');
  const obj = raw as Partial<AppData> & { settings?: Partial<Settings> };
  if (!obj.settings || typeof obj.settings !== 'object') throw new Error('設定データが見つかりません。');
  const s = obj.settings;
  const settings: Settings = {
    skills: Array.isArray(s.skills) ? s.skills : [],
    workPatterns: Array.isArray(s.workPatterns) ? s.workPatterns : [],
    employees: Array.isArray(s.employees) ? s.employees : [],
    conflictPairs: Array.isArray(s.conflictPairs) ? s.conflictPairs : [],
    office: { defaultHeadcount: Number(s.office?.defaultHeadcount ?? 5) || 5 },
    dailyRoleNeeds: s.dailyRoleNeeds && typeof s.dailyRoleNeeds === 'object' ? s.dailyRoleNeeds : {},
  };
  return {
    version: 1,
    settings,
    plans:
      obj.plans && typeof obj.plans === 'object'
        ? Object.fromEntries(Object.entries(obj.plans).map(([ym, p]) => [ym, { ...emptyPlan(ym), ...p, fixedOns: p.fixedOns ?? {}, timeOffs: p.timeOffs ?? {}, roleNeedOverrides: p.roleNeedOverrides ?? {} }]))
        : {},
    results: obj.results && typeof obj.results === 'object' ? obj.results : {},
  };
}

const emptyPlanCache = new Map<string, MonthPlan>();
/** 月のプラン。未作成なら安定した空プランを返す (毎レンダー新規生成しない) */
export function usePlan(yearMonth: string): MonthPlan {
  const p = useStore((s) => s.plans[yearMonth]);
  if (p) return p;
  let e = emptyPlanCache.get(yearMonth);
  if (!e) {
    e = emptyPlan(yearMonth);
    emptyPlanCache.set(yearMonth, e);
  }
  return e;
}
