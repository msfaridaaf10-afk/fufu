// "Explore a sample day" — clearly fictional data, kept apart from personal entries.
import { DEFAULT_SETTINGS } from './scheduler.js';

export const SAMPLE_START = '2026-11-09'; // a Monday, fixed so the demo is repeatable

export function sampleDay() {
  return {
    startDate: SAMPLE_START,
    nowMin: 17 * 60 + 30, // Monday 17:30
    label: 'Sample student (fictional) · Monday, 17:30',
    plan: {
      settings: {
        ...structuredClone(DEFAULT_SETTINGS),
        ageBand: '16-18',
        wake: '06:15',
        sleepHours: 9,
        windDown: 30,
        morning: 45,
        dailyCap: 180,
        school: { enabled: true, days: [1, 2, 3, 4, 5], start: '07:30', end: '14:30', travelBefore: 30, travelAfter: 30 },
      },
      commitments: [
        { id: 'sc-football', title: 'Football training', days: [1, 3], start: '15:30', end: '17:00' },
        { id: 'sc-dinner', title: 'Family dinner', days: [0, 1, 2, 3, 4, 5, 6], start: '19:30', end: '20:15' },
        { id: 'sc-sibling', title: 'Look after younger brother', days: [2], start: '15:30', end: '17:30' },
        { id: 'sc-tutor', title: 'Maths tutoring', days: [3], start: '16:30', end: '17:30' },
      ],
      tasks: [
        { id: 'st-bio', title: 'Biology test revision', minutes: 120, dueDate: '2026-11-10', dueTime: '08:00', priority: 'high', flexible: false, tonight: true, pins: [] },
        { id: 'st-maths', title: 'Maths worksheet', minutes: 40, dueDate: '2026-11-10', dueTime: '08:00', priority: 'high', flexible: false, tonight: true, pins: [] },
        { id: 'st-eng', title: 'English essay draft', minutes: 90, dueDate: '2026-11-12', dueTime: '08:00', priority: 'medium', flexible: true, tonight: true, pins: [] },
        { id: 'st-hist', title: 'History reading', minutes: 45, dueDate: '2026-11-13', dueTime: '08:00', priority: 'low', flexible: true, tonight: false, pins: [] },
        { id: 'st-chem', title: 'Chemistry lab report', minutes: 150, dueDate: '2026-11-11', dueTime: '08:00', priority: 'medium', flexible: true, tonight: false, pins: [] },
      ],
    },
    morning: [],
    summaries: [],
  };
}
