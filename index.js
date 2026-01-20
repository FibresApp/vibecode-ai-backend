// -----------------------------
// Progress Photo Analyzer API
// -----------------------------

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Remove this line if using Node 18+ (fetch is built-in)

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// -----------------------------
// Health check
// -----------------------------
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Progress Photo Analyzer API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// -----------------------------
// Analyze single photo
// -----------------------------
app.post('/api/analyze-photo', async (req, res) => {
  try {
    const apiKey = process.env.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const { imageBase64, mimeType, previousImageBase64, previousMimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
    const content = [];

    if (previousImageBase64) {
      const prevDataUrl = `data:${previousMimeType || 'image/jpeg'};base64,${previousImageBase64}`;
      content.push({
        type: 'text',
        text: `
You are a fitness progress analyzer. Compare these two progress photos (first is BEFORE, second is AFTER/current). 
For each body part (shoulders, arms, chest, back, core, legs), provide a brief observation.
Respond ONLY with JSON, e.g.:

{
  "shoulders": "...",
  "arms": "...",
  "chest": "...",
  "back": "...",
  "core": "...",
  "legs": "...",
  "overall": "..."
}`
      });
      content.push({ type: 'image_url', image_url: { url: prevDataUrl } });
      content.push({ type: 'image_url', image_url: { url: dataUrl } });
    } else {
      content.push({
        type: 'text',
        text: `
You are a fitness progress analyzer. Analyze this baseline progress photo.
For each body part (shoulders, arms, chest, back, core, legs), provide a brief observation.
Respond ONLY with JSON, e.g.:

{
  "shoulders": "...",
  "arms": "...",
  "chest": "...",
  "back": "...",
  "core": "...",
  "legs": "...",
  "overall": "..."
}`
      });
      content.push({ type: 'image_url', image_url: { url: dataUrl } });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content }],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      console.error('OpenAI error:', await response.text());
      return res.status(500).json({ error: 'Failed to analyze photo' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: 'Invalid AI response' });
    }

    res.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -----------------------------
// Compare two photos with focus areas
// -----------------------------
app.post('/api/compare-photos', async (req, res) => {
  try {
    const apiKey = process.env.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const { beforeBase64, beforeMime, afterBase64, afterMime, beforePose, afterPose } = req.body;

    if (!beforeBase64 || !afterBase64) {
      return res.status(400).json({ error: 'Both images required' });
    }

    const beforeDataUrl = `data:${beforeMime || 'image/jpeg'};base64,${beforeBase64}`;
    const afterDataUrl = `data:${afterMime || 'image/jpeg'};base64,${afterBase64}`;

    const hasFrontShot = beforePose === 'front' || afterPose === 'front';

    const prompt = `
Compare these fitness progress photos. First is BEFORE, second is AFTER.
For each muscle group (Shoulders, Arms, Chest, Core, Back, Legs):
- Provide "winner": "before", "after", or "same"
- Provide "observation": a short note about progress

Also provide:
- overallSummary: short summary of overall progress
- recommendations: an array of objects with "text" and "priority" ("high", "medium", "low")
- focusAreas: an array of muscle groups the user should focus on next (e.g., ["Chest", "Back"])

Return ONLY JSON with the following exact structure:
{
  "muscles": [
    { "name": "Shoulders", "winner": "...", "observation": "..." },
    { "name": "Arms", "winner": "...", "observation": "..." },
    { "name": "Chest", "winner": "...", "observation": "..." },
    { "name": "Core", "winner": "...", "observation": "..." },
    { "name": "Back", "winner": "...", "observation": "..." },
    { "name": "Legs", "winner": "...", "observation": "..." }
  ],
  "overallSummary": "...",
  "recommendations": [
    { "text": "...", "priority": "high/medium/low" }
  ],
  "focusAreas": ["..."],
  "daysApart": 0
}
${hasFrontShot ? 'If possible, provide a bodyFat estimate range in overallSummary.' : ''}
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: beforeDataUrl } },
              { type: 'image_url', image_url: { url: afterDataUrl } }
            ]
          }
        ],
        max_tokens: 1600
      })
    });

    if (!response.ok) {
      console.error('OpenAI error:', await response.text());
      return res.status(500).json({ error: 'Failed to compare photos' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: 'Invalid AI response' });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Ensure daysApart is always included
    parsed.daysApart = 0;

    // Ensure focusAreas exists
    if (!parsed.focusAreas) parsed.focusAreas = [];

    res.json(parsed);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -----------------------------
// Start server
// -----------------------------
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
