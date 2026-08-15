import assert from 'assert';
import * as db from '../db.js';

async function runBillingTests() {
  console.log('🧪 Starting QueueLess Billing & Trial System Tests...\n');

  try {
    // 1. Initialize DB
    await db.initDb();
    console.log('✅ Database schema initialized');

    // Reset trial settings to fresh state
    const todayStr = new Date().toISOString().split('T')[0];
    await db.updateSetting('trial_start_date', todayStr);
    await db.updateSetting('subscription_status', 'trial');
    await db.updateSetting('subscription_key', null);

    // 2. Validate fresh trial state
    const settingsFresh = await db.getSettings();
    assert.strictEqual(settingsFresh.subscription_status, 'trial', 'Should initially be in trial status');
    assert.strictEqual(settingsFresh.is_expired, false, 'Fresh trial should not be expired');
    assert.strictEqual(settingsFresh.days_remaining, 30, 'Remaining days should be 30 on day one');
    console.log('✅ Fresh trial validation passed (30 days remaining, not expired)');

    // 3. Simulate trial expiration (move start date 31 days back)
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
    const expiredDateStr = thirtyOneDaysAgo.toISOString().split('T')[0];
    
    await db.updateSetting('trial_start_date', expiredDateStr);
    
    const settingsExpired = await db.getSettings();
    assert.strictEqual(settingsExpired.is_expired, true, 'Trial should be expired after 31 days');
    assert.strictEqual(settingsExpired.days_remaining, 0, 'Remaining days should be 0');
    console.log('✅ Trial expiration validation passed (Expired after 31 days, 0 days remaining)');

    // 4. Test Subscription Activation
    const testLicenseKey = 'QL-ACTIVE-8899-CLINIC';
    await db.updateSetting('subscription_status', 'active');
    await db.updateSetting('subscription_key', testLicenseKey);

    const settingsActivated = await db.getSettings();
    assert.strictEqual(settingsActivated.subscription_status, 'active', 'Status should be active after subscribing');
    assert.strictEqual(settingsActivated.is_expired, false, 'Active subscription should not be expired even if past 30 days');
    assert.strictEqual(settingsActivated.subscription_key, testLicenseKey, 'Subscription key should be saved');
    console.log('✅ Subscription activation validation passed (Status active, unblocked)');

    // Cleanup: Reset back to fresh trial
    await db.updateSetting('trial_start_date', todayStr);
    await db.updateSetting('subscription_status', 'trial');
    await db.updateSetting('subscription_key', null);

    console.log('\n🎉 ALL BILLING AND SUBSCRIPTION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } catch (err) {
    console.error('\n❌ TEST FAILED:');
    console.error(err);
    process.exit(1);
  }
}

runBillingTests();
