import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const apiKey = process.env.GEMINI_API_KEY;
const client = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });

const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

for (const model of models) {
  try {
    const res = await client.models.generateContent({
      model,
      contents: 'Respond {"status":"ok"} in JSON format',
      config: { responseMimeType: 'application/json' }
    });
    console.log(`[SUCCESS] ${model}:`, res.text.trim());
  } catch (err) {
    console.error(`[FAIL] ${model}:`, err.message);
  }
}
