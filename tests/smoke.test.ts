import { expect, test } from 'bun:test';

import {
  AFTStatus,
  generateRequestNumber,
  getRoleDisplayName,
  UserRole,
} from '../lib/database-bun';

// Placeholder smoke tests so `bun test` exits 0 in CI. Real tests should
// be added next to the modules they cover (e.g. `lib/security.test.ts`).

test('UserRole enumerates the eight production roles', () => {
  expect(Object.values(UserRole).sort()).toEqual([
    'admin',
    'approver',
    'cpso',
    'dao',
    'dta',
    'media_custodian',
    'requestor',
    'sme',
  ]);
});

test('AFTStatus contains the canonical lifecycle states', () => {
  // Sample of states that drive role gating in the routes.
  expect(AFTStatus.DRAFT).toBe('draft');
  expect(AFTStatus.PENDING_APPROVER).toBe('pending_approver');
  expect(AFTStatus.PENDING_CPSO).toBe('pending_cpso');
  expect(AFTStatus.PENDING_DTA).toBe('pending_dta');
  expect(AFTStatus.PENDING_SME_SIGNATURE).toBe('pending_sme_signature');
  expect(AFTStatus.PENDING_MEDIA_CUSTODIAN).toBe('pending_media_custodian');
  expect(AFTStatus.COMPLETED).toBe('completed');
});

test('generateRequestNumber returns the expected AFT- prefix shape', () => {
  const n = generateRequestNumber();
  expect(n).toMatch(/^AFT-/);
  expect(n.length).toBeGreaterThan(4);
});

test('getRoleDisplayName resolves each role to a non-empty label', () => {
  for (const role of Object.values(UserRole)) {
    const label = getRoleDisplayName(role);
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  }
});
