import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ✅ Check API key
console.log("GROQ KEY:", process.env.GROQ_API_KEY ? "Loaded ✅" : "Missing ❌");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.post("/debug", async (req, res) => {
  const { code } = req.body;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a code debugger. Return ONLY JSON.",
        },
        {
          role: "user",
          content: `
Return ONLY valid JSON:

{
  "errors": [],
  "fixedCode": "",
  "explanation": ""
}

Code:
${code}
`,
        },
      ],
    });

    let text = response.choices[0].message.content;

    // clean response
    text = text.replace(/```json|```/g, "").trim();

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      console.log("RAW RESPONSE:", text);

      return res.json({
        errors: ["Parse error"],
        fixedCode: "",
        explanation: text,
      });
    }

    res.json(parsed);

  } catch (error) {
    console.error("Groq Error:", error);

    res.status(500).json({
      errors: ["API error"],
      fixedCode: "",
      explanation: error.message,
    });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000 🚀");
});