require('dotenv').config();
const express = require('express');
const path = require('path');
const { execSync } = require('child_process');
const { Flagsmith } = require('@flagsmith/nodejs');

const app = express();
const PORT = process.env.PORT || 3000;
const ENVIRONMENT_KEY = process.env.FLAGSMITH_ENVIRONMENT_KEY;
const ENV_ID = 'esMZQYfcANsHcmozTaXb6F';
const EXP_ID = '426';

// Initialize Flagsmith SDK with experimentation events enabled
const flagsmith = new Flagsmith({
    environmentKey: ENVIRONMENT_KEY,
    enableEvents: true,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Retrieve active experiment flag for an identified user (records exposure)
app.get('/api/onboarding', async (req, res) => {
    const userId = req.query.userId || `user_${Math.random().toString(36).substring(2, 9)}`;

    try {
        // getExperimentFlag automatically logs $flag_exposure in Flagsmith
        const flag = await flagsmith.getExperimentFlag('onboarding_flow', userId);
        const variant = flag && flag.value ? flag.value : 'control';

        res.json({
            userId,
            variant,
            enabled: flag ? flag.enabled : true,
            experimentId: EXP_ID,
            featureName: 'onboarding_flow'
        });
    } catch (err) {
        console.error('Error fetching experiment flag:', err.message);
        res.status(500).json({ error: err.message, fallbackVariant: 'control', userId });
    }
});

// Track conversion event when user completes workflow
app.post('/api/conversion', async (req, res) => {
    const { userId, action } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        // Track the conversion event
        flagsmith.trackEvent('completed_onboarding', {
            identifier: userId,
            metadata: { action: action || 'export_scaffold' }
        });

        // Ensure events are immediately flushed to Flagsmith events ingestion API
        await flagsmith.flushEvents();

        console.log(`[Flagsmith] Recorded conversion for user: ${userId}`);
        res.json({ success: true, message: `Conversion recorded for ${userId}`, event: 'completed_onboarding' });
    } catch (err) {
        console.error('Error tracking conversion event:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Fetch live experiment analytics & Bayesian statistics from Flagsmith
app.get('/api/experiment-stats', async (req, res) => {
    try {
        const cmd = `flagsmith api api/v1/environments/${ENV_ID}/experiments/${EXP_ID}/results/ --json`;
        const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        const data = JSON.parse(output);

        const metricData = data?.results?.payload?.metrics?.[0] || null;
        res.json({
            success: true,
            asOf: data?.results?.as_of,
            metricData: metricData,
            dashboardUrl: `https://app.flagsmith.com/project/55855/environment/${ENV_ID}/experiments/${EXP_ID}`
        });
    } catch (err) {
        console.error('Error querying Flagsmith experiment results:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Trigger on-demand simulated user batch
app.post('/api/simulate-batch', async (req, res) => {
    const count = parseInt(req.body.count || 50, 10);
    console.log(`[Simulation] Simulating batch of ${count} users...`);

    let controlCount = 0;
    let controlConv = 0;
    let guidedCount = 0;
    let guidedConv = 0;

    for (let i = 0; i < count; i++) {
        const simId = `sim_web_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
        try {
            const flag = await flagsmith.getExperimentFlag('onboarding_flow', simId);
            const variant = flag && flag.value ? flag.value : 'control';

            let convert = false;
            if (variant === 'guided_tour' || variant === 'variation_b') {
                guidedCount++;
                convert = Math.random() < 0.55;
                if (convert) guidedConv++;
            } else {
                controlCount++;
                convert = Math.random() < 0.25;
                if (convert) controlConv++;
            }

            if (convert) {
                flagsmith.trackEvent('completed_onboarding', { identifier: simId });
            }
        } catch (e) {
            console.error('Simulation error for user:', e.message);
        }
    }

    await flagsmith.flushEvents();

    res.json({
        success: true,
        simulated: count,
        results: {
            control: { exposures: controlCount, conversions: controlConv },
            guided_tour: { exposures: guidedCount, conversions: guidedConv }
        }
    });
});

const server = app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 PulseForge AI Platform (Flagsmith Experimentation Demo)`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
    console.log(`🎯 Active Experiment: Onboarding Flow (ID: ${EXP_ID})`);
    console.log(`🚩 Multivariate Flag: onboarding_flow [control | guided_tour]`);
    console.log(`======================================================\n`);
});

// Graceful shutdown
async function gracefulShutdown() {
    console.log('\nFlushing remaining Flagsmith events...');
    try {
        await flagsmith.close();
    } catch (err) {
        console.error('Error closing Flagsmith client:', err);
    }
    server.close(() => {
        console.log('Server terminated cleanly.');
        process.exit(0);
    });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
