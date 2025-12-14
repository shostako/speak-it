// speak-it API Proxy Server
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// Google TTS API Key from environment variable
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;

if (!GOOGLE_TTS_API_KEY) {
  console.error('ERROR: GOOGLE_TTS_API_KEY environment variable is not set');
  process.exit(1);
}

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed === '*')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get available voices
app.get('/api/voices', async (req, res) => {
  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?key=${GOOGLE_TTS_API_KEY}&languageCode=ja-JP`
    );
    const data = await response.json();

    if (data.error) {
      return res.status(data.error.code || 500).json({ error: data.error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Voices API error:', error);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

// Synthesize speech
app.post('/api/synthesize', async (req, res) => {
  try {
    const { text, ssml, voiceName, speakingRate = 1.0 } = req.body;

    if ((!text && !ssml) || !voiceName) {
      return res.status(400).json({ error: 'text or ssml, and voiceName are required' });
    }

    // SSMLが提供された場合はSSMLを使用、なければtextを使用
    const input = ssml ? { ssml } : { text };

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          voice: {
            languageCode: 'ja-JP',
            name: voiceName
          },
          audioConfig: {
            audioEncoding: 'LINEAR16',
            speakingRate,
            sampleRateHertz: 24000
          }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(data.error.code || 500).json({ error: data.error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Synthesize API error:', error);
    res.status(500).json({ error: 'Failed to synthesize speech' });
  }
});

app.listen(PORT, () => {
  console.log(`speak-it API server running on port ${PORT}`);
});
