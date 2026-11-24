require('dotenv').config();
const express = require('express');
const path = require('path');
const { Flagsmith } = require('@flagsmith/nodejs');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Flagsmith SDK with experimentation events enabled
const flagsmith = new Flagsmith({
    environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY || 'development_key',
    enableEvents: true,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to retrieve the assigned onboarding variant for an identified user
app.get('/api/onboarding', async (req, res) => {
    const userId = req.query.userId || `user_${Math.random().toString(36).substring(2, 9)}`;

    try {
        // getExperimentFlag automatically records $flag_exposure in Flagsmith
        const flag = await flagsmith.getExperimentFlag('onboarding_flow', userId);
        const variant = flag && flag.value ? flag.value : 'control';

        res.json({
            userId,
            variant,
            enabled: flag ? flag.enabled : true,
        });
    } catch (err) {
        console.error('Error fetching experiment flag:', err.message);
        res.status(500).json({ error: err.message, fallbackVariant: 'control', userId });
    }
});

// API endpoint to record conversion when user completes onboarding
app.post('/api/conversion', async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        // Track the conversion event in Flagsmith Experimentation
        flagsmith.trackEvent('completed_onboarding', {
            identifier: userId,
        });

        // Ensure events are pushed to Flagsmith
        await flagsmith.flushEvents();

        res.json({ success: true, message: 'Conversion recorded for ' + userId });
    } catch (err) {
        console.error('Error tracking conversion event:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const server = app.listen(PORT, () => {
    console.log(`🚀 SaaS Onboarding Demo running at http://localhost:${PORT}`);
});

// Graceful shutdown: flush any buffered events before exiting
async function gracefulShutdown() {
    console.log('\nShutting down server and flushing remaining Flagsmith events...');
    try {
        await flagsmith.close();
    } catch (err) {
        console.error('Error closing Flagsmith client:', err);
    }
    server.close(() => {
        console.log('Server closed cleanly.');
        process.exit(0);
    });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
