import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "500kb" }));

console.log("GROQ KEY:", process.env.GROQ_API_KEY ? "Loaded ✅" : "Missing ❌");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const VALID_LANGUAGES = ["javascript", "python", "cpp", "java"];

// Strips markdown code fences and extracts the first {...} JSON block
function extractJSON(raw) {
  // Remove ```json ... ``` or ``` ... ``` fences
  let text = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();

  // Find the first { ... } block in case the model added preamble text
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

  // --- Input validation ---
  if (!code || typeof code !== "string" || !code.trim()) {
    return res.status(400).json({
      errors: ["No code provided."],
      fixedCode: "",
      explanation: "Send a non-empty `code` field in the request body.",
    });
  }

  if (code.length > 20000) {
    return res.status(400).json({
      errors: ["Code too large (max 20,000 characters)."],
      fixedCode: "",
      explanation: "Please send a smaller snippet.",
    });
  }

  const lang = VALID_LANGUAGES.includes(language) ? language : "javascript";

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,           // lower = more deterministic / less hallucination
      max_tokens: 4096,
      response_format: { type: "json_object" }, // forces Groq to return valid JSON
      messages: [
        {
          role: "system",
          content: `You are an expert ${lang} code debugger. 
Analyze the code and return ONLY a JSON object with exactly these keys:
- "errors": array of strings describing each bug found (empty array if none)
- "fixedCode": string with the corrected code (empty string if no fix needed)
- "explanation": string explaining what was wrong and what was fixed

Do not include markdown, comments, or any text outside the JSON object.`,
        },
        {
          role: "user",
          content: `Debug this ${lang} code:\n\n${code}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const cleaned = extractJSON(raw);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse failed. Raw response:\n", raw);
      // Still return something useful instead of a 500
      return res.status(422).json({
        errors: ["The AI returned an unexpected format."],
        fixedCode: "",
        explanation: raw,
      });
    }

    // Normalise shape — ensure all three keys always exist
    res.json({
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      fixedCode: typeof parsed.fixedCode === "string" ? parsed.fixedCode : "",
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
    });

  } catch (error) {
    console.error("Groq Error:", error);

    const status = error?.status ?? 500;
    const message = error?.message ?? "Unknown error";

    res.status(status >= 400 && status < 600 ? status : 500).json({
      errors: ["API error: " + message],
      fixedCode: "",
      explanation: "Check your GROQ_API_KEY and model availability.",
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});
