import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "500kb" }));

console.log("GEMINI KEY:", process.env.GEMINI_API_KEY ? "Loaded ✅" : "Missing ❌");

// ✅ Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ Create model ONCE
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

const VALID_LANGUAGES = ["javascript", "python", "cpp", "java"];

// Clean JSON response
function extractJSON(raw) {
  let text = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  return text;
}

app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.post("/debug", async (req, res) => {
  const { code, language } = req.body;

  // Validation
  if (!code || typeof code !== "string" || !code.trim()) {
    return res.status(400).json({
      errors: ["No code provided."],
      fixedCode: "",
      explanation: "Send a non-empty `code` field.",
    });
  }

  if (code.length > 20000) {
    return res.status(400).json({
      errors: ["Code too large (max 20,000 characters)."],
      fixedCode: "",
      explanation: "Send a smaller snippet.",
    });
  }

  const lang = VALID_LANGUAGES.includes(language) ? language : "javascript";

  try {
    // ✅ Gemini Prompt
    const prompt = `
You are an expert ${lang} code debugger.

Return ONLY valid JSON:

{
  "errors": [],
  "fixedCode": "",
  "explanation": ""
}

Rules:
- No markdown
- No extra text
- Only JSON

Code:
${code}
`;

    // ✅ Gemini API Call
    const result = await model.generateContent(prompt);
    const raw = await result.response.text();

    const cleaned = extractJSON(raw);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse failed:\n", raw);

      return res.status(422).json({
        errors: ["AI returned invalid format"],
        fixedCode: "",
        explanation: raw,
      });
    }

    res.json({
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      fixedCode: typeof parsed.fixedCode === "string" ? parsed.fixedCode : "",
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
    });

  } catch (error) {
    console.error("Gemini Error:", error);

    res.status(500).json({
      errors: ["API error: " + error.message],
      fixedCode: "",
      explanation: "Check GEMINI_API_KEY and model.",
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});