require('dotenv').config();
const { Flagsmith } = require('@flagsmith/nodejs');

const TOTAL_USERS = 250;
const FLAG_NAME = 'onboarding_flow';
const EVENT_NAME = 'completed_onboarding';

async function runSimulation() {
    const environmentKey = process.env.FLAGSMITH_ENVIRONMENT_KEY;
    if (!environmentKey || environmentKey === 'your_environment_key_here') {
        console.error('❌ Error: FLAGSMITH_ENVIRONMENT_KEY is not configured in .env');
        console.error('Please set your server-side environment key first.');
        process.exit(1);
    }

    console.log(`=======================================================`);
    console.log(`🚀 Starting Flagsmith Experimentation Traffic Simulation`);
    console.log(`👥 Target Users: ${TOTAL_USERS}`);
    console.log(`🚩 Experiment Flag: "${FLAG_NAME}"`);
    console.log(`🎯 Conversion Metric Event: "${EVENT_NAME}"`);
    console.log(`=======================================================\n`);

    const flagsmith = new Flagsmith({
        environmentKey: environmentKey,
        enableEvents: true,
    });

    let counts = {
        control: { exposures: 0, conversions: 0 },
        guided_tour: { exposures: 0, conversions: 0 },
        other: { exposures: 0, conversions: 0 }
    };

    const startTime = Date.now();

    for (let i = 1; i <= TOTAL_USERS; i++) {
        const userId = `sim_user_${String(i).padStart(4, '0')}_${Math.random().toString(36).substring(2, 6)}`;

        try {
            // 1. Evaluate flag and record exposure
            const flag = await flagsmith.getExperimentFlag(FLAG_NAME, userId);
            const variant = flag && flag.value ? flag.value : 'control';

            // Determine conversion based on statistical probabilities
            // Control conversion baseline ~24%, Guided Tour conversion ~54%
            let converted = false;
            if (variant === 'guided_tour' || variant === 'variation_b') {
                counts.guided_tour.exposures++;
                converted = Math.random() < 0.54;
                if (converted) counts.guided_tour.conversions++;
            } else if (variant === 'control') {
                counts.control.exposures++;
                converted = Math.random() < 0.24;
                if (converted) counts.control.conversions++;
            } else {
                counts.other.exposures++;
                converted = Math.random() < 0.30;
                if (converted) counts.other.conversions++;
            }

            // 2. Track conversion event if user converted
            if (converted) {
                flagsmith.trackEvent(EVENT_NAME, {
                    identifier: userId,
                });
            }

            if (i % 25 === 0 || i === TOTAL_USERS) {
                console.log(`Processed ${i}/${TOTAL_USERS} users... (Control: ${counts.control.exposures} exp, ${counts.control.conversions} conv | Guided: ${counts.guided_tour.exposures} exp, ${counts.guided_tour.conversions} conv)`);
            }
        } catch (err) {
            console.error(`Failed on user ${userId}:`, err.message);
        }
    }

    console.log('\n📊 Flushing buffered events and closing Flagsmith client...');
    await flagsmith.close();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Simulation finished in ${duration}s!`);
    console.log(`-------------------------------------------------------`);
    console.log(`Control:     ${counts.control.conversions}/${counts.control.exposures} conversions (${counts.control.exposures ? ((counts.control.conversions/counts.control.exposures)*100).toFixed(1) : 0}%)`);
    console.log(`Guided Tour: ${counts.guided_tour.conversions}/${counts.guided_tour.exposures} conversions (${counts.guided_tour.exposures ? ((counts.guided_tour.conversions/counts.guided_tour.exposures)*100).toFixed(1) : 0}%)`);
    console.log(`-------------------------------------------------------`);
}

runSimulation().catch(err => {
    console.error('Fatal simulation error:', err);
    process.exit(1);
});
