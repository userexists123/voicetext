const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
const axios = require('axios');
const { exec } = require('child_process');
const gTTS = require('gtts');
const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const { TranslationServiceClient } = require('@google-cloud/translate').v3;

const translationClient = new TranslationServiceClient({
  keyFilename: 'neon-operator-466218-a8-ab8658136bde.json'
});

// Google Speech client
const speechClient = new speech.SpeechClient({
  keyFilename: 'neon-operator-466218-a8-ab8658136bde.json'
});

// Google Text-to-Speech client
const ttsClient = new textToSpeech.TextToSpeechClient({
  keyFilename: 'neon-operator-466218-a8-ab8658136bde.json'
});

app.post('/api/converse', upload.single('audio'), async (req, res) => {
  const originalPath = req.file.path;
  const convertedPath = `${originalPath}.mp3`;
  console.log("reached her with voice")

  try {
    // Convert to mp3 (WebM → MP3)
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -i ${originalPath} -ar 44100 -ac 2 -b:a 192k ${convertedPath}`, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });

    // Read audio and encode to base64
    const audioBytes = fs.readFileSync(convertedPath).toString('base64');

    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: 'MP3',
        sampleRateHertz: 44100,
        languageCode: 'ml-IN', // Malayalam
      },
    };

    const [response] = await speechClient.recognize(request);
    const userText = response.results.map(r => r.alternatives[0].transcript).join('\n');

    console.log("User said using gtts:", userText);

    // Generate reply using GPT in Malayalam
    const chatRes = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: "system",
            content: "You are a friendly and informal assistant who always responds in English, even if the user speaks in Malayalam. Keep your tone conversational, warm, like a Cognitive Behavioural Therapist. Add casual greetings, everyday references, and use simple English.Always respond in simple, casual English that can be easily translated into Malayalam. Do not use idioms, slang, or cultural references that won’t make sense in Malayalam. Reply based on the user's mood. Also, if the user is really serious about something, reply accordingly. The user may have borderline personality disorder or depression. expect that, but try to keep things cool."
,
          },
          { role: 'user', content: userText },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const botTextEnglish = chatRes.data.choices[0].message.content;
    console.log("GPT replied (EN):", botTextEnglish);

    // Translate English → Malayalam using Google Translate
    const [translationResponse] = await translationClient.translateText({
      parent: `projects/${process.env.GOOGLE_PROJECT_ID}/locations/global`,
      contents: [botTextEnglish],
      mimeType: 'text/plain',
      sourceLanguageCode: 'en',
      targetLanguageCode: 'ml',
    });

    const botText = translationResponse.translations[0].translatedText;
    console.log("Translated (ML):", botText);

    // Convert bot reply to speech (Malayalam)
    const requestTTS = {
      input: { text: botText },
      voice: { languageCode: 'ml-IN', name: 'ml-IN-Wavenet-A' }, // Natural Malayalam voice
      audioConfig: { audioEncoding: 'MP3' },
    };

    const [responseTTS] = await ttsClient.synthesizeSpeech(requestTTS);

    // Save audio to file
    const outputPath = `bot_${Date.now()}.mp3`;
    fs.writeFileSync(outputPath, responseTTS.audioContent, 'binary');

    res.sendFile(outputPath, { root: __dirname }, () => {
      fs.unlinkSync(originalPath);
      fs.unlinkSync(convertedPath);
      fs.unlinkSync(outputPath);
    });

  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to process voice input' });

    if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
    if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath);
  }
});

app.listen(5000, () => console.log('✅ Server running on http://localhost:5000'));
