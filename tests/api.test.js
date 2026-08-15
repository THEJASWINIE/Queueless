import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🧪 Starting QueueLess Integration Tests...\n');

  try {
    // 1. Initialize Database
    await db.initDb();
    console.log('✅ Database schema initialized successfully');

    // Clean up any existing tokens for a fresh test run
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 2. Test settings retrieval
    const settings = await db.getSettings();
    assert.ok(settings.clinic_name, 'Clinic name should exist in settings');
    assert.strictEqual(settings.doctor_status, 'Free', 'Initial doctor status should be Free');
    console.log('✅ Settings loaded and validated successfully');

    // 3. Test joining a patient
    const patientId1 = 'test-patient-uuid-1';
    const patient1 = await db.addToken({
      id: patientId1,
      name: 'Alice Smith',
      phone: '555-0101',
      source: 'online'
    });

    assert.strictEqual(patient1.id, patientId1, 'Patient ID should match');
    assert.strictEqual(patient1.name, 'Alice Smith', 'Patient name should match');
    assert.strictEqual(patient1.status, 'waiting', 'Patient initial status should be waiting');
    assert.strictEqual(patient1.token_number, 1001, 'First token number of day should be 1001');
    console.log('✅ Patient 1 successfully joined queue');

    // 4. Test duplicate prevention (same phone number)
    const duplicatePatient = await db.addToken({
      id: 'test-patient-uuid-2',
      name: 'Alice Redundant',
      phone: '555-0101', // Same phone
      source: 'online'
    });

    // Should return Alice Smith (1001) instead of creating 1002
    assert.strictEqual(duplicatePatient.id, patientId1, 'Should return existing token for duplicate phone');
    assert.strictEqual(duplicatePatient.token_number, 1001, 'Should return existing token number');
    console.log('✅ Duplicate patient phone check succeeded (prevented collision)');

    // 5. Add a walk-in patient (Patient 2)
    const patientId2 = 'test-patient-uuid-3';
    const patient2 = await db.addToken({
      id: patientId2,
      name: 'Bob Jones',
      phone: '555-0102',
      source: 'walk-in'
    });

    assert.strictEqual(patient2.token_number, 1002, 'Second token number should be 1002');
    console.log('✅ Walk-in Patient 2 successfully joined queue');

    // 6. Test Doctor Call Next
    const calledPatient = await db.callNext();
    assert.ok(calledPatient, 'Called patient should not be null');
    assert.strictEqual(calledPatient.id, patientId1, 'Oldest waiting patient (Alice) should be called');
    assert.strictEqual(calledPatient.status, 'in_progress', 'Called patient status should be in_progress');
    
    // Verify doctor settings updated
    const updatedSettings = await db.getSettings();
    assert.strictEqual(updatedSettings.doctor_status, 'With patient', 'Doctor status should be updated to With patient');
    assert.strictEqual(updatedSettings.current_doctor_token_id, patientId1, 'Current doctor token ID should match called patient');
    console.log('✅ Doctor successfully called first patient');

    // 7. Test Doctor Complete Current Patient
    const completedPatient = await db.completeToken(patientId1);
    assert.strictEqual(completedPatient.status, 'completed', 'Status should be updated to completed');
    assert.ok(completedPatient.completed_at, 'completed_at should be logged');

    // Verify doctor is free again
    const postCompleteSettings = await db.getSettings();
    assert.strictEqual(postCompleteSettings.doctor_status, 'Free', 'Doctor status should reset to Free');
    assert.strictEqual(postCompleteSettings.current_doctor_token_id, null, 'Current doctor token ID should be cleared');
    console.log('✅ Doctor successfully completed treatment');

    // 8. Test Doctor Call Next (for Bob)
    const calledBob = await db.callNext();
    assert.strictEqual(calledBob.id, patientId2, 'Bob should be called');
    
    // Test Mark No Show
    const noShowBob = await db.markNoShow(patientId2);
    assert.strictEqual(noShowBob.status, 'no_show', 'Bob status should be no_show');
    
    // Verify doctor is free again
    const postNoShowSettings = await db.getSettings();
    assert.strictEqual(postNoShowSettings.doctor_status, 'Free', 'Doctor status should reset to Free');
    console.log('✅ Doctor successfully marked patient as no-show');

    // 9. Test Statistics calculation
    const stats = await db.getStats(todayStr);
    assert.strictEqual(stats.total_joined, 2, 'Total joined today should be 2');
    assert.strictEqual(stats.waiting_now, 0, 'Waiting now should be 0');
    assert.strictEqual(stats.completed_today, 1, 'Completed today should be 1');
    console.log('✅ Statistics calculated correctly');

    console.log('\n🎉 ALL DATABASE INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } catch (err) {
    console.error('\n❌ TEST FAILED:');
    console.error(err);
    process.exit(1);
  }
}

runTests();
