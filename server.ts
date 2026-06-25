import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser limits increased for rich log analysis
app.use(express.json({ limit: "20mb" }));

// Initialize GoogleGenAI client lazy loaded/safely
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not defined in the environment. AI-powered file parsing will not be functional.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// 1. API Route: AI-powered parser endpoint using Gemini-3.5-flash
app.post("/api/analyze-file", async (req, res) => {
  try {
    const { fileText, fileName } = req.body;
    if (!fileText || fileText.trim().length === 0) {
      return res.status(400).json({ error: "Missing file contents." });
    }

    const ai = getAiClient();
    
    // Check if the API key exists before making the request
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Gemini API key is not configured in this workspace. Please add GEMINI_API_KEY under Settings > Secrets.",
      });
    }

    const prompt = `You are an expert scientific data parser for the Ooty Cosmic Ray Laboratory Scintillator array.
Analyze the following raw log, unstructured file content, or text copy-paste named "${fileName || "report.txt"}".
Extract the numerical series representing PMT detector readings.
Your output must be a clean JSON array of detectors matching the schema requested.

If the file lists series data for metrics like event rate, ADC, TDC, pedestal, or gain:
- Map each series of numbers into the corresponding array.
- Make sure to keep the order of values in the arrays corresponding to their measurement timelines.
- Ensure all numbers are floating-point values or integers.
- If some values (e.g. TDC or gain) are missing, populate them with standard nominal values or zeros if appropriate.

Raw text content:
${fileText}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are a precise JSON extractor. Output only valid JSON that conforms exactly to the requested schema. Do not include any explanation or markdown formatting.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "List of parsed detector records",
          items: {
            type: Type.OBJECT,
            properties: {
              detector_id: {
                type: Type.STRING,
                description: "Unique numeric ID of the detector, e.g. '001', '002'"
              },
              event_rate: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "Array of trigger counts or event rates in Hz over the time series"
              },
              adc: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "Array of ADC peak or mean channel values"
              },
              tdc: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "Array of TDC time-of-flight values"
              },
              pedestal_mean: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "Array of baseline pedestal mean voltages"
              },
              pedestal_rms: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "Array of pedestal noise RMS voltages"
              },
              gain: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "Array of channel gain coefficients"
              }
            },
            required: [
              "detector_id",
              "event_rate",
              "adc",
              "tdc",
              "pedestal_mean",
              "pedestal_rms",
              "gain"
            ]
          }
        }
      }
    });

    const jsonText = response.text || "[]";
    const parsedData = JSON.parse(jsonText);
    
    return res.json({
      success: true,
      detectors: parsedData,
      extractionNotes: [
        `File parsed successfully using Gemini 3.5 Flash.`,
        `Identified ${parsedData.length} unique detector records from file metrics.`
      ]
    });

  } catch (err: any) {
    console.error("Gemini Parse Error:", err);
    return res.status(500).json({
      error: "Failed to parse document using Gemini AI.",
      details: err.message || err
    });
  }
});

// 2. Vite and Static Asset Pipeline Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Running in DEVELOPMENT mode. Mounting Vite dev middleware.");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Running in PRODUCTION mode. Serving prebuilt static assets.");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cosmic Ray Laboratory Analyzer running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
